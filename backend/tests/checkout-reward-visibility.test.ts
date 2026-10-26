import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * [CRITICAL REGRESSION] خصم مزيّة المستوى مرئيٌّ من المطالبة إلى لوحة التحكم.
 *
 * العطل (2026-09-27): الزبون يطالب بمزيّة الخصم، يملأ عربته، ويصل إلى ملخّص
 * الطلب فلا يجد الخصم. الإنشاء كان يطبّقه، لكن شاشتَي الدفع لم تعرفا به
 * (تعاينان خصم الميلاد وحده على العميل)، ولا التطبيق ولا اللوحة قرأا
 * `loyaltyDiscount` المحفوظ. هنا السلسلة كلها بأرقام الخادم:
 *   المطالبة → العربة → `GET /orders/checkout-quote` → الإنشاء → الصفّ المحفوظ
 *   → طلب الزبون → طلب اللوحة.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  await purgeTestUsers();
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

afterAll(async () => {
  await purgeTestUsers();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function customerWith(points: number) {
  const user = await registerAndLogin();
  if (points > 0) {
    await db.query(
      `INSERT INTO points_ledger (user_id, label, amount, reason)
       VALUES ($1, 'رصيد اختبار', $2, 'manual')`,
      [user.userId, points],
    );
  }
  return user;
}

async function productAt(price: number, stock = 500) {
  const name = `منتج ملخّص ${price}-${Math.random().toString(36).slice(2, 8)}`;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ($1, 'وصف', $2, $3, $4, $5) RETURNING id`,
    [name, price, catalog.categoryId, catalog.subcategoryId, stock],
  );
  return rows[0]!.id;
}

async function addToCart(token: string, productId: string, quantity = 1) {
  await api.post('/api/cart').set(bearer(token)).send({ productId, quantity }).expect(200);
}

async function quote(token: string, query: Record<string, string> = {}) {
  const res = await api.get('/api/orders/checkout-quote').query(query).set(bearer(token));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data as {
    productsTotal: number;
    birthdayDiscount: number;
    loyaltyDiscount: number;
    loyaltyReward: { levelKey: string; percent: number; capAmount: number } | null;
    discount: number;
    deliveryFee: number | null;
    deliveryDiscount: number;
    total: number | null;
  };
}

async function redemption(userId: string, levelKey: string) {
  const { rows } = await db.query<{ consumed_at: Date | null; consumed_order_id: string | null }>(
    `SELECT consumed_at, consumed_order_id FROM loyalty_reward_redemptions
      WHERE user_id = $1 AND level_key = $2`,
    [userId, levelKey],
  );
  return rows[0];
}

function placeOrder(token: string) {
  return api.post('/api/orders').set(bearer(token)).send({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07733333333',
  });
}

describe('[CRITICAL] المزيّة المطالَب بها تظهر في ملخّص الدفع قبل التأكيد', () => {
  it('المطالبة → العربة → الملخّص يعرض الخصم بقيمته المسقوفة على الخادم', async () => {
    const user = await customerWith(100);
    await api.post('/api/points/rewards/explorer/claim').set(bearer(user.token)).expect(200);
    await addToCart(user.token, await productAt(100_000));

    const summary = await quote(user.token);
    // ٣٪ من ١٠٠٬٠٠٠ = ٣٬٠٠٠ — من الخادم لا من العميل.
    expect(summary.productsTotal).toBe(100_000);
    expect(summary.loyaltyDiscount).toBe(3_000);
    expect(summary.loyaltyReward).toEqual({ levelKey: 'explorer', percent: 3, capAmount: 5_000 });
    expect(summary.discount).toBe(3_000);
    // قبل اختيار المحافظة لا رسوم ولا إجمالي — لا رقمَ قد يتغيّر.
    expect(summary.deliveryFee).toBeNull();
    expect(summary.total).toBeNull();

    // بعد اختيار المحافظة: الرسوم والإجمالي بالدالة التي يحفظ بها الإنشاء.
    const withDelivery = await quote(user.token, { governorateId: catalog.governorateId });
    expect(withDelivery.deliveryFee).not.toBeNull();
    expect(withDelivery.total).toBe(
      100_000 + withDelivery.deliveryFee! - withDelivery.deliveryDiscount - 3_000,
    );
  });

  it('[CRITICAL] المعاينة لا تحجز المزيّة ولا تستهلكها — مهما تكرّرت', async () => {
    const user = await customerWith(100);
    await api.post('/api/points/rewards/explorer/claim').set(bearer(user.token)).expect(200);
    await addToCart(user.token, await productAt(80_000));

    for (let i = 0; i < 3; i += 1) await quote(user.token);
    const row = await redemption(user.userId, 'explorer');
    expect(row?.consumed_at).toBeNull();
    expect(row?.consumed_order_id).toBeNull();
  });

  it('[CRITICAL] الإنشاء يحفظ الخصم نفسه الذي عُرض — ويراه الزبون والمسؤول', async () => {
    const user = await customerWith(400);
    await api.post('/api/points/rewards/warrior/claim').set(bearer(user.token)).expect(200);
    await addToCart(user.token, await productAt(100_000));

    const shown = await quote(user.token, { governorateId: catalog.governorateId });
    expect(shown.loyaltyDiscount).toBe(5_000);

    const created = await placeOrder(user.token);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const orderId = created.body.data.id as string;
    expect(Number(created.body.data.loyaltyDiscount)).toBe(shown.loyaltyDiscount);
    expect(Number(created.body.data.discount)).toBe(shown.discount);
    expect(Number(created.body.data.total)).toBe(shown.total);

    // الصفّ المحفوظ — لا حقل عرضٍ مصطنع.
    const { rows } = await db.query<{ loyalty_discount: string; discount: string; total: string }>(
      'SELECT loyalty_discount, discount, total FROM orders WHERE id = $1',
      [orderId],
    );
    expect(Number(rows[0]!.loyalty_discount)).toBe(5_000);
    expect(Number(rows[0]!.discount)).toBe(5_000);

    // المزيّة استُهلكت على هذا الطلب بعينه.
    const row = await redemption(user.userId, 'warrior');
    expect(row?.consumed_at).not.toBeNull();
    expect(row?.consumed_order_id).toBe(orderId);

    // طلب الزبون.
    const mine = await api.get(`/api/orders/${orderId}`).set(bearer(user.token)).expect(200);
    expect(Number(mine.body.data.loyaltyDiscount)).toBe(5_000);

    // طلب اللوحة — الرقم نفسه من الصفّ نفسه.
    const admin = await api.get(`/api/admin/orders/${orderId}`).set(bearer(adminToken)).expect(200);
    expect(Number(admin.body.data.loyaltyDiscount)).toBe(5_000);
    expect(Number(admin.body.data.discount)).toBe(5_000);
    expect(Number(admin.body.data.total)).toBe(shown.total);

    // بعد الاستهلاك لا يعرض الملخّص المزيّة مرة ثانية.
    await addToCart(user.token, await productAt(100_000));
    const after = await quote(user.token);
    expect(after.loyaltyDiscount).toBe(0);
    expect(after.loyaltyReward).toBeNull();
  });

  it('[CRITICAL] إنشاءٌ فاشل بعد المعاينة لا يستهلك المزيّة — وتبقى في الملخّص', async () => {
    const user = await customerWith(100);
    await api.post('/api/points/rewards/explorer/claim').set(bearer(user.token)).expect(200);
    const productId = await productAt(60_000);
    await addToCart(user.token, productId, 2);

    // ٣٪ من ١٢٠٬٠٠٠ = ٣٬٦٠٠ ← ٣٬٥٠٠ (أقرب ٢٥٠).
    expect((await quote(user.token)).loyaltyDiscount).toBe(3_500);

    // المخزون ينفد بعد المعاينة فيسقط الإنشاء داخل المعاملة.
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [productId]);
    const failed = await placeOrder(user.token);
    expect(failed.status).toBe(409);

    const row = await redemption(user.userId, 'explorer');
    expect(row?.consumed_at).toBeNull();
    await db.query('UPDATE products SET stock = 500 WHERE id = $1', [productId]);
    expect((await quote(user.token)).loyaltyDiscount).toBe(3_500);
  });

  it('الملخّص لا يقبل مبلغاً من العميل — المعاملات المرسلة تُتجاهل', async () => {
    const user = await customerWith(0);
    await addToCart(user.token, await productAt(50_000));
    const res = await api
      .get('/api/orders/checkout-quote')
      .query({ loyaltyDiscount: '999999', discount: '999999' })
      .set(bearer(user.token))
      .expect(200);
    expect(res.body.data.loyaltyDiscount).toBe(0);
    expect(res.body.data.discount).toBe(0);
  });

  it('الملخّص يحتاج جلسة، ومحافظةٌ غير صالحة تُرفض', async () => {
    await api.get('/api/orders/checkout-quote').expect(401);
    const user = await customerWith(0);
    const bad = await api
      .get('/api/orders/checkout-quote')
      .query({ governorateId: '00000000-0000-0000-0000-000000000000' })
      .set(bearer(user.token));
    expect(bad.status).toBe(400);
  });
});
