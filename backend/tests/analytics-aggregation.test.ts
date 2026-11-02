import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { analyticsAggregator } from '../src/services/analytics/aggregator.js';
import { rebuildMonths } from '../scripts/analyticsRebuild.js';
import { seedTestCatalog } from './helpers.js';

/**
 * المجمِّع التاريخي — تعريفات الإيراد، توقيت بغداد، النطاق (D2)، الجنس (D5)،
 * التكلفة (D1)، عدم التكرار، وإغلاق الأشهر.
 *
 * كل اختبار في معاملةٍ تُلغى: البيانات تُدرج بأوقاتٍ دقيقة في نافذةٍ هادئة
 * (فبراير/مارس ٢٠٢٤، سنةٌ كبيسة)، والملخّصات والأشهر المُغلقة تزول بعده.
 */

const TZ = config.storeTimezone;
let governorateId: string;
let otherGovernorateId: string;
let categoryId: string;

async function inTx(fn: (client: pg.PoolClient) => Promise<void>) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function insertUser(
  client: pg.PoolClient,
  input: { gender?: 'male' | 'female' | null; verifiedAt?: string | null; role?: 'customer' | 'admin'; internal?: boolean },
) {
  const role = input.role ?? 'customer';
  const gender = input.gender === undefined ? 'male' : input.gender;
  if (role === 'customer' && gender === null) {
    // شذوذ ما قبل ٠٤٠: الطريقة الوحيدة لوجوده بعد زناد ٠٧٢.
    await client.query('ALTER TABLE users DISABLE TRIGGER trg_users_customer_gender_guard');
  }
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (username, phone, password_hash, role, gender, phone_verified_at, is_internal_account, created_at)
     VALUES ('تحليلات', $1, 'x', $2, $3, $4, $5, COALESCE($4, now())) RETURNING id`,
    [
      `+96477${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`,
      role,
      gender,
      input.verifiedAt === undefined ? '2024-01-05T10:00:00Z' : input.verifiedAt,
      input.internal ?? false,
    ],
  );
  if (role === 'customer' && gender === null) {
    await client.query('ALTER TABLE users ENABLE TRIGGER trg_users_customer_gender_guard');
  }
  return rows[0]!.id;
}

async function insertProduct(client: pg.PoolClient, price: number, previousPrice: number | null = null, category = categoryId) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO products (name, description, price, previous_price, category_id, stock)
     VALUES ($1, '', $2, $3, $4, 20) RETURNING id`,
    [`منتج تجميع ${randomUUID().slice(0, 8)}`, price, previousPrice, category],
  );
  return rows[0]!.id;
}

interface OrderInput {
  userId: string;
  governorate?: string;
  productsTotal: number;
  discount?: number;
  loyalty?: number;
  deliveryFee?: number;
  deliveryDiscount?: number;
  status: string;
  createdAt: string;
  deliveredAt?: string;
  history?: Array<{ status: string; at: string }>;
  items?: Array<{ productId: string; quantity: number; price: number }>;
}

async function insertOrder(client: pg.PoolClient, input: OrderInput) {
  const discount = input.discount ?? 0;
  const deliveryFee = input.deliveryFee ?? 0;
  const deliveryDiscount = input.deliveryDiscount ?? 0;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone, products_total,
                         delivery_fee, discount, loyalty_discount, delivery_discount, total, status,
                         created_at, delivered_at)
     VALUES ($1, $2, $3, 'بغداد', 'عنوان', '+9647700000000', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      `AG-${randomUUID().slice(0, 8)}`,
      input.userId,
      input.governorate ?? governorateId,
      input.productsTotal,
      deliveryFee,
      discount,
      input.loyalty ?? 0,
      deliveryDiscount,
      input.productsTotal + (deliveryFee - deliveryDiscount) - discount,
      input.status,
      input.createdAt,
      input.deliveredAt ?? null,
    ],
  );
  const orderId = rows[0]!.id;
  await client.query(
    'INSERT INTO order_status_history (order_id, status, created_at) VALUES ($1, $2, $3)',
    [orderId, 'PENDING_ADMIN_CONFIRMATION', input.createdAt],
  );
  for (const step of input.history ?? []) {
    await client.query('INSERT INTO order_status_history (order_id, status, created_at) VALUES ($1, $2, $3)', [
      orderId,
      step.status,
      step.at,
    ]);
  }
  for (const item of input.items ?? []) {
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, line_total)
       VALUES ($1, $2, 'بند تجميع', $3, $4, $5)`,
      [orderId, item.productId, item.price, item.quantity, item.price * item.quantity],
    );
  }
  return orderId;
}

async function dailySales(client: pg.PoolClient, day: string) {
  const { rows } = await client.query<Record<string, string | number | null>>(
    `SELECT orders_placed, orders_completed, orders_rejected, orders_rejected_after_dispatch,
            gross_sales::float8, product_discounts::float8, birthday_discounts::float8, loyalty_discounts::float8,
            sales_revenue::float8, delivery_promo_given::float8, units_sold, max_order_value::float8,
            item_lines, item_lines_with_cost, cogs::float8, item_lines_with_list_price, promo_markdown::float8,
            excluded_orders_completed, excluded_sales_value::float8
       FROM analytics_daily_sales WHERE stat_date = $1::date`,
    [day],
  );
  return rows[0];
}

beforeAll(async () => {
  const catalog = await seedTestCatalog();
  governorateId = catalog.governorateId;
  categoryId = catalog.categoryId;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO governorates (name, delivery_fee) VALUES ('محافظة تحليلات اختبار', 6000)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  otherGovernorateId = rows[0]!.id;
});

describe('تعريفات الإيراد', () => {
  it('[CRITICAL] الإيراد = الإجمالي − خصومات المنتجات، ورسوم التوصيل ليست إيراداً', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const product = await insertProduct(client, 10000);
      await insertOrder(client, {
        userId: customer,
        productsTotal: 20000,
        discount: 1500,
        loyalty: 500,
        deliveryFee: 5000,
        deliveryDiscount: 2000,
        status: 'COMPLETED',
        createdAt: '2024-02-10T08:00:00Z',
        deliveredAt: '2024-02-12T09:00:00Z',
        items: [{ productId: product, quantity: 2, price: 10000 }],
      });
      await analyticsAggregator.computeDay(client, '2024-02-12', TZ);
      expect(await dailySales(client, '2024-02-12')).toMatchObject({
        orders_completed: 1,
        gross_sales: 20000,
        product_discounts: 1500,
        birthday_discounts: 1000,
        loyalty_discounts: 500,
        // 21 500 هو الإجمالي المدفوع مع التوصيل — ليس إيراد مبيعات.
        sales_revenue: 18500,
        delivery_promo_given: 2000,
        units_sold: 2,
        max_order_value: 18500,
      });
      // يوم الإنشاء يعدّ الطلب «مُنشأً» لا «مكتملاً».
      await analyticsAggregator.computeDay(client, '2024-02-10', TZ);
      expect(await dailySales(client, '2024-02-10')).toMatchObject({ orders_placed: 1, orders_completed: 0, sales_revenue: 0 });
    });
  });

  it('[CRITICAL] حدود يوم بغداد: 20:59:59Z يومٌ و21:00:00Z اليوم التالي (والشهر التالي عند ٢٩ فبراير)', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      for (const deliveredAt of ['2024-02-29T20:59:59Z', '2024-02-29T21:00:00Z']) {
        await insertOrder(client, {
          userId: customer,
          productsTotal: 1000,
          status: 'COMPLETED',
          createdAt: '2024-02-20T08:00:00Z',
          deliveredAt,
        });
      }
      for (const day of ['2024-02-28', '2024-02-29', '2024-03-01']) await analyticsAggregator.computeDay(client, day, TZ);
      expect((await dailySales(client, '2024-02-29'))?.orders_completed).toBe(1);
      expect((await dailySales(client, '2024-03-01'))?.orders_completed).toBe(1);
      expect((await dailySales(client, '2024-02-28'))?.orders_completed).toBe(0);
    });
  });

  it('[CRITICAL] إعادة الحساب لا تضاعف شيئاً', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const product = await insertProduct(client, 5000);
      await insertOrder(client, {
        userId: customer,
        productsTotal: 5000,
        status: 'COMPLETED',
        createdAt: '2024-02-05T08:00:00Z',
        deliveredAt: '2024-02-06T08:00:00Z',
        items: [{ productId: product, quantity: 1, price: 5000 }],
      });
      await analyticsAggregator.computeDay(client, '2024-02-06', TZ);
      const once = await dailySales(client, '2024-02-06');
      const productsOnce = await client.query('SELECT product_id, units, gross_value FROM analytics_daily_product WHERE stat_date = $1', ['2024-02-06']);
      await analyticsAggregator.computeDay(client, '2024-02-06', TZ);
      await analyticsAggregator.computeDay(client, '2024-02-06', TZ);
      expect(await dailySales(client, '2024-02-06')).toEqual(once);
      const productsThrice = await client.query('SELECT product_id, units, gross_value FROM analytics_daily_product WHERE stat_date = $1', ['2024-02-06']);
      expect(productsThrice.rows).toEqual(productsOnce.rows);
    });
  });
});

describe('النطاق التجاري (D2)', () => {
  it('[CRITICAL] طلب المسؤول وطلب الحساب الداخلي خارج الإيراد ومعدودان في المطابقة، والمرقّى لاحقاً يبقى داخلها', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const admin = await insertUser(client, { role: 'admin', gender: null });
      const internal = await insertUser(client, { internal: true });
      const promoted = await insertUser(client, { gender: 'female' });
      const base = { status: 'COMPLETED', createdAt: '2024-02-14T08:00:00Z', deliveredAt: '2024-02-15T08:00:00Z' };
      await insertOrder(client, { ...base, userId: customer, productsTotal: 10000 });
      await insertOrder(client, { ...base, userId: admin, productsTotal: 7000 });
      await insertOrder(client, { ...base, userId: internal, productsTotal: 3000, discount: 500 });
      await insertOrder(client, { ...base, userId: promoted, productsTotal: 2000 });
      // تُرقّى بعد طلبها (كما يفعل seedAdmin) — لقطة الدور ساعة الطلب تبقى «زبون».
      await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [promoted]);

      await analyticsAggregator.computeDay(client, '2024-02-15', TZ);
      expect(await dailySales(client, '2024-02-15')).toMatchObject({
        orders_completed: 2,
        gross_sales: 12000,
        sales_revenue: 12000,
        excluded_orders_completed: 2,
        excluded_sales_value: 9500,
      });
    });
  });
});

describe('دورة حالات الطلب', () => {
  it('الرفض يُعدّ يوم وقوعه، و«بعد الشحن» إن سبقه خروجٌ للتوصيل؛ وقيد المعالجة كما في نهاية الشهر', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      await insertOrder(client, {
        userId: customer, productsTotal: 1000, status: 'REJECTED', createdAt: '2024-02-01T08:00:00Z',
        history: [{ status: 'REJECTED', at: '2024-02-03T08:00:00Z' }],
      });
      await insertOrder(client, {
        userId: customer, productsTotal: 1000, status: 'REJECTED', createdAt: '2024-02-01T08:00:00Z',
        history: [{ status: 'OUT_FOR_DELIVERY', at: '2024-02-02T08:00:00Z' }, { status: 'REJECTED', at: '2024-02-03T09:00:00Z' }],
      });
      // أُنشئ في فبراير واكتمل في مارس: قيد المعالجة في نهاية فبراير.
      await insertOrder(client, {
        userId: customer, productsTotal: 1000, status: 'COMPLETED', createdAt: '2024-02-27T08:00:00Z',
        deliveredAt: '2024-03-02T08:00:00Z',
        history: [{ status: 'OUT_FOR_DELIVERY', at: '2024-02-28T08:00:00Z' }, { status: 'COMPLETED', at: '2024-03-02T08:00:00Z' }],
      });
      await analyticsAggregator.computeDay(client, '2024-02-03', TZ);
      expect(await dailySales(client, '2024-02-03')).toMatchObject({ orders_rejected: 2, orders_rejected_after_dispatch: 1 });

      await analyticsAggregator.computeMonthly(client, '2024-02-01', '2024-03-01', TZ);
      const { rows } = await client.query<{ processing_at_end: number }>(
        "SELECT processing_at_end FROM analytics_monthly_orders WHERE month = '2024-02-01'",
      );
      expect(rows[0]!.processing_at_end).toBe(1);
    });
  });
});

describe('الزبائن والجنس (D5)', () => {
  it('[CRITICAL] فئتان فقط: الحساب بلا جنس يدخل المجموع لا التقسيم، والمشترون الجدد والعائدون والمكرِّرون', async () => {
    await inTx(async (client) => {
      const male = await insertUser(client, { gender: 'male', verifiedAt: '2024-02-03T08:00:00Z' });
      const female = await insertUser(client, { gender: 'female', verifiedAt: '2024-02-04T08:00:00Z' });
      const legacy = await insertUser(client, { gender: null, verifiedAt: '2024-02-05T08:00:00Z' });
      const old = await insertUser(client, { gender: 'female', verifiedAt: '2023-12-01T08:00:00Z' });
      await insertUser(client, { gender: 'male', verifiedAt: null }); // غير مفعَّل: ليس زبوناً
      await insertUser(client, { gender: 'male', verifiedAt: '2024-02-06T08:00:00Z', internal: true });
      const completed = (userId: string, day: string) =>
        insertOrder(client, { userId, productsTotal: 1000, status: 'COMPLETED', createdAt: `${day}T05:00:00Z`, deliveredAt: `${day}T06:00:00Z` });
      await completed(old, '2024-01-10');
      await completed(old, '2024-02-10');
      await completed(male, '2024-02-11');
      await completed(male, '2024-02-12');
      await completed(legacy, '2024-02-13');

      await analyticsAggregator.computeMonthly(client, '2024-02-01', '2024-03-01', TZ);
      const { rows } = await client.query<Record<string, number>>(
        "SELECT * FROM analytics_monthly_customers WHERE month = '2024-02-01'",
      );
      const month = rows[0]!;
      // لا عمود جنسٍ ثالث بأي اسم.
      expect(Object.keys(month).filter((k) => /gender|unknown|unspecified|other/i.test(k))).toEqual([]);
      const ours = { new_customers: 3, new_customers_male: 1, new_customers_female: 1 };
      expect(month).toMatchObject(ours);
      expect(month.buyers).toBeGreaterThanOrEqual(3);
      expect(month.new_customers_male + month.new_customers_female).toBe(month.new_customers - 1);
      void female;
    });
  });

  it('المشترون: جديدٌ أول شراءٍ له هذا الشهر، وعائدٌ له شراء سابق، ومكرِّرٌ بطلبين فأكثر', async () => {
    await inTx(async (client) => {
      const first = await insertUser(client, { gender: 'male' });
      const returning = await insertUser(client, { gender: 'female' });
      const done = (userId: string, day: string) =>
        insertOrder(client, { userId, productsTotal: 1000, status: 'COMPLETED', createdAt: `${day}T05:00:00Z`, deliveredAt: `${day}T06:00:00Z` });
      await done(returning, '2023-11-10');
      await done(returning, '2024-02-08');
      await done(first, '2024-02-09');
      await done(first, '2024-02-19');
      // يُقاس على مشتري هذه المعاملة وحدهم: نافذة فبراير ٢٠٢٤ في قاعدة اختبارٍ مشتركة.
      const { rows } = await client.query<{ new_buyer: boolean; repeat: boolean; user_id: string }>(
        `SELECT o.user_id, count(*) >= 2 AS repeat,
                min(o.delivered_at) FILTER (WHERE TRUE) >= '2024-02-01T00:00:00+03' AND
                (SELECT min(f.delivered_at) FROM analytics_business_orders f WHERE f.user_id = o.user_id) >= '2024-02-01T00:00:00+03' AS new_buyer
           FROM analytics_business_orders o
          WHERE o.user_id = ANY($1::uuid[]) AND o.delivered_at >= '2024-02-01T00:00:00+03' AND o.delivered_at < '2024-03-01T00:00:00+03'
          GROUP BY o.user_id`,
        [[first, returning]],
      );
      const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r]));
      expect(byUser[first]).toMatchObject({ new_buyer: true, repeat: true });
      expect(byUser[returning]).toMatchObject({ new_buyer: false, repeat: false });

      await analyticsAggregator.computeMonthly(client, '2024-02-01', '2024-03-01', TZ);
      const month = (await client.query<Record<string, number>>("SELECT * FROM analytics_monthly_customers WHERE month = '2024-02-01'")).rows[0]!;
      expect(month.new_buyers + month.returning_buyers).toBe(month.buyers);
      expect(month.repeat_buyers).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('المنتجات والأقسام والتكلفة (D1)', () => {
  it('[CRITICAL] القسم من اللقطة لا من المنتج الحالي، والتكلفة من لقطة البند وحدها', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const product = await insertProduct(client, 8000, 10000);
      const orderId = await insertOrder(client, {
        userId: customer, productsTotal: 16000, status: 'COMPLETED', createdAt: '2024-02-20T05:00:00Z',
        deliveredAt: '2024-02-21T05:00:00Z', items: [{ productId: product, quantity: 2, price: 8000 }],
      });
      const { rows: [entry] } = await client.query<{ id: string }>(
        'INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 3000) RETURNING id',
        [product],
      );
      await client.query(
        'UPDATE order_items SET unit_cost = 3000, cost_entry_id = $2, cost_captured_at = now() WHERE order_id = $1',
        [orderId, entry!.id],
      );
      // بعد البيع: المنتج ينتقل إلى قسمٍ آخر وتتغيّر تكلفته — التاريخ لا يتبعه.
      const { rows: [other] } = await client.query<{ id: string }>(
        'INSERT INTO categories (name) VALUES ($1) RETURNING id',
        [`قسم تجميع ${randomUUID().slice(0, 8)}`],
      );
      await client.query('UPDATE products SET category_id = $2 WHERE id = $1', [product, other!.id]);
      await client.query('INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 9999)', [product]);

      await analyticsAggregator.computeDay(client, '2024-02-21', TZ);
      expect(await dailySales(client, '2024-02-21')).toMatchObject({
        item_lines: 1, item_lines_with_cost: 1, cogs: 6000, item_lines_with_list_price: 1, promo_markdown: 4000,
      });
      const cat = await client.query<{ category_id: string; lines_basis_snapshot: number }>(
        "SELECT category_id, lines_basis_snapshot FROM analytics_daily_category WHERE stat_date = '2024-02-21'",
      );
      expect(cat.rows).toEqual([{ category_id: categoryId, lines_basis_snapshot: 1 }]);
    });
  });

  it('[CRITICAL] بندٌ بلا لقطة تكلفة: لا كلفة مختلَقة، والتغطية ناقصة', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const product = await insertProduct(client, 4000);
      await client.query('INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 1000)', [product]);
      await insertOrder(client, {
        userId: customer, productsTotal: 4000, status: 'COMPLETED', createdAt: '2024-02-22T05:00:00Z',
        deliveredAt: '2024-02-22T06:00:00Z', items: [{ productId: product, quantity: 1, price: 4000 }],
      });
      await analyticsAggregator.computeDay(client, '2024-02-22', TZ);
      expect(await dailySales(client, '2024-02-22')).toMatchObject({ item_lines: 1, item_lines_with_cost: 0, cogs: 0 });
    });
  });

  it('المحافظة: الطلبات والإيراد لكل محافظة، والمشترون شهرياً', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      await insertOrder(client, {
        userId: customer, governorate: otherGovernorateId, productsTotal: 3000, discount: 250, status: 'COMPLETED',
        createdAt: '2024-02-23T05:00:00Z', deliveredAt: '2024-02-23T07:00:00Z',
      });
      await analyticsAggregator.computeDay(client, '2024-02-23', TZ);
      const { rows } = await client.query<Record<string, string | number>>(
        "SELECT orders_placed, orders_completed, sales_revenue::float8 FROM analytics_daily_governorate WHERE stat_date = '2024-02-23' AND governorate_id = $1",
        [otherGovernorateId],
      );
      expect(rows[0]).toEqual({ orders_placed: 1, orders_completed: 1, sales_revenue: 2750 });
    });
  });
});

describe('النشاط (D3) — لا صفر مختلَق خارج حقبة التتبّع', () => {
  it('[CRITICAL] بلا حقبة: لا صفّ نشاط؛ داخل حقبة: يُعدّ زبائن الأعمال وحدهم', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      const internal = await insertUser(client, { internal: true });
      for (const user of [customer, internal]) {
        await client.query(
          "INSERT INTO user_daily_activity (user_id, activity_date, logins) VALUES ($1, '2024-02-10', 2)",
          [user],
        );
      }
      await client.query('UPDATE analytics_tracking_epochs SET disabled_at = enabled_at WHERE disabled_at IS NULL AND enabled_at > $1', ['2024-03-01']);
      const covering = await client.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM analytics_tracking_epochs WHERE enabled_at < '2024-02-11' AND (disabled_at IS NULL OR disabled_at > '2024-02-10')",
      );
      if (covering.rows[0]!.n === '0') {
        await analyticsAggregator.computeDay(client, '2024-02-10', TZ);
        const none = await client.query("SELECT 1 FROM analytics_daily_activity WHERE stat_date = '2024-02-10'");
        expect(none.rowCount).toBe(0);
      }
      await client.query(
        "INSERT INTO analytics_tracking_epochs (enabled_at, disabled_at) VALUES ('2024-02-09T00:00:00Z', '2024-02-12T00:00:00Z')",
      );
      await analyticsAggregator.computeDay(client, '2024-02-10', TZ);
      const { rows } = await client.query<{ active_customers: number; logins: number }>(
        "SELECT active_customers, logins FROM analytics_daily_activity WHERE stat_date = '2024-02-10'",
      );
      expect(rows[0]).toEqual({ active_customers: 1, logins: 2 });
    });
  });
});

describe('إغلاق الأشهر وإعادة البناء', () => {
  it('[CRITICAL] الشهر يُغلق بعد المهلة، ثم لا يكتب فيه إلا إعادة بناءٍ مُدقَّقة بسبب', async () => {
    await inTx(async (client) => {
      const customer = await insertUser(client, {});
      await insertOrder(client, {
        userId: customer, productsTotal: 5000, status: 'COMPLETED', createdAt: '2024-02-07T05:00:00Z',
        deliveredAt: '2024-02-08T05:00:00Z',
      });
      await client.query("INSERT INTO analytics_periods (month) VALUES ('2024-02-01') ON CONFLICT DO NOTHING");

      // ٧ مارس: ما زالت المهلة — يُحسب ولا يُغلق.
      const open = await analyticsAggregator.processOpenMonth(client, '2024-02-01', '2024-03-07', TZ);
      expect(open.action).toBe('recomputed');
      // ٨ مارس: انقضت المهلة — يُغلق والمطابقة سليمة.
      const closed = await analyticsAggregator.processOpenMonth(client, '2024-02-01', '2024-03-08', TZ);
      expect(closed.action).toBe('closed');
      const period = await client.query<{ status: string; reconciliation: { sourceCheck: { matches: boolean } } }>(
        "SELECT status, reconciliation FROM analytics_periods WHERE month = '2024-02-01'",
      );
      expect(period.rows[0]!.status).toBe('closed');
      expect(period.rows[0]!.reconciliation.sourceCheck.matches).toBe(true);
      const before = await dailySales(client, '2024-02-08');

      // طلبٌ آخر يظهر بعد الإغلاق (بيانات فاسدة مثلاً): المهمّة لا تمسّ الشهر.
      await client.query('SAVEPOINT closed_write');
      await expect(analyticsAggregator.computeDay(client, '2024-02-08', TZ)).rejects.toThrow(/is closed/);
      await client.query('ROLLBACK TO SAVEPOINT closed_write');
      expect((await analyticsAggregator.processOpenMonth(client, '2024-02-01', '2024-03-09', TZ)).action).toBe('skipped');

      // إعادة البناء بلا --include-closed تُرفض.
      await client.query('SAVEPOINT rebuild_refused');
      await expect(
        rebuildMonths(client, { from: '2024-02', to: '2024-02', includeClosed: false, reason: 'اختبار', actor: 'test', today: '2024-03-09', transactional: false }),
      ).rejects.toThrow(/مُغلق/);
      await client.query('ROLLBACK TO SAVEPOINT rebuild_refused');

      // ومعه وبسبب: تُعاد وتُسجَّل، ويبقى الشهر مُغلقاً.
      await rebuildMonths(client, { from: '2024-02', to: '2024-02', includeClosed: true, reason: 'تصحيح اختبار', actor: 'test', today: '2024-03-09', transactional: false });
      const log = await client.query<{ reason: string; include_closed: boolean; before: { status: string } }>(
        "SELECT reason, include_closed, before FROM analytics_rebuild_log WHERE scope_from = '2024-02-01' ORDER BY id DESC LIMIT 1",
      );
      expect(log.rows[0]).toMatchObject({ reason: 'تصحيح اختبار', include_closed: true });
      expect(log.rows[0]!.before.status).toBe('closed');
      const after = await client.query<{ status: string }>("SELECT status FROM analytics_periods WHERE month = '2024-02-01'");
      expect(after.rows[0]!.status).toBe('closed');
      expect(await dailySales(client, '2024-02-08')).toEqual(before);
    });
  });

  it('الشهر «المتّسخ» يُعاد كاملاً، والنظيف يُحدَّث من آخر يومٍ محسوب ناقص ثلاثة', async () => {
    await inTx(async (client) => {
      await client.query("INSERT INTO analytics_periods (month) VALUES ('2024-03-01') ON CONFLICT DO NOTHING");
      await analyticsAggregator.processOpenMonth(client, '2024-03-01', '2024-03-20', TZ);
      const first = await client.query<{ computed_through: string; dirty: boolean }>(
        "SELECT computed_through::text, dirty FROM analytics_periods WHERE month = '2024-03-01'",
      );
      expect(first.rows[0]).toEqual({ computed_through: '2024-03-20', dirty: false });
      const customer = await insertUser(client, {});
      // طلبٌ في يومٍ قديم من الشهر يظهر لاحقاً — لا يلتقطه التحديث الجزئي…
      await insertOrder(client, { userId: customer, productsTotal: 700, status: 'COMPLETED', createdAt: '2024-03-02T05:00:00Z', deliveredAt: '2024-03-02T06:00:00Z' });
      expect((await analyticsAggregator.processOpenMonth(client, '2024-03-01', '2024-03-21', TZ)).action).toBe('refreshed');
      expect((await dailySales(client, '2024-03-02'))?.orders_completed).toBe(0);
      // …لكن تعليم الشهر «متّسخاً» (حساب داخلي، إكمال جنس) يعيده كاملاً.
      await client.query("UPDATE analytics_periods SET dirty = TRUE WHERE month = '2024-03-01'");
      expect((await analyticsAggregator.processOpenMonth(client, '2024-03-01', '2024-03-21', TZ)).action).toBe('recomputed');
      expect((await dailySales(client, '2024-03-02'))?.orders_completed).toBe(1);
    });
  });
});
