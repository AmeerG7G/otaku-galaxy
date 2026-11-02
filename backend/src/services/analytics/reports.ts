import { config } from '../../config/index.js';
import { db } from '../../database/pool.js';
import {
  ANALYTICS_DEFINITIONS_VERSION,
  TREND_MIN_UNITS,
  absoluteChange,
  percentChange,
} from '../../domain/analyticsDefinitions.js';
import { LOW_STOCK_THRESHOLD } from '../../repositories/statsRepo.js';
import { pushStatus } from '../push/index.js';
import { addDays, addMonths, daysBetween, monthStart, monthsBetween } from './calendar.js';
import { analyticsAggregator } from './aggregator.js';

/**
 * تقارير «التحليلات» — قراءةٌ من الملخّصات وعرضَي النطاق وحدها.
 *
 * [CRITICAL]
 *   • لا شيء هنا يقرأ `orders`/`users` مباشرةً (حارس المصدر في `analytics-guards`).
 *   • حقول الربح/التكلفة لا تُبنى إلا لمسؤولٍ أعلى (`includeProfit`) — تُحذف من
 *     الردّ كلياً لغيره، لا تُرسل `null`.
 *   • الربح متاح فقط حين تحمل **كل** بنود الطلبات المكتملة في النافذة لقطة تكلفة.
 *   • الجنس فئتان فقط؛ شذوذ «بلا جنس» لا يُعرض ولا يُلمَّح إليه (D5).
 *   • المقارنة بنافذتين متساويتين؛ إن كان الشهر الأخير جارياً فالمقارنة «حتى
 *     اليوم نفسه» من الشهر المقابل، ويُعلَّم المدى `partial`.
 */

const TZ = () => config.storeTimezone;

export type CompareMode = 'none' | 'previous' | 'year';

export interface Window {
  /** أول يوم (شامل). */
  from: string;
  /** أول يومٍ بعد النافذة (غير شامل). */
  to: string;
  months: string[];
  partial: boolean;
}

interface Kpi {
  current: number | null;
  previous: number | null;
  delta: number | null;
  percent: number | null;
}

function kpi(current: number | null, previous: number | null | undefined): Kpi {
  const prev = previous === undefined ? null : previous;
  return { current, previous: prev, delta: absoluteChange(current, prev), percent: percentChange(current, prev) };
}

const num = (value: string | number | null | undefined) => (value === null || value === undefined ? 0 : Number(value));
const ratio = (a: number, b: number, digits = 0) => {
  if (b === 0) return null;
  const factor = 10 ** digits;
  return Math.round((a / b) * factor) / factor;
};

/** نافذة الأشهر [from..to] — مقتطعةٌ عند نهاية اليوم إن شملت الشهر الجاري. */
export function monthWindow(fromMonth: string, toMonth: string, today: string): Window {
  const from = `${fromMonth}-01`;
  const naturalEnd = addMonths(`${toMonth}-01`, 1);
  const tomorrow = addDays(today, 1);
  const partial = naturalEnd > tomorrow && from <= today;
  return {
    from,
    to: partial ? tomorrow : naturalEnd,
    months: monthsBetween(from, `${toMonth}-01`),
    partial,
  };
}

/** نافذة المقارنة: إزاحة بعدد أشهر المدى (أو ١٢)، وبالطول نفسه إن كانت الأصلية جزئية. */
export function comparisonWindow(window: Window, mode: CompareMode): Window | null {
  if (mode === 'none') return null;
  const shift = mode === 'year' ? 12 : window.months.length;
  const from = addMonths(window.from, -shift);
  const lastMonth = window.months[window.months.length - 1]!;
  const shiftedLastMonth = addMonths(lastMonth, -shift);
  let to = addMonths(addMonths(lastMonth, 1), -shift);
  if (window.partial) {
    const elapsed = daysBetween(lastMonth, addDays(window.to, -1)).length;
    const candidate = addDays(shiftedLastMonth, elapsed);
    to = candidate < to ? candidate : to;
  }
  return { from, to, months: monthsBetween(from, shiftedLastMonth), partial: false };
}

async function salesTotals(window: Window) {
  const { rows } = await db.query<Record<string, string | null>>(
    `SELECT COALESCE(sum(orders_placed), 0) AS placed, COALESCE(sum(orders_completed), 0) AS completed,
            COALESCE(sum(orders_rejected), 0) AS rejected, COALESCE(sum(orders_rejected_after_dispatch), 0) AS rejected_after_dispatch,
            COALESCE(sum(gross_sales), 0) AS gross, COALESCE(sum(product_discounts), 0) AS discounts,
            COALESCE(sum(birthday_discounts), 0) AS birthday, COALESCE(sum(loyalty_discounts), 0) AS loyalty,
            COALESCE(sum(sales_revenue), 0) AS revenue, COALESCE(sum(delivery_promo_given), 0) AS delivery_promo,
            COALESCE(sum(units_sold), 0) AS units, max(max_order_value) AS max_order,
            COALESCE(sum(item_lines), 0) AS lines, COALESCE(sum(item_lines_with_cost), 0) AS lines_cost,
            COALESCE(sum(cogs), 0) AS cogs, COALESCE(sum(item_lines_with_list_price), 0) AS lines_list,
            COALESCE(sum(promo_markdown), 0) AS markdown
       FROM analytics_daily_sales WHERE stat_date >= $1::date AND stat_date < $2::date`,
    [window.from, window.to],
  );
  const r = rows[0]!;
  return {
    ordersPlaced: num(r.placed),
    ordersCompleted: num(r.completed),
    ordersRejected: num(r.rejected),
    ordersRejectedAfterDispatch: num(r.rejected_after_dispatch),
    grossSales: num(r.gross),
    productDiscounts: num(r.discounts),
    birthdayDiscounts: num(r.birthday),
    loyaltyDiscounts: num(r.loyalty),
    salesRevenue: num(r.revenue),
    deliveryPromoGiven: num(r.delivery_promo),
    unitsSold: num(r.units),
    maxOrderValue: r.max_order === null ? null : num(r.max_order),
    itemLines: num(r.lines),
    itemLinesWithCost: num(r.lines_cost),
    cogs: num(r.cogs),
    itemLinesWithListPrice: num(r.lines_list),
    promoMarkdown: num(r.markdown),
  };
}

type SalesTotals = Awaited<ReturnType<typeof salesTotals>>;

/** الربح — متاحٌ فقط بتغطيةٍ كاملة، وإلا «غير متاح» مع التغطية (لا رقمٌ جزئي). */
function profitOf(totals: SalesTotals) {
  const available = totals.itemLines > 0 && totals.itemLinesWithCost === totals.itemLines;
  const grossProfit = available ? Math.round((totals.salesRevenue - totals.cogs) * 100) / 100 : null;
  return {
    available,
    grossProfit,
    cogs: available ? totals.cogs : null,
    marginPercent: available && grossProfit !== null ? ratio(grossProfit * 100, totals.salesRevenue, 1) : null,
    coverage: { itemLines: totals.itemLines, itemLinesWithCost: totals.itemLinesWithCost },
  };
}

async function monthlyCustomers(month: string) {
  const { rows } = await db.query<Record<string, number | null>>(
    `SELECT customers_end, customers_male_end, customers_female_end, new_customers, new_customers_male,
            new_customers_female, buyers, buyers_male, buyers_female, new_buyers, returning_buyers,
            repeat_buyers, active_customers
       FROM analytics_monthly_customers WHERE month = $1::date`,
    [month],
  );
  return rows[0] ?? null;
}

async function newCustomersSum(window: Window) {
  const { rows } = await db.query<{ n: string | null }>(
    `SELECT sum(new_customers)::text AS n FROM analytics_monthly_customers WHERE month = ANY($1::date[])`,
    [window.months],
  );
  return num(rows[0]?.n);
}

async function processingAtEnd(month: string) {
  const { rows } = await db.query<{ processing_at_end: number }>(
    'SELECT processing_at_end FROM analytics_monthly_orders WHERE month = $1::date',
    [month],
  );
  return rows[0]?.processing_at_end ?? null;
}

async function windowKpis(window: Window) {
  const totals = await salesTotals(window);
  const lastMonth = window.months[window.months.length - 1]!;
  const single = window.months.length === 1;
  const customers = await monthlyCustomers(lastMonth);
  return {
    totals,
    newCustomers: await newCustomersSum(window),
    customersEnd: customers?.customers_end ?? null,
    customersMaleEnd: customers?.customers_male_end ?? null,
    customersFemaleEnd: customers?.customers_female_end ?? null,
    // أعدادٌ مميَّزة لا تُجمع عبر الأشهر — تُعرض لمدى شهرٍ واحد فقط.
    buyers: single ? (customers?.buyers ?? null) : null,
    activeCustomers: single ? (customers?.active_customers ?? null) : null,
    processingAtEnd: await processingAtEnd(lastMonth),
  };
}

export async function today(): Promise<string> {
  return analyticsAggregator.today(db, TZ());
}

export const analyticsReports = {
  async overview(input: { from: string; to: string; compare: CompareMode; includeProfit: boolean }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const compareWindow = comparisonWindow(window, input.compare);
    const current = await windowKpis(window);
    const previous = compareWindow ? await windowKpis(compareWindow) : null;
    const c = current.totals;
    const p = previous?.totals;
    const aov = (t: SalesTotals) => ratio(t.salesRevenue, t.ordersCompleted);
    const upo = (t: SalesTotals) => ratio(t.unitsSold, t.ordersCompleted, 2);
    return {
      range: { from: input.from, to: input.to, window, partial: window.partial, asOf: day },
      compare: compareWindow ? { mode: input.compare, window: compareWindow } : null,
      kpis: {
        salesRevenue: kpi(c.salesRevenue, p?.salesRevenue),
        grossSales: kpi(c.grossSales, p?.grossSales),
        productDiscounts: kpi(c.productDiscounts, p?.productDiscounts),
        ordersPlaced: kpi(c.ordersPlaced, p?.ordersPlaced),
        ordersCompleted: kpi(c.ordersCompleted, p?.ordersCompleted),
        ordersRejected: kpi(c.ordersRejected, p?.ordersRejected),
        averageOrderValue: kpi(aov(c), p ? aov(p) : null),
        highestOrderValue: kpi(c.maxOrderValue, p?.maxOrderValue ?? null),
        unitsSold: kpi(c.unitsSold, p?.unitsSold),
        unitsPerOrder: kpi(upo(c), p ? upo(p) : null),
        newCustomers: kpi(current.newCustomers, previous?.newCustomers),
        buyers: kpi(current.buyers, previous?.buyers ?? null),
        activeCustomers: kpi(current.activeCustomers, previous?.activeCustomers ?? null),
        customersMale: kpi(current.customersMaleEnd, previous?.customersMaleEnd ?? null),
        customersFemale: kpi(current.customersFemaleEnd, previous?.customersFemaleEnd ?? null),
        processingAtEnd: kpi(current.processingAtEnd, previous?.processingAtEnd ?? null),
      },
      ...(input.includeProfit
        ? { profit: { current: profitOf(c), previous: p ? profitOf(p) : null } }
        : {}),
    };
  },

  /** مقارنة شهرين بعينهما (مثلاً سبتمبر ٢٠٢٦ مقابل أغسطس ٢٠٢٦). */
  async compare(input: { a: string; b: string; includeProfit: boolean }) {
    const day = await today();
    const windowA = monthWindow(input.a, input.a, day);
    const windowB = monthWindow(input.b, input.b, day);
    const [a, b] = await Promise.all([windowKpis(windowA), windowKpis(windowB)]);
    const metric = (pick: (k: typeof a) => number | null) => kpi(pick(a), pick(b));
    return {
      a: { month: input.a, partial: windowA.partial },
      b: { month: input.b, partial: windowB.partial },
      metrics: {
        salesRevenue: metric((k) => k.totals.salesRevenue),
        grossSales: metric((k) => k.totals.grossSales),
        productDiscounts: metric((k) => k.totals.productDiscounts),
        ordersCompleted: metric((k) => k.totals.ordersCompleted),
        averageOrderValue: metric((k) => ratio(k.totals.salesRevenue, k.totals.ordersCompleted)),
        unitsSold: metric((k) => k.totals.unitsSold),
        newCustomers: metric((k) => k.newCustomers),
        buyers: metric((k) => k.buyers),
        activeCustomers: metric((k) => k.activeCustomers),
        customersMale: metric((k) => k.customersMaleEnd),
        customersFemale: metric((k) => k.customersFemaleEnd),
      },
      ...(input.includeProfit ? { profit: { a: profitOf(a.totals), b: profitOf(b.totals) } } : {}),
    };
  },

  async sales(input: { granularity: 'day' | 'month'; from: string; to: string; includeProfit: boolean }) {
    const day = await today();
    const bucket = input.granularity === 'month' ? "date_trunc('month', stat_date::timestamp)::date" : 'stat_date';
    const window =
      input.granularity === 'month'
        ? monthWindow(input.from, input.to, day)
        : { from: input.from, to: addDays(input.to, 1), months: monthsBetween(input.from, input.to), partial: input.to >= day };
    const { rows } = await db.query<Record<string, string | null>>(
      `SELECT (${bucket})::text AS period,
              sum(orders_placed) AS placed, sum(orders_completed) AS completed, sum(orders_rejected) AS rejected,
              sum(gross_sales) AS gross, sum(product_discounts) AS discounts, sum(birthday_discounts) AS birthday,
              sum(loyalty_discounts) AS loyalty, sum(sales_revenue) AS revenue, sum(units_sold) AS units,
              max(max_order_value) AS max_order, sum(item_lines) AS lines, sum(item_lines_with_cost) AS lines_cost,
              sum(cogs) AS cogs
         FROM analytics_daily_sales
        WHERE stat_date >= $1::date AND stat_date < $2::date
        GROUP BY 1 ORDER BY 1`,
      [window.from, window.to],
    );
    return {
      granularity: input.granularity,
      window,
      partial: window.partial,
      asOf: day,
      series: rows.map((r) => {
        const totals = {
          salesRevenue: num(r.revenue),
          itemLines: num(r.lines),
          itemLinesWithCost: num(r.lines_cost),
          cogs: num(r.cogs),
        } as SalesTotals;
        return {
          period: r.period!,
          ordersPlaced: num(r.placed),
          ordersCompleted: num(r.completed),
          ordersRejected: num(r.rejected),
          grossSales: num(r.gross),
          productDiscounts: num(r.discounts),
          birthdayDiscounts: num(r.birthday),
          loyaltyDiscounts: num(r.loyalty),
          salesRevenue: num(r.revenue),
          unitsSold: num(r.units),
          averageOrderValue: ratio(num(r.revenue), num(r.completed)),
          highestOrderValue: r.max_order === null ? null : num(r.max_order),
          ...(input.includeProfit ? { profit: profitOf(totals) } : {}),
        };
      }),
    };
  },

  async customers(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const { rows } = await db.query<Record<string, string | number | null>>(
      `SELECT month::text, customers_end, customers_male_end, customers_female_end, new_customers,
              new_customers_male, new_customers_female, buyers, buyers_male, buyers_female, new_buyers,
              returning_buyers, repeat_buyers, active_customers
         FROM analytics_monthly_customers WHERE month = ANY($1::date[]) ORDER BY month`,
      [window.months],
    );
    const activity = await db.query<{ stat_date: string; active_customers: number; logins: number }>(
      `SELECT stat_date::text, active_customers, logins FROM analytics_daily_activity
        WHERE stat_date >= $1::date AND stat_date < $2::date ORDER BY stat_date`,
      [window.from, window.to],
    );
    const last = rows[rows.length - 1];
    return {
      window,
      partial: window.partial,
      asOf: day,
      // التوزيع فئتان فقط (D5).
      genderDistribution: last
        ? { male: num(last.customers_male_end), female: num(last.customers_female_end) }
        : { male: 0, female: 0 },
      monthly: rows.map((r) => ({
        month: String(r.month),
        customersEnd: num(r.customers_end),
        customersMale: num(r.customers_male_end),
        customersFemale: num(r.customers_female_end),
        newCustomers: num(r.new_customers),
        newCustomersMale: num(r.new_customers_male),
        newCustomersFemale: num(r.new_customers_female),
        buyers: num(r.buyers),
        buyersMale: num(r.buyers_male),
        buyersFemale: num(r.buyers_female),
        newBuyers: num(r.new_buyers),
        returningBuyers: num(r.returning_buyers),
        repeatBuyers: num(r.repeat_buyers),
        activeCustomers: r.active_customers === null ? null : num(r.active_customers),
      })),
      dailyActivity: activity.rows.map((r) => ({ date: r.stat_date, activeCustomers: r.active_customers, logins: r.logins })),
      tracking: await trackingCoverage(),
    };
  },

  async products(input: {
    from: string;
    to: string;
    view: 'top' | 'bottom' | 'no_sales' | 'trending';
    sort: 'units' | 'revenue';
    categoryId?: string;
    page: number;
    limit: number;
    includeProfit: boolean;
  }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const offset = (input.page - 1) * input.limit;
    const order = input.sort === 'revenue' ? 'gross_value' : 'units';

    if (input.view === 'trending') {
      const previous = comparisonWindow(window, 'previous')!;
      const { rows } = await db.query<Record<string, string | null>>(
        `WITH cur AS (
           SELECT product_id, sum(units) AS units FROM analytics_daily_product
            WHERE stat_date >= $1::date AND stat_date < $2::date GROUP BY product_id
         ), prev AS (
           SELECT product_id, sum(units) AS units FROM analytics_daily_product
            WHERE stat_date >= $3::date AND stat_date < $4::date GROUP BY product_id
         ), joined AS (
           SELECT COALESCE(cur.product_id, prev.product_id) AS product_id,
                  COALESCE(cur.units, 0) AS current_units, COALESCE(prev.units, 0) AS previous_units
             FROM cur FULL JOIN prev ON prev.product_id = cur.product_id
         )
         SELECT j.product_id, j.current_units, j.previous_units,
                (SELECT d.product_name FROM analytics_daily_product d WHERE d.product_id = j.product_id
                  ORDER BY d.stat_date DESC LIMIT 1) AS name
           FROM joined j
          WHERE GREATEST(j.current_units, j.previous_units) >= $5
            AND j.current_units <> j.previous_units
            AND ($6::uuid IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id = j.product_id AND p.category_id = $6::uuid))
          ORDER BY abs(j.current_units - j.previous_units) DESC, j.product_id
          LIMIT 200`,
        [window.from, window.to, previous.from, previous.to, TREND_MIN_UNITS, input.categoryId ?? null],
      );
      const items = rows.map((r) => ({
        productId: r.product_id!,
        name: r.name,
        currentUnits: num(r.current_units),
        previousUnits: num(r.previous_units),
        delta: num(r.current_units) - num(r.previous_units),
        percent: percentChange(num(r.current_units), num(r.previous_units)),
      }));
      return {
        view: 'trending' as const,
        window,
        compareWindow: previous,
        minUnits: TREND_MIN_UNITS,
        increasing: items.filter((i) => i.delta > 0),
        decreasing: items.filter((i) => i.delta < 0),
      };
    }

    if (input.view === 'no_sales' || input.view === 'bottom') {
      // منتجات نشطة موجودة طوال المدى — الأقلّ مبيعاً يشمل صفر القطع.
      const { rows } = await db.query<Record<string, string | null>>(
        `WITH sold AS (
           SELECT product_id, sum(units) AS units, sum(gross_value) AS gross_value
             FROM analytics_daily_product WHERE stat_date >= $1::date AND stat_date < $2::date
            GROUP BY product_id
         )
         SELECT p.id AS product_id, p.name, p.category_id, p.stock,
                COALESCE(s.units, 0) AS units, COALESCE(s.gross_value, 0) AS gross_value,
                count(*) OVER () AS total
           FROM products p
           LEFT JOIN sold s ON s.product_id = p.id
          WHERE p.is_active AND p.created_at < ($1::date)::timestamp AT TIME ZONE $3
            AND ($4::uuid IS NULL OR p.category_id = $4::uuid)
            AND ($5 = 'bottom' OR s.product_id IS NULL)
          ORDER BY COALESCE(s.${order}, 0) ASC, p.name
          LIMIT $6 OFFSET $7`,
        [window.from, window.to, TZ(), input.categoryId ?? null, input.view, input.limit, offset],
      );
      return {
        view: input.view,
        window,
        total: num(rows[0]?.total),
        items: rows.map((r) => ({
          productId: r.product_id!,
          name: r.name,
          categoryId: r.category_id,
          stock: num(r.stock),
          units: num(r.units),
          grossValue: num(r.gross_value),
        })),
      };
    }

    const { rows } = await db.query<Record<string, string | null>>(
      `SELECT product_id,
              (array_agg(product_name ORDER BY stat_date DESC))[1] AS name,
              (array_agg(category_id ORDER BY stat_date DESC))[1] AS category_id,
              sum(units) AS units, sum(gross_value) AS gross_value, sum(orders) AS orders,
              sum(item_lines) AS lines, sum(item_lines_with_cost) AS lines_cost, sum(cogs) AS cogs,
              count(*) OVER () AS total
         FROM analytics_daily_product
        WHERE stat_date >= $1::date AND stat_date < $2::date
          AND ($3::uuid IS NULL OR category_id = $3::uuid)
        GROUP BY product_id
        ORDER BY sum(${order}) DESC, product_id
        LIMIT $4 OFFSET $5`,
      [window.from, window.to, input.categoryId ?? null, input.limit, offset],
    );
    return {
      view: 'top' as const,
      window,
      total: num(rows[0]?.total),
      items: rows.map((r) => {
        const full = num(r.lines) > 0 && num(r.lines_cost) === num(r.lines);
        return {
          productId: r.product_id!,
          name: r.name,
          categoryId: r.category_id,
          units: num(r.units),
          grossValue: num(r.gross_value),
          orders: num(r.orders),
          ...(input.includeProfit
            ? {
                // هامشٌ قبل خصومات الطلب — متاحٌ فقط بتغطيةٍ كاملة لهذا المنتج.
                marginBeforeOrderDiscounts: full ? num(r.gross_value) - num(r.cogs) : null,
                costCoverage: { itemLines: num(r.lines), itemLinesWithCost: num(r.lines_cost) },
              }
            : {}),
        };
      }),
    };
  },

  async inventory(input: { from: string; to: string; includeProfit: boolean }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const coverage = await db.query<{ first: string | null }>(
      'SELECT min(snapshot_date)::text AS first FROM inventory_daily_snapshot',
    );
    const firstSnapshot = coverage.rows[0]?.first ?? null;
    const covered = firstSnapshot !== null && firstSnapshot <= window.from;
    const current = await db.query<{ out_of_stock: string; low_stock: string }>(
      `SELECT count(*) FILTER (WHERE stock = 0)::text AS out_of_stock,
              count(*) FILTER (WHERE stock > 0 AND stock <= $1)::text AS low_stock
         FROM products WHERE is_active`,
      [LOW_STOCK_THRESHOLD],
    );
    const stockouts = covered
      ? (
          await db.query<Record<string, string | null>>(
            `WITH days AS (
               SELECT product_id, count(*) FILTER (WHERE stock = 0 AND is_active) AS stockout_days,
                      avg(stock) AS avg_stock
                 FROM inventory_daily_snapshot
                WHERE snapshot_date >= $1::date AND snapshot_date < $2::date
                GROUP BY product_id
             ), sold AS (
               SELECT product_id, sum(units) AS units FROM analytics_daily_product
                WHERE stat_date >= $1::date AND stat_date < $2::date GROUP BY product_id
             )
             SELECT d.product_id, p.name, d.stockout_days, d.avg_stock, COALESCE(s.units, 0) AS units
               FROM days d
               LEFT JOIN products p ON p.id = d.product_id
               LEFT JOIN sold s ON s.product_id = d.product_id
              WHERE d.stockout_days > 0 OR COALESCE(s.units, 0) > 0
              ORDER BY d.stockout_days DESC, COALESCE(s.units, 0) DESC
              LIMIT 100`,
            [window.from, window.to],
          )
        ).rows
      : [];
    return {
      window,
      current: { outOfStock: num(current.rows[0]?.out_of_stock), lowStock: num(current.rows[0]?.low_stock), lowStockThreshold: LOW_STOCK_THRESHOLD },
      // قبل أول لقطة لا تاريخ للمخزون — «غير متاح» لا أصفار.
      history: covered
        ? {
            available: true as const,
            items: stockouts.map((r) => ({
              productId: r.product_id!,
              name: r.name,
              stockoutDays: num(r.stockout_days),
              unitsSold: num(r.units),
              averageStock: Math.round(num(r.avg_stock) * 10) / 10,
              turnover: num(r.avg_stock) > 0 ? Math.round((num(r.units) / num(r.avg_stock)) * 100) / 100 : null,
            })),
          }
        : { available: false as const, measuredSince: firstSnapshot },
    };
  },

  async categories(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const { rows } = await db.query<Record<string, string | null>>(
      `SELECT d.category_id, c.name, sum(d.units) AS units, sum(d.gross_value) AS gross_value,
              sum(d.orders) AS orders, sum(d.lines_basis_snapshot) AS snapshot_lines,
              sum(d.lines_basis_current) AS current_lines
         FROM analytics_daily_category d
         LEFT JOIN categories c ON c.id = d.category_id
        WHERE d.stat_date >= $1::date AND d.stat_date < $2::date
        GROUP BY d.category_id, c.name
        ORDER BY sum(d.gross_value) DESC`,
      [window.from, window.to],
    );
    const total = rows.reduce((sum, r) => sum + num(r.gross_value), 0);
    return {
      window,
      items: rows.map((r) => ({
        categoryId: r.category_id!,
        name: r.name,
        units: num(r.units),
        grossValue: num(r.gross_value),
        orders: num(r.orders),
        sharePercent: ratio(num(r.gross_value) * 100, total, 1),
        basis: { snapshotLines: num(r.snapshot_lines), currentCategoryLines: num(r.current_lines) },
      })),
    };
  },

  async governorates(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const { rows } = await db.query<Record<string, string | null>>(
      `SELECT d.governorate_id, g.name, sum(d.orders_placed) AS placed, sum(d.orders_completed) AS completed,
              sum(d.orders_rejected) AS rejected, sum(d.gross_sales) AS gross, sum(d.sales_revenue) AS revenue
         FROM analytics_daily_governorate d
         LEFT JOIN governorates g ON g.id = d.governorate_id
        WHERE d.stat_date >= $1::date AND d.stat_date < $2::date
        GROUP BY d.governorate_id, g.name
        ORDER BY sum(d.sales_revenue) DESC`,
      [window.from, window.to],
    );
    const monthly = await db.query<{ governorate_id: string; month: string; revenue: string; completed: string }>(
      `SELECT governorate_id, (date_trunc('month', stat_date::timestamp)::date)::text AS month,
              sum(sales_revenue) AS revenue, sum(orders_completed) AS completed
         FROM analytics_daily_governorate
        WHERE stat_date >= $1::date AND stat_date < $2::date
        GROUP BY 1, 2 ORDER BY 2`,
      [window.from, window.to],
    );
    const single = window.months.length === 1;
    const buyers = single
      ? await db.query<{ governorate_id: string; buyers: number }>(
          'SELECT governorate_id, buyers FROM analytics_monthly_governorate WHERE month = $1::date',
          [window.months[0]],
        )
      : { rows: [] };
    const buyersBy = new Map(buyers.rows.map((r) => [r.governorate_id, r.buyers]));
    return {
      window,
      partial: window.partial,
      items: rows.map((r) => ({
        governorateId: r.governorate_id!,
        name: r.name,
        ordersPlaced: num(r.placed),
        ordersCompleted: num(r.completed),
        ordersRejected: num(r.rejected),
        salesRevenue: num(r.revenue),
        averageOrderValue: ratio(num(r.revenue), num(r.completed)),
        rejectionRatePercent: ratio(num(r.rejected) * 100, num(r.completed) + num(r.rejected), 1),
        // مشترون مميَّزون حسب محافظة التوصيل — لمدى شهرٍ واحد فقط (لا يُجمعون عبر الأشهر).
        buyers: single ? (buyersBy.get(r.governorate_id!) ?? 0) : null,
        monthly: monthly.rows
          .filter((m) => m.governorate_id === r.governorate_id)
          .map((m) => ({ month: m.month, salesRevenue: num(m.revenue), ordersCompleted: num(m.completed) })),
      })),
    };
  },

  async marketing(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const totals = await salesTotals(window);
    const tz = TZ();
    const registrations = await db.query<{ submitted: string; approved: string }>(
      `SELECT count(*) FILTER (WHERE created_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND created_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS submitted,
              count(*) FILTER (WHERE status = 'approved'
                                AND resolved_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND resolved_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS approved
         FROM account_requests WHERE kind = 'registration'`,
      [window.from, window.to, tz],
    );
    const birthday = await db.query<{ completed_orders: string; rejected_orders: string }>(
      `SELECT count(*) FILTER (WHERE o.status = 'COMPLETED'
                                AND o.delivered_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND o.delivered_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS completed_orders,
              count(*) FILTER (WHERE o.status = 'REJECTED'
                                AND u.created_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND u.created_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS rejected_orders
         FROM birthday_discount_usage u
         JOIN analytics_business_orders o ON o.id = u.order_id`,
      [window.from, window.to, tz],
    );
    const rewards = await db.query<{ kind: string; claimed: string; fulfilled: string }>(
      `SELECT r.kind,
              count(*) FILTER (WHERE r.claimed_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND r.claimed_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS claimed,
              count(*) FILTER (WHERE r.fulfilled_at >= ($1::date)::timestamp AT TIME ZONE $3
                                AND r.fulfilled_at < ($2::date)::timestamp AT TIME ZONE $3)::text AS fulfilled
         FROM loyalty_reward_redemptions r
         JOIN analytics_business_customers c ON c.id = r.user_id
        GROUP BY r.kind`,
      [window.from, window.to, tz],
    );
    const shares = await db.query<Record<string, string | null>>(
      `SELECT c.product_id, sum(c.share_opens) AS opens, sum(c.share_confirmed) AS confirmed,
              (SELECT p.name FROM products p WHERE p.id = c.product_id) AS name
         FROM product_daily_counters c
        WHERE c.stat_date >= $1::date AND c.stat_date < $2::date
        GROUP BY c.product_id
       HAVING sum(c.share_opens) > 0
        ORDER BY sum(c.share_opens) DESC, c.product_id
        LIMIT 20`,
      [window.from, window.to],
    );
    const terms = await db.query<{ term: string; searches: string; zero_result: string }>(
      `SELECT term, sum(searches)::text AS searches, sum(zero_result)::text AS zero_result
         FROM analytics_monthly_search_terms WHERE month = ANY($1::date[])
        GROUP BY term ORDER BY sum(searches) DESC, term LIMIT 20`,
      [window.months],
    );
    const rewardBy = Object.fromEntries(rewards.rows.map((r) => [r.kind, r]));
    return {
      window,
      partial: window.partial,
      registrations: {
        submitted: num(registrations.rows[0]?.submitted),
        approved: num(registrations.rows[0]?.approved),
      },
      newCustomers: await newCustomersSum(window),
      birthday: {
        discountTotal: totals.birthdayDiscounts,
        completedOrders: num(birthday.rows[0]?.completed_orders),
        // CA-12 (مفتوح): ميلادٌ استُعمل على طلبٍ رُفض لاحقاً — يُعرض منفصلاً.
        usedOnRejectedOrders: num(birthday.rows[0]?.rejected_orders),
      },
      loyalty: {
        discountTotal: totals.loyaltyDiscounts,
        discountClaims: num(rewardBy.discount?.claimed),
        giftClaims: num(rewardBy.gift?.claimed),
        giftsFulfilled: num(rewardBy.gift?.fulfilled),
      },
      deliveryPromoGiven: totals.deliveryPromoGiven,
      promoMarkdown: {
        total: totals.promoMarkdown,
        coverage: { itemLines: totals.itemLines, itemLinesWithListPrice: totals.itemLinesWithListPrice },
      },
      shares: shares.rows.map((r) => ({
        productId: r.product_id!,
        name: r.name,
        shareOpens: num(r.opens),
        shareConfirmed: num(r.confirmed),
      })),
      topSearches: terms.rows.map((r) => ({ term: r.term, searches: num(r.searches), zeroResult: num(r.zero_result) })),
      tracking: await trackingCoverage(),
      // لا مصدر بيانات لها — تُعرض «غير متاحة» ولا تُختلق.
      unavailable: ['coupons', 'attribution'] as const,
    };
  },

  async behaviour(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const totals = await db.query<Record<string, string | null>>(
      `SELECT COALESCE(sum(views), 0) AS views, COALESCE(sum(cart_adds), 0) AS cart_adds,
              COALESCE(sum(share_opens), 0) AS share_opens, COALESCE(sum(share_confirmed), 0) AS share_confirmed
         FROM product_daily_counters WHERE stat_date >= $1::date AND stat_date < $2::date`,
      [window.from, window.to],
    );
    const top = await db.query<Record<string, string | null>>(
      `SELECT c.product_id, sum(c.views) AS views, sum(c.cart_adds) AS cart_adds,
              (SELECT p.name FROM products p WHERE p.id = c.product_id) AS name
         FROM product_daily_counters c
        WHERE c.stat_date >= $1::date AND c.stat_date < $2::date
        GROUP BY c.product_id
        ORDER BY sum(c.views) DESC, c.product_id
        LIMIT 20`,
      [window.from, window.to],
    );
    const t = totals.rows[0]!;
    return {
      window,
      tracking: await trackingCoverage(),
      totals: {
        productViews: num(t.views),
        cartAdds: num(t.cart_adds),
        shareOpens: num(t.share_opens),
        shareConfirmed: num(t.share_confirmed),
      },
      topProducts: top.rows.map((r) => ({
        productId: r.product_id!,
        name: r.name,
        views: num(r.views),
        cartAdds: num(r.cart_adds),
      })),
    };
  },

  async notifications(input: { from: string; to: string }) {
    const day = await today();
    const window = monthWindow(input.from, input.to, day);
    const delivery = await db.query<Record<string, string>>(
      `SELECT stat_date::text AS date, audience,
              sum(created) AS created, sum(accepted) AS accepted, sum(failed) AS failed,
              sum(skipped_not_configured) AS skipped_not_configured, sum(skipped_pref) AS skipped_pref,
              sum(skipped_no_devices) AS skipped_no_devices, sum(devices_accepted) AS devices_accepted,
              sum(devices_invalid) AS devices_invalid
         FROM notification_daily_stats
        WHERE stat_date >= $1::date AND stat_date < $2::date
        GROUP BY 1, 2 ORDER BY 1`,
      [window.from, window.to],
    );
    const engagement = await db.query<{ date: string; read_in_app: string; opened: string }>(
      `SELECT stat_date::text AS date, sum(read_in_app)::text AS read_in_app, sum(opened_from_push)::text AS opened
         FROM notification_daily_engagement
        WHERE stat_date >= $1::date AND stat_date < $2::date
        GROUP BY 1 ORDER BY 1`,
      [window.from, window.to],
    );
    const byType = await db.query<{ notif_type: string; created: string; accepted: string }>(
      `SELECT notif_type, sum(created)::text AS created, sum(accepted)::text AS accepted
         FROM notification_daily_stats
        WHERE stat_date >= $1::date AND stat_date < $2::date AND audience = 'customer'
        GROUP BY notif_type ORDER BY sum(created) DESC`,
      [window.from, window.to],
    );
    const campaigns = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM notification_campaigns
        WHERE created_at >= ($1::date)::timestamp AT TIME ZONE $3
          AND created_at < ($2::date)::timestamp AT TIME ZONE $3`,
      [window.from, window.to, TZ()],
    );
    const devices = await db.query<{ platform: string; n: string }>(
      `SELECT d.platform, count(*)::text AS n
         FROM device_tokens d
         JOIN analytics_business_customers c ON c.id = d.user_id
        WHERE d.is_active AND d.last_seen_at >= now() - interval '30 days'
        GROUP BY d.platform ORDER BY d.platform`,
    );
    const status = pushStatus();
    return {
      window,
      partial: window.partial,
      push: { configured: status.configured },
      campaigns: num(campaigns.rows[0]?.n),
      activeDevices: devices.rows.map((r) => ({ platform: r.platform, count: num(r.n) })),
      delivery: delivery.rows.map((r) => ({
        date: r.date!,
        audience: r.audience!,
        created: num(r.created),
        acceptedByFcm: num(r.accepted),
        failed: num(r.failed),
        skippedNotConfigured: num(r.skipped_not_configured),
        skippedPreference: num(r.skipped_pref),
        skippedNoDevices: num(r.skipped_no_devices),
        devicesAcceptedByFcm: num(r.devices_accepted),
        devicesInvalid: num(r.devices_invalid),
      })),
      engagement: engagement.rows.map((r) => ({
        date: r.date,
        readInApp: num(r.read_in_app),
        openedFromPush: num(r.opened),
      })),
      byType: byType.rows.map((r) => ({ type: r.notif_type, created: num(r.created), acceptedByFcm: num(r.accepted) })),
    };
  },

  async periods() {
    const day = await today();
    const { rows } = await db.query<{
      month: string;
      status: string;
      closed_at: Date | null;
      computed_at: Date | null;
      definitions_version: number;
      reconciliation: Record<string, unknown>;
    }>(
      `SELECT month::text, status, closed_at, computed_at, definitions_version, reconciliation
         FROM analytics_periods ORDER BY month DESC`,
    );
    const inventory = await db.query<{ first: string | null }>('SELECT min(snapshot_date)::text AS first FROM inventory_daily_snapshot');
    return {
      definitionsVersion: ANALYTICS_DEFINITIONS_VERSION,
      asOf: day,
      tracking: await trackingCoverage(),
      inventoryMeasuredSince: inventory.rows[0]?.first ?? null,
      months: rows.map((row) => {
        const reconciliation = publicReconciliation(row.reconciliation);
        return {
          month: row.month.slice(0, 7),
          status: row.status,
          partial: row.month === monthStart(day),
          closedAt: row.closed_at?.toISOString() ?? null,
          computedAt: row.computed_at?.toISOString() ?? null,
          definitionsVersion: row.definitions_version,
          reconciliation,
        };
      }),
    };
  },
};

/** المطابقة كما تخرج للواجهة: شذوذ الجنس للتدقيق في القاعدة وحدها (D5). */
export function publicReconciliation(reconciliation: Record<string, unknown>): Record<string, unknown> {
  const visible: Record<string, unknown> = { ...reconciliation };
  delete visible.genderIntegrityAnomalies;
  return visible;
}

async function trackingCoverage() {
  const { rows } = await db.query<{ enabled_at: Date; disabled_at: Date | null }>(
    'SELECT enabled_at, disabled_at FROM analytics_tracking_epochs ORDER BY enabled_at',
  );
  return {
    enabledNow: config.analytics.trackingEnabled,
    epochs: rows.map((r) => ({ enabledAt: r.enabled_at.toISOString(), disabledAt: r.disabled_at?.toISOString() ?? null })),
  };
}
