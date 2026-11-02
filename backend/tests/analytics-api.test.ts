import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { comparisonWindow, monthWindow, publicReconciliation } from '../src/services/analytics/reports.js';
import { api, createAdminUser, createSubAdmin, purgeSubAdmins } from './helpers.js';

/**
 * واجهة «التحليلات» — الصلاحية، الربح للأعلى وحده، الرياضيات، والحدود.
 *
 * الواجهة تقرأ من المجمَّع؛ الاختبار يكتب صفوف ملخّصٍ ملتزمة في نافذة ١٩٩٠
 * (بلا صفّ فترة، فيجوز حذفها) ثم يمحوها في النهاية.
 */

let superToken: string;
let analyticsOnly: { token: string };
let dashboardOnly: { token: string };
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function insertDay(day: string, values: Record<string, number>) {
  const columns = Object.keys(values);
  await db.query(
    `INSERT INTO analytics_daily_sales (stat_date, ${columns.join(', ')})
     VALUES ($1::date, ${columns.map((_, i) => `$${i + 2}`).join(', ')})`,
    [day, ...Object.values(values)],
  );
}

async function cleanup() {
  await db.query("DELETE FROM analytics_daily_sales WHERE stat_date >= '1990-01-01' AND stat_date < '1991-01-01'");
  await db.query("DELETE FROM analytics_monthly_customers WHERE month >= '1990-01-01' AND month < '1991-01-01'");
}

beforeAll(async () => {
  superToken = await createAdminUser();
  analyticsOnly = await createSubAdmin(['analytics'], { suffix: 74 });
  dashboardOnly = await createSubAdmin(['dashboard'], { suffix: 75 });
  await cleanup();
  // أبريل ١٩٩٠: تغطية تكلفة ناقصة. مايو ١٩٩٠: تغطية كاملة.
  await insertDay('1990-04-10', {
    orders_placed: 2, orders_completed: 2, gross_sales: 20000, product_discounts: 1000, birthday_discounts: 1000,
    sales_revenue: 19000, units_sold: 4, item_lines: 3, item_lines_with_cost: 2, cogs: 5000,
  });
  await insertDay('1990-05-10', {
    orders_placed: 3, orders_completed: 3, gross_sales: 30000, product_discounts: 500, loyalty_discounts: 500,
    sales_revenue: 29500, units_sold: 6, max_order_value: 15000, item_lines: 4, item_lines_with_cost: 4, cogs: 10000,
  });
  await db.query(
    `INSERT INTO analytics_monthly_customers (month, customers_end, customers_male_end, customers_female_end,
                                              new_customers, new_customers_male, new_customers_female, buyers,
                                              buyers_male, buyers_female, new_buyers, returning_buyers)
     VALUES ('1990-04-01', 10, 4, 5, 2, 1, 1, 2, 1, 1, 1, 1),
            ('1990-05-01', 13, 6, 6, 3, 2, 1, 3, 2, 1, 2, 1)`,
  );
});

afterAll(async () => {
  await cleanup();
  await purgeSubAdmins();
});

describe('الصلاحية (D4)', () => {
  it('[SECURITY] «الرئيسية» وحدها: مؤشرات الرئيسية بإيرادها متاحة، والتحليلات ٤٠٣', async () => {
    const stats = await api.get('/api/admin/stats').set(bearer(dashboardOnly.token)).expect(200);
    expect(stats.body.data.revenue).toBeDefined();
    await api.get('/api/admin/analytics/overview').query({ from: '1990-05', to: '1990-05' }).set(bearer(dashboardOnly.token)).expect(403);
  });

  it('[SECURITY] «التحليلات» بلا الأعلى: لا حقول ربح ولا تكلفة في أي ردّ', async () => {
    const overview = await api
      .get('/api/admin/analytics/overview')
      .query({ from: '1990-05', to: '1990-05' })
      .set(bearer(analyticsOnly.token))
      .expect(200);
    expect(overview.body.data.profit).toBeUndefined();
    const compare = await api.get('/api/admin/analytics/compare').query({ a: '1990-05', b: '1990-04' }).set(bearer(analyticsOnly.token)).expect(200);
    expect(compare.body.data.profit).toBeUndefined();
    const sales = await api.get('/api/admin/analytics/sales').query({ from: '1990-04', to: '1990-05' }).set(bearer(analyticsOnly.token)).expect(200);
    expect(JSON.stringify(sales.body)).not.toMatch(/profit|cogs|margin/i);
  });
});

describe('الأرقام والمقارنة', () => {
  it('[CRITICAL] الإيراد والفرق والنسبة والمتوسط — مقابل الشهر السابق', async () => {
    const res = await api
      .get('/api/admin/analytics/overview')
      .query({ from: '1990-05', to: '1990-05', compare: 'previous' })
      .set(bearer(superToken))
      .expect(200);
    const { kpis, range } = res.body.data;
    expect(range.partial).toBe(false);
    expect(kpis.salesRevenue).toEqual({ current: 29500, previous: 19000, delta: 10500, percent: 55.3 });
    expect(kpis.ordersCompleted).toEqual({ current: 3, previous: 2, delta: 1, percent: 50 });
    expect(kpis.averageOrderValue.current).toBe(9833);
    expect(kpis.customersMale).toEqual({ current: 6, previous: 4, delta: 2, percent: 50 });
    expect(kpis.customersFemale).toEqual({ current: 6, previous: 5, delta: 1, percent: 20 });
    // لا مؤشر جنسٍ ثالث.
    expect(Object.keys(kpis).filter((k) => /gender|unknown|unspecified|other/i.test(k))).toEqual([]);
  });

  it('[CRITICAL] الربح للأعلى: متاحٌ بتغطيةٍ كاملة، و«غير متاح» بلا رقمٍ جزئي حين تنقص', async () => {
    const res = await api
      .get('/api/admin/analytics/overview')
      .query({ from: '1990-05', to: '1990-05', compare: 'previous' })
      .set(bearer(superToken))
      .expect(200);
    expect(res.body.data.profit.current).toMatchObject({ available: true, grossProfit: 19500, cogs: 10000, marginPercent: 66.1 });
    expect(res.body.data.profit.previous).toMatchObject({
      available: false,
      grossProfit: null,
      cogs: null,
      marginPercent: null,
      coverage: { itemLines: 3, itemLinesWithCost: 2 },
    });
  });

  it('مقارنة شهرين بعينهما', async () => {
    const res = await api.get('/api/admin/analytics/compare').query({ a: '1990-05', b: '1990-04' }).set(bearer(superToken)).expect(200);
    expect(res.body.data.metrics.salesRevenue).toMatchObject({ current: 29500, previous: 19000 });
    expect(res.body.data.metrics.grossSales).toMatchObject({ current: 30000, previous: 20000 });
  });

  it('التوزيع حسب الجنس فئتان فقط', async () => {
    const res = await api.get('/api/admin/analytics/customers').query({ from: '1990-04', to: '1990-05' }).set(bearer(superToken)).expect(200);
    expect(res.body.data.genderDistribution).toEqual({ male: 6, female: 6 });
  });

  it('التسويق يعلن غير المتاح صراحةً بدل اختلاقه', async () => {
    const res = await api.get('/api/admin/analytics/marketing').query({ from: '1990-05', to: '1990-05' }).set(bearer(superToken)).expect(200);
    expect(res.body.data.unavailable).toEqual(['coupons', 'attribution']);
  });
});

describe('الحدود والتحقّق', () => {
  it('مدى غير صالح يُرفض', async () => {
    const bad = [
      ['/api/admin/analytics/overview', { from: '1990-13', to: '1990-13' }],
      ['/api/admin/analytics/overview', { from: '1990-05', to: '1990-04' }],
      ['/api/admin/analytics/overview', { from: '1980-01', to: '1990-12' }],
      ['/api/admin/analytics/sales', { granularity: 'day', from: '1990-01-01', to: '1991-12-31' }],
      ['/api/admin/analytics/sales', { granularity: 'day', from: '1990-02-30', to: '1990-03-01' }],
      ['/api/admin/analytics/compare', { a: '1990-5', b: '1990-04' }],
    ] as const;
    for (const [path, query] of bad) {
      await api.get(path).query(query).set(bearer(superToken)).expect(400);
    }
  });

  it('النافذة الجزئية تُقارَن بالمدّة نفسها من الشهر السابق', () => {
    const window = monthWindow('2026-10', '2026-10', '2026-10-04');
    expect(window).toMatchObject({ from: '2026-10-01', to: '2026-10-05', partial: true });
    expect(comparisonWindow(window, 'previous')).toMatchObject({ from: '2026-09-01', to: '2026-09-05' });
    expect(comparisonWindow(window, 'year')).toMatchObject({ from: '2025-10-01', to: '2025-10-05' });
    const full = monthWindow('2026-07', '2026-08', '2026-10-04');
    expect(full).toMatchObject({ from: '2026-07-01', to: '2026-09-01', partial: false });
    expect(comparisonWindow(full, 'previous')).toMatchObject({ from: '2026-05-01', to: '2026-07-01' });
  });

  it('[CRITICAL] شذوذ الجنس لا يخرج في المطابقة (D5)', () => {
    expect(publicReconciliation({ completedOrders: 3, genderIntegrityAnomalies: 120 })).toEqual({ completedOrders: 3 });
  });
});
