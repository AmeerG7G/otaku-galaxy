import type pg from 'pg';
import {
  ANALYTICS_DEFINITIONS_VERSION,
  CLOSE_GRACE_DAYS,
  MONTHLY_TOP_SEARCH_TERMS,
  PROCESSING_STATUSES,
  RAW_TRACKING_RETENTION_DAYS,
  RECOMPUTE_LOOKBACK_DAYS,
  SEARCH_TERM_MIN_COUNT,
} from '../../domain/analyticsDefinitions.js';
import { addDays, daysBetween, monthEnd, monthStart, monthsBetween } from './calendar.js';

/**
 * مجمِّع التحليلات التاريخية — يشتقّ الملخّصات من الجداول التشغيلية.
 *
 * [CRITICAL] قواعد لا تُكسر هنا:
 *   • كل استعلام يقرأ الطلبات/الزبائن عبر `analytics_business_orders` و
 *     `analytics_business_customers` (D2). استثناءٌ واحد مقصود: عدّ الطلبات
 *     **المستبعَدة** للمطابقة، عبر `analytics_order_scope` نفسه.
 *   • اليوم يوم المتجر: حدود اليوم تُحسب في القاعدة
 *     (`day::timestamp AT TIME ZONE tz`) فتعمل الفهارس على الأعمدة كما هي.
 *   • كل حساب يومٍ معاملةٌ واحدة: حذف صفوف اليوم ثم إدراجها (أو upsert) —
 *     إعادة التشغيل لا تضاعف شيئاً.
 *   • لا شيء يقرأ التكلفة الحالية للمنتج: الربح من لقطات البنود وحدها.
 *   • التواريخ تُعاد نصّاً (`::text`) لا `Date`.
 *
 * الدوال تأخذ `client` ولا تفتح معاملاتها: المهمّة تلفّ كل شهرٍ بمعاملة،
 * والاختبارات تلفّ الدور كلّه بمعاملةٍ تُلغى (فلا تُغلق أشهرٌ حقيقية).
 */

type Client = pg.PoolClient;

// [PERF-6] `NOT MATERIALIZED` لا زخرفة: الحدّان يُستعملان مراراً في الجملة، فكان
// PostgreSQL يجسّد الـCTE فيخفي قيمتيهما عن المخطّط — يقدّر يوماً واحداً بـ٥٥٦
// طلباً مكتملاً و١١١١ طلباً جديداً (الحقيقة ~١٢) ويختار ربطاً بالتجزئة يمسح كل
// `orders` وكل `order_items` لكل يومٍ يُعاد حسابه. مدمَجاً يرى المخطّط الحدّين
// الفعليين فيمشي فهارس 076. يحرسه `performance-audit` PERF-6.
const DAY_BOUNDS = `bounds AS NOT MATERIALIZED (
  SELECT ($1::date)::timestamp AT TIME ZONE $2 AS lo,
         (($1::date) + 1)::timestamp AT TIME ZONE $2 AS hi
)`;

const MONTH_BOUNDS = `bounds AS NOT MATERIALIZED (
  SELECT ($1::date)::timestamp AT TIME ZONE $2 AS lo,
         ($3::date)::timestamp AT TIME ZONE $2 AS hi
)`;

const PROCESSING_SQL = PROCESSING_STATUSES.map((status) => `'${status}'`).join(', ');

/** هل تغطّي حقبة تتبّعٍ ما النافذة [lo, hi)؟ */
const TRACKING_COVERS = `EXISTS (
  SELECT 1 FROM analytics_tracking_epochs e, bounds b
   WHERE e.enabled_at < b.hi AND (e.disabled_at IS NULL OR e.disabled_at > b.lo)
)`;

export interface PeriodRow {
  month: string;
  status: 'open' | 'closed';
  dirty: boolean;
  computed_through: string | null;
  definitions_version: number;
}

export interface MonthReconciliation {
  definitionsVersion: number;
  completedOrders: number;
  grossSales: number;
  productDiscounts: number;
  salesRevenue: number;
  sourceCheck: { completedOrders: number; grossSales: number; salesRevenue: number; matches: boolean };
  excludedOrdersCompleted: number;
  excludedSalesValue: number;
  itemLines: number;
  itemLinesWithCost: number;
  itemLinesWithCategorySnapshot: number;
  itemLinesWithListPrice: number;
  unattributedItemLines: number;
  /** للتدقيق فقط — لا يُعرض في الواجهة ولا الـAPI (D5: لا فئة ولا ملاحظة). */
  genderIntegrityAnomalies: number;
}

export const analyticsAggregator = {
  /** «اليوم» بتقويم المتجر. */
  async today(client: Client | pg.Pool, tz: string): Promise<string> {
    const { rows } = await client.query<{ d: string }>(`SELECT ((now() AT TIME ZONE $1)::date)::text AS d`, [tz]);
    return rows[0]!.d;
  },

  /** كل الملخّصات اليومية ليومٍ واحد. */
  async computeDay(client: Client, day: string, tz: string): Promise<void> {
    await this.computeDailySales(client, day, tz);
    await this.computeDailyProducts(client, day, tz);
    await this.computeDailyCategories(client, day, tz);
    await this.computeDailyGovernorates(client, day, tz);
    await this.computeDailyActivity(client, day, tz);
    await this.computeDailyEngagement(client, day, tz);
  },

  async computeDailySales(client: Client, day: string, tz: string): Promise<void> {
    await client.query(
      `WITH ${DAY_BOUNDS},
       completed AS (
         SELECT o.id, o.products_total, o.discount, o.loyalty_discount, o.delivery_discount
           FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       ),
       items AS (
         SELECT oi.quantity, oi.price, oi.unit_cost, oi.list_price
           FROM order_items oi JOIN completed c ON c.id = oi.order_id
       ),
       rejected AS (
         SELECT h.order_id,
                bool_or(EXISTS (
                  SELECT 1 FROM order_status_history d
                   WHERE d.order_id = h.order_id AND d.status = 'OUT_FOR_DELIVERY' AND d.created_at <= h.created_at
                )) AS after_dispatch
           FROM order_status_history h
           JOIN analytics_business_orders o ON o.id = h.order_id
           CROSS JOIN bounds b
          WHERE h.status = 'REJECTED' AND h.created_at >= b.lo AND h.created_at < b.hi
          GROUP BY h.order_id
       ),
       excluded AS (
         SELECT o.products_total, o.discount
           FROM orders o
           JOIN analytics_order_scope s ON s.order_id = o.id
           CROSS JOIN bounds b
          WHERE NOT s.in_scope AND o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       )
       INSERT INTO analytics_daily_sales (
         stat_date, orders_placed, orders_completed, orders_rejected, orders_rejected_after_dispatch,
         gross_sales, product_discounts, birthday_discounts, loyalty_discounts, sales_revenue,
         delivery_promo_given, units_sold, max_order_value, item_lines, item_lines_with_cost, cogs,
         item_lines_with_list_price, promo_markdown, birthday_usage_amount,
         excluded_orders_completed, excluded_sales_value, computed_at
       )
       SELECT $1::date,
              (SELECT count(*) FROM analytics_business_orders o, bounds b
                WHERE o.created_at >= b.lo AND o.created_at < b.hi),
              (SELECT count(*) FROM completed),
              (SELECT count(*) FROM rejected),
              (SELECT count(*) FILTER (WHERE after_dispatch) FROM rejected),
              COALESCE((SELECT sum(products_total) FROM completed), 0),
              COALESCE((SELECT sum(discount) FROM completed), 0),
              COALESCE((SELECT sum(discount - loyalty_discount) FROM completed), 0),
              COALESCE((SELECT sum(loyalty_discount) FROM completed), 0),
              COALESCE((SELECT sum(products_total - discount) FROM completed), 0),
              COALESCE((SELECT sum(delivery_discount) FROM completed), 0),
              COALESCE((SELECT sum(quantity) FROM items), 0),
              (SELECT max(products_total - discount) FROM completed),
              (SELECT count(*) FROM items),
              (SELECT count(*) FROM items WHERE unit_cost IS NOT NULL),
              COALESCE((SELECT sum(unit_cost * quantity) FROM items WHERE unit_cost IS NOT NULL), 0),
              (SELECT count(*) FROM items WHERE list_price IS NOT NULL),
              COALESCE((SELECT sum(GREATEST(list_price - price, 0) * quantity) FROM items WHERE list_price IS NOT NULL), 0),
              COALESCE((SELECT sum(u.amount) FROM birthday_discount_usage u JOIN completed c ON c.id = u.order_id), 0),
              (SELECT count(*) FROM excluded),
              COALESCE((SELECT sum(products_total - discount) FROM excluded), 0),
              now()
       ON CONFLICT (stat_date) DO UPDATE SET
         orders_placed = EXCLUDED.orders_placed,
         orders_completed = EXCLUDED.orders_completed,
         orders_rejected = EXCLUDED.orders_rejected,
         orders_rejected_after_dispatch = EXCLUDED.orders_rejected_after_dispatch,
         gross_sales = EXCLUDED.gross_sales,
         product_discounts = EXCLUDED.product_discounts,
         birthday_discounts = EXCLUDED.birthday_discounts,
         loyalty_discounts = EXCLUDED.loyalty_discounts,
         sales_revenue = EXCLUDED.sales_revenue,
         delivery_promo_given = EXCLUDED.delivery_promo_given,
         units_sold = EXCLUDED.units_sold,
         max_order_value = EXCLUDED.max_order_value,
         item_lines = EXCLUDED.item_lines,
         item_lines_with_cost = EXCLUDED.item_lines_with_cost,
         cogs = EXCLUDED.cogs,
         item_lines_with_list_price = EXCLUDED.item_lines_with_list_price,
         promo_markdown = EXCLUDED.promo_markdown,
         birthday_usage_amount = EXCLUDED.birthday_usage_amount,
         excluded_orders_completed = EXCLUDED.excluded_orders_completed,
         excluded_sales_value = EXCLUDED.excluded_sales_value,
         computed_at = EXCLUDED.computed_at`,
      [day, tz],
    );
  },

  async computeDailyProducts(client: Client, day: string, tz: string): Promise<void> {
    await client.query('DELETE FROM analytics_daily_product WHERE stat_date = $1::date', [day]);
    await client.query(
      `WITH ${DAY_BOUNDS},
       completed AS (
         SELECT o.id, o.delivered_at FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       )
       INSERT INTO analytics_daily_product (
         stat_date, product_id, product_name, category_id, units, gross_value, orders,
         item_lines, item_lines_with_cost, cogs, computed_at
       )
       SELECT $1::date, oi.product_id,
              (array_agg(oi.product_name ORDER BY c.delivered_at DESC, oi.id))[1],
              (array_agg(COALESCE(oi.category_id, p.category_id) ORDER BY c.delivered_at DESC, oi.id))[1],
              sum(oi.quantity), sum(oi.line_total), count(DISTINCT oi.order_id),
              count(*), count(*) FILTER (WHERE oi.unit_cost IS NOT NULL),
              COALESCE(sum(oi.unit_cost * oi.quantity) FILTER (WHERE oi.unit_cost IS NOT NULL), 0),
              now()
         FROM order_items oi
         JOIN completed c ON c.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.product_id
        WHERE oi.product_id IS NOT NULL
        GROUP BY oi.product_id`,
      [day, tz],
    );
  },

  async computeDailyCategories(client: Client, day: string, tz: string): Promise<void> {
    await client.query('DELETE FROM analytics_daily_category WHERE stat_date = $1::date', [day]);
    await client.query(
      `WITH ${DAY_BOUNDS},
       completed AS (
         SELECT o.id FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       ),
       lines AS (
         SELECT oi.order_id, oi.quantity, oi.line_total,
                COALESCE(oi.category_id, p.category_id) AS category_id,
                oi.category_id IS NOT NULL AS from_snapshot
           FROM order_items oi
           JOIN completed c ON c.id = oi.order_id
           LEFT JOIN products p ON p.id = oi.product_id
       )
       INSERT INTO analytics_daily_category (
         stat_date, category_id, units, gross_value, orders, lines_basis_snapshot, lines_basis_current, computed_at
       )
       SELECT $1::date, category_id, sum(quantity), sum(line_total), count(DISTINCT order_id),
              count(*) FILTER (WHERE from_snapshot), count(*) FILTER (WHERE NOT from_snapshot), now()
         FROM lines
        WHERE category_id IS NOT NULL
        GROUP BY category_id`,
      [day, tz],
    );
  },

  async computeDailyGovernorates(client: Client, day: string, tz: string): Promise<void> {
    await client.query('DELETE FROM analytics_daily_governorate WHERE stat_date = $1::date', [day]);
    await client.query(
      `WITH ${DAY_BOUNDS},
       facts AS (
         SELECT o.governorate_id, 1 AS placed, 0 AS completed, 0 AS rejected, 0::numeric AS gross, 0::numeric AS revenue
           FROM analytics_business_orders o, bounds b
          WHERE o.created_at >= b.lo AND o.created_at < b.hi
         UNION ALL
         SELECT o.governorate_id, 0, 1, 0, o.products_total, o.products_total - o.discount
           FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
         UNION ALL
         SELECT o.governorate_id, 0, 0, 1, 0, 0
           FROM (SELECT DISTINCT h.order_id FROM order_status_history h, bounds b
                  WHERE h.status = 'REJECTED' AND h.created_at >= b.lo AND h.created_at < b.hi) r
           JOIN analytics_business_orders o ON o.id = r.order_id
       )
       INSERT INTO analytics_daily_governorate (
         stat_date, governorate_id, orders_placed, orders_completed, orders_rejected, gross_sales, sales_revenue, computed_at
       )
       SELECT $1::date, governorate_id, sum(placed), sum(completed), sum(rejected), sum(gross), sum(revenue), now()
         FROM facts
        GROUP BY governorate_id`,
      [day, tz],
    );
  },

  /**
   * النشاط اليومي — يُكتب فقط ليومٍ تغطّيه حقبة تتبّع. يومٌ خارجها لا صفّ له
   * (لا صفر مختلَق): الواجهة تعرض «لم يُقَس».
   */
  async computeDailyActivity(client: Client, day: string, tz: string): Promise<void> {
    await client.query('DELETE FROM analytics_daily_activity WHERE stat_date = $1::date', [day]);
    await client.query(
      `WITH ${DAY_BOUNDS}
       INSERT INTO analytics_daily_activity (stat_date, active_customers, logins, computed_at)
       SELECT $1::date, count(DISTINCT a.user_id), COALESCE(sum(a.logins), 0), now()
         FROM user_daily_activity a
         JOIN analytics_business_customers c ON c.id = a.user_id
        WHERE a.activity_date = $1::date
       HAVING ${TRACKING_COVERS}`,
      [day, tz],
    );
  },

  /**
   * التفاعل مع الإشعارات، مؤرَّخٌ بيوم حدوثه: قراءةٌ داخل التطبيق يوم `read_at`،
   * وفتحٌ بالنقر يوم `opened_at`. لزبائن الأعمال وحدهم (D2).
   */
  async computeDailyEngagement(client: Client, day: string, tz: string): Promise<void> {
    await client.query('DELETE FROM notification_daily_engagement WHERE stat_date = $1::date', [day]);
    await client.query(
      `WITH ${DAY_BOUNDS},
       events AS (
         SELECT n.type, n.campaign_id, 1 AS read_in_app, 0 AS opened
           FROM notifications n
           JOIN analytics_business_customers c ON c.id = n.user_id
           CROSS JOIN bounds b
          WHERE n.read_at >= b.lo AND n.read_at < b.hi
         UNION ALL
         SELECT n.type, n.campaign_id, 0, 1
           FROM notifications n
           JOIN analytics_business_customers c ON c.id = n.user_id
           CROSS JOIN bounds b
          WHERE n.opened_at >= b.lo AND n.opened_at < b.hi
       )
       INSERT INTO notification_daily_engagement (stat_date, notif_type, campaign_id, read_in_app, opened_from_push, computed_at)
       SELECT $1::date, type, campaign_id, sum(read_in_app), sum(opened), now()
         FROM events
        GROUP BY type, campaign_id`,
      [day, tz],
    );
  },

  /**
   * الملخّصات الشهرية (أعدادٌ مميَّزة). `endDay` = اليوم الذي تنتهي النافذة
   * **قبله**: أول يومٍ بعد الشهر لشهرٍ منقضٍ، أو غدُ «اليوم» للشهر الجاري.
   */
  async computeMonthly(client: Client, month: string, endDay: string, tz: string): Promise<void> {
    const params = [month, tz, endDay];
    await client.query('DELETE FROM analytics_monthly_customers WHERE month = $1::date', [month]);
    await client.query(
      `WITH ${MONTH_BOUNDS},
       completed AS (
         SELECT o.id, o.user_id FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       ),
       buyers AS (
         -- الجنس من عرض زبائن الأعمال: حسابٌ رُقّي لاحقاً إلى مسؤول يبقى مشترياً
         -- (لقطة دوره ساعة الطلب زبون) لكنه لا يدخل تقسيم الجنس.
         SELECT c.user_id, count(*) AS orders, bc.gender,
                (SELECT min(f.delivered_at) FROM analytics_business_orders f
                  WHERE f.user_id = c.user_id AND f.status = 'COMPLETED') AS first_completed
           FROM completed c LEFT JOIN analytics_business_customers bc ON bc.id = c.user_id
          GROUP BY c.user_id, bc.gender
       ),
       customers AS (
         SELECT c.gender, c.phone_verified_at FROM analytics_business_customers c, bounds b
          WHERE c.phone_verified_at < b.hi
       )
       INSERT INTO analytics_monthly_customers (
         month, customers_end, customers_male_end, customers_female_end,
         new_customers, new_customers_male, new_customers_female,
         buyers, buyers_male, buyers_female, new_buyers, returning_buyers, repeat_buyers,
         active_customers, computed_at
       )
       SELECT $1::date,
              (SELECT count(*) FROM customers),
              (SELECT count(*) FROM customers WHERE gender = 'male'),
              (SELECT count(*) FROM customers WHERE gender = 'female'),
              (SELECT count(*) FROM customers, bounds b WHERE phone_verified_at >= b.lo),
              (SELECT count(*) FROM customers, bounds b WHERE phone_verified_at >= b.lo AND gender = 'male'),
              (SELECT count(*) FROM customers, bounds b WHERE phone_verified_at >= b.lo AND gender = 'female'),
              (SELECT count(*) FROM buyers),
              (SELECT count(*) FROM buyers WHERE gender = 'male'),
              (SELECT count(*) FROM buyers WHERE gender = 'female'),
              (SELECT count(*) FROM buyers, bounds b WHERE first_completed >= b.lo),
              (SELECT count(*) FROM buyers, bounds b WHERE first_completed < b.lo),
              (SELECT count(*) FROM buyers WHERE orders >= 2),
              CASE WHEN ${TRACKING_COVERS} THEN (
                SELECT count(DISTINCT a.user_id) FROM user_daily_activity a
                  JOIN analytics_business_customers c ON c.id = a.user_id
                 WHERE a.activity_date >= $1::date AND a.activity_date < $3::date
              ) END,
              now()`,
      params,
    );

    await client.query('DELETE FROM analytics_monthly_orders WHERE month = $1::date', [month]);
    await client.query(
      `WITH ${MONTH_BOUNDS}
       INSERT INTO analytics_monthly_orders (month, processing_at_end, computed_at)
       SELECT $1::date, count(*), now()
         FROM analytics_business_orders o, bounds b
        WHERE o.created_at < b.hi
          AND COALESCE(
                (SELECT h.status FROM order_status_history h
                  WHERE h.order_id = o.id AND h.created_at < b.hi
                  ORDER BY h.created_at DESC, h.id DESC LIMIT 1),
                'PENDING_ADMIN_CONFIRMATION'
              ) IN (${PROCESSING_SQL})`,
      params,
    );

    await client.query('DELETE FROM analytics_monthly_governorate WHERE month = $1::date', [month]);
    await client.query(
      `WITH ${MONTH_BOUNDS}
       INSERT INTO analytics_monthly_governorate (month, governorate_id, buyers, computed_at)
       SELECT $1::date, o.governorate_id, count(DISTINCT o.user_id), now()
         FROM analytics_business_orders o, bounds b
        WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
        GROUP BY o.governorate_id`,
      params,
    );

    await client.query('DELETE FROM analytics_monthly_search_terms WHERE month = $1::date', [month]);
    await client.query(
      `INSERT INTO analytics_monthly_search_terms (month, term, searches, zero_result, computed_at)
       SELECT $1::date, term, sum(searches), sum(zero_result), now()
         FROM search_daily_terms
        WHERE stat_date >= $1::date AND stat_date < $2::date
        GROUP BY term
       HAVING sum(searches) >= $3
        ORDER BY sum(searches) DESC, term
        LIMIT $4`,
      [month, endDay, SEARCH_TERM_MIN_COUNT, MONTHLY_TOP_SEARCH_TERMS],
    );
  },

  /** مطابقة الشهر: الملخّص اليومي مقابل المصدر مباشرةً، وتغطية اللقطات. */
  async reconcile(client: Client, month: string, endDay: string, tz: string): Promise<MonthReconciliation> {
    const { rows } = await client.query<Record<string, string>>(
      `WITH ${MONTH_BOUNDS},
       daily AS (
         SELECT COALESCE(sum(orders_completed), 0) AS completed, COALESCE(sum(gross_sales), 0) AS gross,
                COALESCE(sum(product_discounts), 0) AS discounts, COALESCE(sum(sales_revenue), 0) AS revenue,
                COALESCE(sum(excluded_orders_completed), 0) AS excluded, COALESCE(sum(excluded_sales_value), 0) AS excluded_value,
                COALESCE(sum(item_lines), 0) AS lines, COALESCE(sum(item_lines_with_cost), 0) AS lines_cost,
                COALESCE(sum(item_lines_with_list_price), 0) AS lines_list
           FROM analytics_daily_sales WHERE stat_date >= $1::date AND stat_date < $3::date
       ),
       source AS (
         SELECT count(*) AS completed, COALESCE(sum(o.products_total), 0) AS gross,
                COALESCE(sum(o.products_total - o.discount), 0) AS revenue
           FROM analytics_business_orders o, bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       ),
       items AS (
         SELECT count(*) FILTER (WHERE oi.category_id IS NOT NULL) AS with_category,
                count(*) FILTER (WHERE oi.product_id IS NULL) AS unattributed
           FROM order_items oi
           JOIN analytics_business_orders o ON o.id = oi.order_id
           CROSS JOIN bounds b
          WHERE o.status = 'COMPLETED' AND o.delivered_at >= b.lo AND o.delivered_at < b.hi
       )
       SELECT d.completed::text, d.gross::text, d.discounts::text, d.revenue::text, d.excluded::text,
              d.excluded_value::text, d.lines::text, d.lines_cost::text, d.lines_list::text,
              s.completed::text AS s_completed, s.gross::text AS s_gross, s.revenue::text AS s_revenue,
              i.with_category::text, i.unattributed::text,
              (SELECT count(*) FROM analytics_business_customers c, bounds b
                WHERE c.gender IS NULL AND c.phone_verified_at < b.hi)::text AS anomalies
         FROM daily d, source s, items i`,
      [month, tz, endDay],
    );
    const r = rows[0]!;
    const n = (key: string) => Number(r[key] ?? 0);
    const sourceCheck = {
      completedOrders: n('s_completed'),
      grossSales: n('s_gross'),
      salesRevenue: n('s_revenue'),
      matches: n('s_completed') === n('completed') && n('s_gross') === n('gross') && n('s_revenue') === n('revenue'),
    };
    return {
      definitionsVersion: ANALYTICS_DEFINITIONS_VERSION,
      completedOrders: n('completed'),
      grossSales: n('gross'),
      productDiscounts: n('discounts'),
      salesRevenue: n('revenue'),
      sourceCheck,
      excludedOrdersCompleted: n('excluded'),
      excludedSalesValue: n('excluded_value'),
      itemLines: n('lines'),
      itemLinesWithCost: n('lines_cost'),
      itemLinesWithCategorySnapshot: n('with_category'),
      itemLinesWithListPrice: n('lines_list'),
      unattributedItemLines: n('unattributed'),
      genderIntegrityAnomalies: n('anomalies'),
    };
  },

  /** أول شهرٍ فيه بيانات (طلبات، أو زبائن مفعَّلون، أو إشعارات) — أو الشهر الجاري. */
  async firstDataMonth(client: Client, tz: string, today: string): Promise<string> {
    const { rows } = await client.query<{ first: string | null }>(
      `SELECT (date_trunc('month', LEAST(
                 (SELECT min(created_at) FROM analytics_business_orders),
                 (SELECT min(phone_verified_at) FROM analytics_business_customers),
                 (SELECT min(created_at) FROM notifications)
               ) AT TIME ZONE $1)::date)::text AS first`,
      [tz],
    );
    const first = rows[0]?.first;
    return first && first < monthStart(today) ? first : monthStart(today);
  },

  /** يضمن صفّاً لكل شهرٍ من أول بيانات إلى الشهر الجاري (الجديد «متّسخ»). */
  async ensurePeriods(client: Client, tz: string, today: string): Promise<void> {
    const first = await this.firstDataMonth(client, tz, today);
    await client.query(
      `INSERT INTO analytics_periods (month)
       SELECT m::date FROM unnest($1::date[]) AS m
       ON CONFLICT (month) DO NOTHING`,
      [monthsBetween(first, today)],
    );
  },

  /**
   * يعيد حساب شهرٍ مفتوح (ويغلقه إن انقضت مهلته) — داخل معاملة المستدعي.
   *
   * صفّ الفترة يُقفل أولاً: تعليمٌ «متّسخ» متزامن (حساب داخلي، إكمال جنس) ينتظر
   * انتهاء الحساب ثم يُكتب، فيُعاد الشهر في الدور التالي بدل أن يضيع التعليم.
   */
  async processOpenMonth(client: Client, month: string, today: string, tz: string) {
    const { rows } = await client.query<PeriodRow>(
      `SELECT month::text, status, dirty, computed_through::text, definitions_version
         FROM analytics_periods WHERE month = $1::date FOR UPDATE`,
      [month],
    );
    const period = rows[0];
    if (!period || period.status !== 'open') return { month, action: 'skipped' as const };

    const lastDayOfMonth = monthEnd(month);
    const closable = today >= addDays(lastDayOfMonth, CLOSE_GRACE_DAYS + 1);
    const full =
      closable ||
      period.dirty ||
      period.computed_through === null ||
      period.definitions_version !== ANALYTICS_DEFINITIONS_VERSION;
    const lastDay = today < lastDayOfMonth ? today : lastDayOfMonth;
    const watermark = period.computed_through ? addDays(period.computed_through, -RECOMPUTE_LOOKBACK_DAYS) : month;
    const fromDay = full || watermark < month ? month : watermark;

    for (const day of daysBetween(fromDay, lastDay)) {
      await this.computeDay(client, day, tz);
    }
    const endDay = today < lastDayOfMonth ? addDays(today, 1) : addDays(lastDayOfMonth, 1);
    await this.computeMonthly(client, month, endDay, tz);
    const reconciliation = await this.reconcile(client, month, endDay, tz);

    if (closable && !reconciliation.sourceCheck.matches) {
      // لا يُغلق شهرٌ لا تطابق ملخّصاته مصدرها — يبقى مفتوحاً ويُسجَّل العطل.
      console.error('[analytics] month not closed: reconciliation mismatch', { month, reconciliation });
    }
    const close = closable && reconciliation.sourceCheck.matches;
    await client.query(
      `UPDATE analytics_periods
          SET dirty = FALSE, computed_through = $2::date, computed_at = now(),
              definitions_version = $3, reconciliation = $4::jsonb,
              status = CASE WHEN $5 THEN 'closed' ELSE status END,
              closed_at = CASE WHEN $5 THEN now() ELSE closed_at END
        WHERE month = $1::date`,
      [month, lastDay, ANALYTICS_DEFINITIONS_VERSION, JSON.stringify(reconciliation), close],
    );
    return { month, action: close ? ('closed' as const) : full ? ('recomputed' as const) : ('refreshed' as const) };
  },

  /** لقطة المخزون اليومية — مرة لكل يوم (لا تتغيّر بعد كتابتها). */
  async snapshotInventory(client: Client, today: string): Promise<number> {
    const { rowCount } = await client.query(
      `INSERT INTO inventory_daily_snapshot (snapshot_date, product_id, stock, is_active)
       SELECT $1::date, p.id, p.stock, p.is_active FROM products p
       ON CONFLICT (snapshot_date, product_id) DO NOTHING`,
      [today],
    );
    return rowCount ?? 0;
  },

  /**
   * تطهير التتبّع **الخام** بعد مدّة الاحتفاظ: أيام النشاط وعبارات البحث اليومية.
   * لا يمسّ أي ملخّص تاريخي — أرقامها جُمِّدت في الملخّصات قبل ذلك بكثير.
   */
  async purgeRawTracking(client: Client, today: string): Promise<{ activity: number; searchTerms: number }> {
    const cutoff = addDays(today, -RAW_TRACKING_RETENTION_DAYS);
    const activity = await client.query('DELETE FROM user_daily_activity WHERE activity_date < $1::date', [cutoff]);
    const searchTerms = await client.query('DELETE FROM search_daily_terms WHERE stat_date < $1::date', [cutoff]);
    return { activity: activity.rowCount ?? 0, searchTerms: searchTerms.rowCount ?? 0 };
  },
};
