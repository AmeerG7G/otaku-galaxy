import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * بنية التحليلات التاريخية (الهجرات ٠٧٦–٠٨٠): حرّاس قاعدة البيانات نفسها.
 *
 * كل اختبار يعمل في معاملةٍ تُلغى في نهايته: جداول هذه الهجرات دائمة أو إلحاقية
 * عن قصد (لا حذف)، فلا يجوز أن تترك الاختبارات أثراً فيها.
 */

let customerId: string;
let governorateId: string;
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

/** يتوقّع فشل الجملة داخل المعاملة دون أن يُفسدها (نقطة حفظ). */
async function expectFailure(client: pg.PoolClient, sql: string, params: unknown[], pattern: RegExp | string) {
  await client.query('SAVEPOINT expect_failure');
  let error: unknown = null;
  try {
    await client.query(sql, params);
  } catch (caught) {
    error = caught;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_failure');
  expect(error, `expected failure: ${sql}`).not.toBeNull();
  const { code, message } = error as { code?: string; message?: string };
  if (typeof pattern === 'string') expect(code).toBe(pattern);
  else expect(message).toMatch(pattern);
}

async function insertProduct(client: pg.PoolClient, price: number, previousPrice: number | null = null) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO products (name, description, price, previous_price, category_id, stock)
     VALUES ($1, '', $2, $3, $4, 5) RETURNING id`,
    [`منتج تحليلات ${randomUUID().slice(0, 8)}`, price, previousPrice, categoryId],
  );
  return rows[0]!.id;
}

async function insertOrder(client: pg.PoolClient, userId: string) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone,
                         products_total, delivery_fee, discount, total)
     VALUES ($1, $2, $3, 'بغداد', 'عنوان', '+9647700000000', 10000, 4000, 0, 14000) RETURNING id`,
    [`A-${randomUUID().slice(0, 8)}`, userId, governorateId],
  );
  return rows[0]!.id;
}

async function insertItem(client: pg.PoolClient, orderId: string, productId: string, price: number) {
  const { rows } = await client.query<{ id: string; category_id: string; list_price: string }>(
    `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, line_total)
     VALUES ($1, $2, 'بند', $3, 1, $3) RETURNING id, category_id, list_price`,
    [orderId, productId, price],
  );
  return rows[0]!;
}

beforeAll(async () => {
  customerId = (await registerAndLogin()).userId;
  const catalog = await seedTestCatalog();
  governorateId = catalog.governorateId;
  categoryId = catalog.categoryId;
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('الأشهر المُغلقة (٠٧٦)', () => {
  it('[CRITICAL] صفوف الشهر المُغلق لا تُدرج ولا تُعدَّل ولا تُحذف', async () => {
    await inTx(async (client) => {
      await client.query("INSERT INTO analytics_periods (month) VALUES ('1999-02-01')");
      await client.query("INSERT INTO analytics_daily_sales (stat_date, orders_placed) VALUES ('1999-02-10', 3)");
      await client.query(
        "UPDATE analytics_periods SET status = 'closed', closed_at = now() WHERE month = '1999-02-01'",
      );
      await expectFailure(client, "UPDATE analytics_daily_sales SET orders_placed = 4 WHERE stat_date = '1999-02-10'", [], /is closed/);
      await expectFailure(client, "DELETE FROM analytics_daily_sales WHERE stat_date = '1999-02-10'", [], /is closed/);
      await expectFailure(client, "INSERT INTO analytics_daily_sales (stat_date) VALUES ('1999-02-11')", [], /is closed/);
      await expectFailure(
        client,
        "INSERT INTO analytics_monthly_orders (month, processing_at_end) VALUES ('1999-02-01', 1)",
        [],
        /is closed/,
      );
      // شهرٌ مفتوح بجواره لا يتأثّر.
      await client.query("INSERT INTO analytics_daily_sales (stat_date) VALUES ('1999-03-01')");
    });
  });

  it('[CRITICAL] لا يُعاد فتح الشهر ولا يُحذف — وإعادة البناء المُدقَّقة وحدها تكتب فيه', async () => {
    await inTx(async (client) => {
      await client.query("INSERT INTO analytics_periods (month) VALUES ('1999-04-01')");
      await client.query("INSERT INTO analytics_daily_sales (stat_date, orders_placed) VALUES ('1999-04-02', 1)");
      await client.query(
        "UPDATE analytics_periods SET status = 'closed', closed_at = now() WHERE month = '1999-04-01'",
      );
      await expectFailure(client, "UPDATE analytics_periods SET status = 'open', closed_at = NULL WHERE month = '1999-04-01'", [], /cannot be reopened|is closed/);
      await expectFailure(client, "DELETE FROM analytics_periods WHERE month = '1999-04-01'", [], /permanent/);
      await expectFailure(client, "UPDATE analytics_periods SET reconciliation = '{}' WHERE month = '1999-04-01'", [], /is closed/);

      await client.query("SET LOCAL analytics.rebuild = 'on'");
      await client.query("UPDATE analytics_daily_sales SET orders_placed = 2 WHERE stat_date = '1999-04-02'");
      await client.query("UPDATE analytics_periods SET reconciliation = '{\"rebuilt\":true}' WHERE month = '1999-04-01'");
      await expectFailure(client, "UPDATE analytics_periods SET status = 'open', closed_at = NULL WHERE month = '1999-04-01'", [], /cannot be reopened/);
    });
  });

  it('[CRITICAL] الإيراد = الإجمالي − خصومات المنتجات (لا توصيل)، والخصومات = ميلاد + مزيّة', async () => {
    await inTx(async (client) => {
      await expectFailure(
        client,
        `INSERT INTO analytics_daily_sales (stat_date, gross_sales, product_discounts, birthday_discounts, sales_revenue)
         VALUES ('1999-05-01', 10000, 500, 500, 14000)`,
        [],
        '23514',
      );
      await expectFailure(
        client,
        `INSERT INTO analytics_daily_sales (stat_date, gross_sales, product_discounts, birthday_discounts, sales_revenue)
         VALUES ('1999-05-02', 10000, 500, 0, 9500)`,
        [],
        '23514',
      );
    });
  });

  it('سجلّ إعادة البناء إلحاقيّ', async () => {
    await inTx(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO analytics_rebuild_log (scope_from, scope_to, include_closed, reason, actor, before, after)
         VALUES ('1999-01-01', '1999-01-31', FALSE, 'اختبار', 'test', '{}', '{}') RETURNING id`,
      );
      await expectFailure(client, 'UPDATE analytics_rebuild_log SET reason = $2 WHERE id = $1', [rows[0]!.id, 'x'], /append-only/);
      await expectFailure(client, 'DELETE FROM analytics_rebuild_log WHERE id = $1', [rows[0]!.id], /append-only/);
    });
  });
});

describe('النطاق التجاري (D2) — عروضٌ لا تتجاوزها التحليلات', () => {
  it('[CRITICAL] طلب المسؤول والحساب الداخلي خارج الطلبات التجارية، وطلب الزبون داخلها', async () => {
    await inTx(async (client) => {
      const customerOrder = await insertOrder(client, customerId);
      const { rows: [admin] } = await client.query<{ id: string }>(
        `INSERT INTO users (username, phone, password_hash, role, phone_verified_at)
         VALUES ('مسؤول', '+9647709999901', 'x', 'admin', now()) RETURNING id`,
      );
      const adminOrder = await insertOrder(client, admin!.id);
      const internal = (await client.query<{ id: string }>(
        `INSERT INTO users (username, phone, password_hash, gender, phone_verified_at, is_internal_account)
         VALUES ('داخلي', '+9647709999902', 'x', 'male', now(), TRUE) RETURNING id`,
      )).rows[0]!.id;
      const internalOrder = await insertOrder(client, internal);

      const { rows } = await client.query<{ id: string }>(
        'SELECT id FROM analytics_business_orders WHERE id = ANY($1::uuid[])',
        [[customerOrder, adminOrder, internalOrder]],
      );
      expect(rows.map((r) => r.id)).toEqual([customerOrder]);

      const customers = await client.query<{ id: string }>(
        'SELECT id FROM analytics_business_customers WHERE id = ANY($1::uuid[])',
        [[customerId, admin!.id, internal]],
      );
      expect(customers.rows.map((r) => r.id)).toEqual([customerId]);
    });
  });

  it('عرض الزبائن التجاريين لا يكشف كلمة المرور ولا الهاتف', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'analytics_business_customers' AND table_schema = current_schema()`,
    );
    const columns = rows.map((r) => r.column_name).sort();
    expect(columns).toEqual(['created_at', 'gender', 'id', 'is_active', 'phone_verified_at']);
  });
});

describe('لقطات بند الطلب (٠٧٧)', () => {
  it('[CRITICAL] القسم والسعر المعلَن يُلتقطان ساعة الإنشاء ولا يتبعان تغيّر المنتج', async () => {
    await inTx(async (client) => {
      const productId = await insertProduct(client, 8000, 10000);
      const orderId = await insertOrder(client, customerId);
      const item = await insertItem(client, orderId, productId, 8000);
      expect(item.category_id).toBe(categoryId);
      expect(Number(item.list_price)).toBe(10000);

      const { rows: [other] } = await client.query<{ id: string }>(
        `INSERT INTO categories (name) VALUES ($1) RETURNING id`,
        [`قسم آخر ${randomUUID().slice(0, 8)}`],
      );
      await client.query('UPDATE products SET category_id = $2, previous_price = NULL WHERE id = $1', [productId, other!.id]);
      const after = await client.query<{ category_id: string; list_price: string }>(
        'SELECT category_id, list_price FROM order_items WHERE id = $1',
        [item.id],
      );
      expect(after.rows[0]).toEqual({ category_id: categoryId, list_price: '10000.00' });
      await expectFailure(client, 'UPDATE order_items SET category_id = $2 WHERE id = $1', [item.id, other!.id], /immutable/);
    });
  });

  it('منتجٌ بلا سعرٍ سابق: السعر المعلَن = سعره', async () => {
    await inTx(async (client) => {
      const productId = await insertProduct(client, 5000);
      const item = await insertItem(client, await insertOrder(client, customerId), productId, 5000);
      expect(Number(item.list_price)).toBe(5000);
    });
  });
});

describe('تكلفة الشراء (٠٧٨، D1)', () => {
  it('[CRITICAL] سجلّ التكلفة إلحاقيّ بوقت الخادم — لا تعديل ولا حذف ولا تأريخ رجعي', async () => {
    await inTx(async (client) => {
      const productId = await insertProduct(client, 9000);
      const { rows: [entry] } = await client.query<{ id: string; effective_from: Date }>(
        `INSERT INTO product_cost_entries (product_id, unit_cost, effective_from)
         VALUES ($1, 4000, '2001-01-01') RETURNING id, effective_from`,
        [productId],
      );
      expect(entry!.effective_from.getUTCFullYear()).toBeGreaterThan(2001);
      await expectFailure(client, 'UPDATE product_cost_entries SET unit_cost = 1 WHERE id = $1', [entry!.id], /append-only/);
      await expectFailure(client, 'DELETE FROM product_cost_entries WHERE id = $1', [entry!.id], /append-only/);
      await expectFailure(
        client,
        'INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 0)',
        [productId],
        '23514',
      );
      // حذف حساب المُدخِل يفرّغ المرجع وحده.
      await client.query('UPDATE product_cost_entries SET entered_by = NULL WHERE id = $1', [entry!.id]);
      await expectFailure(client, 'UPDATE product_cost_entries SET entered_by = $2 WHERE id = $1', [entry!.id, customerId], /append-only/);
    });
  });

  it('[CRITICAL] لقطة تكلفة البند: لا تُكتب عند الإدراج، تُكتب مرة واحدة، وتطابق صفّها', async () => {
    await inTx(async (client) => {
      const productId = await insertProduct(client, 9000);
      const otherProduct = await insertProduct(client, 9000);
      const { rows: [entry] } = await client.query<{ id: string }>(
        'INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 4000) RETURNING id',
        [productId],
      );
      const { rows: [otherEntry] } = await client.query<{ id: string }>(
        'INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 3000) RETURNING id',
        [otherProduct],
      );
      const orderId = await insertOrder(client, customerId);
      await expectFailure(
        client,
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, line_total,
                                  unit_cost, cost_entry_id, cost_captured_at)
         VALUES ($1, $2, 'بند', 9000, 1, 9000, 4000, $3, now())`,
        [orderId, productId, entry!.id],
        /captured at approval/,
      );
      const item = await insertItem(client, orderId, productId, 9000);
      await expectFailure(
        client,
        'UPDATE order_items SET unit_cost = 3000, cost_entry_id = $2, cost_captured_at = now() WHERE id = $1',
        [item.id, otherEntry!.id],
        /must match/,
      );
      // لقطةٌ ناقصة (تكلفة بلا صفّها المرجعي) يرفضها الزناد قبل القيد.
      await expectFailure(client, 'UPDATE order_items SET unit_cost = 4000 WHERE id = $1', [item.id], /must match/);
      await client.query(
        'UPDATE order_items SET unit_cost = 4000, cost_entry_id = $2, cost_captured_at = now() WHERE id = $1',
        [item.id, entry!.id],
      );
      // تكلفةٌ جديدة للمنتج لاحقاً لا تمسّ اللقطة.
      await client.query('INSERT INTO product_cost_entries (product_id, unit_cost) VALUES ($1, 7000)', [productId]);
      await expectFailure(
        client,
        'UPDATE order_items SET unit_cost = 7000, cost_entry_id = (SELECT id FROM product_cost_entries WHERE product_id = $2 AND unit_cost = 7000), cost_captured_at = now() WHERE id = $1',
        [item.id, productId],
        /write-once/,
      );
      const { rows } = await client.query<{ unit_cost: string }>('SELECT unit_cost FROM order_items WHERE id = $1', [item.id]);
      expect(rows[0]!.unit_cost).toBe('4000.00');
    });
  });
});

describe('التتبّع والمخزون (٠٧٩–٠٨٠)', () => {
  it('حقبة تتبّعٍ مفتوحة واحدة فقط، والمشاركات المؤكَّدة لا تتجاوز المفتوحة', async () => {
    await inTx(async (client) => {
      await client.query('UPDATE analytics_tracking_epochs SET disabled_at = now() WHERE disabled_at IS NULL');
      await client.query('INSERT INTO analytics_tracking_epochs DEFAULT VALUES');
      await expectFailure(client, 'INSERT INTO analytics_tracking_epochs DEFAULT VALUES', [], '23505');
      await expectFailure(
        client,
        `INSERT INTO product_daily_counters (stat_date, product_id, share_opens, share_confirmed)
         VALUES ('1999-06-01', $1, 1, 2)`,
        [randomUUID()],
        '23514',
      );
      await expectFailure(
        client,
        "INSERT INTO search_daily_terms (stat_date, term, searches) VALUES ('1999-06-01', 'x', 1)",
        [],
        '23514',
      );
    });
  });

  it('لقطة المخزون لا تتغيّر ولا تُحذف', async () => {
    await inTx(async (client) => {
      const productId = randomUUID();
      await client.query(
        "INSERT INTO inventory_daily_snapshot (snapshot_date, product_id, stock, is_active) VALUES ('1999-06-01', $1, 3, TRUE)",
        [productId],
      );
      await expectFailure(client, 'UPDATE inventory_daily_snapshot SET stock = 4 WHERE product_id = $1', [productId], /immutable/);
      await expectFailure(client, 'DELETE FROM inventory_daily_snapshot WHERE product_id = $1', [productId], /immutable/);
    });
  });
});
