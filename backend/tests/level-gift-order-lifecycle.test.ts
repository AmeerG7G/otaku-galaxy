import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * دورة حياة هدية المستوى المرتبطة بالطلب.
 *
 * الفرق الجوهري عن مزايا الخصم: الهدية فيزيائية لا تُشتق من `consumed_at`
 * ولا تؤثر على الإجمالي — الرابط هو `orders.loyalty_gift_redemption_id`.
 * القيد في هجرة 042 يحمي `consumed_at`/`consumed_order_id` من أن تُلمس
 * لصفوف الهدايا.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  await purgeTestUsers();
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

async function customerWithGiftClaimed(levelKey = 'voyager') {
  const thresholds: Record<string, number> = {
    voyager: 250,
    champion: 600,
    legend: 1000,
  };
  const points = thresholds[levelKey] ?? 250;
  const user = await registerAndLogin();
  await db.query(
    `INSERT INTO points_ledger (user_id, label, amount, reason)
     VALUES ($1, 'رصيد اختبار', $2, 'manual')`,
    [user.userId, points],
  );
  await api
    .post(`/api/points/rewards/${levelKey}/claim`)
    .set('Authorization', `Bearer ${user.token}`)
    .expect(200);
  return user;
}

async function freshProduct(price = 10_000) {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
     VALUES ($1, 'وصف', $2, $3, $4, 500) RETURNING id`,
    [
      `هدية-اختبار-${Math.random().toString(36).slice(2, 8)}`,
      price,
      catalog.categoryId,
      catalog.subcategoryId,
    ],
  );
  return rows[0]!.id;
}

async function placeOrder(token: string, productId: string) {
  await api
    .post('/api/cart')
    .set('Authorization', `Bearer ${token}`)
    .send({ productId, quantity: 1 })
    .expect(200);
  return api
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة',
      phone: '07733333333',
    });
}

// ═══════════════ ملخّص الدفع ═══════════════

describe('ملخّص الدفع وهدية المستوى', () => {
  it('ملخّص الدفع يُعيد loyaltyGiftActivated=true عند وجود هدية مفعَّلة', async () => {
    const user = await customerWithGiftClaimed();
    const res = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(res.body.data.loyaltyGiftActivated).toBe(true);
  });

  it('ملخّص الدفع يُعيد loyaltyGiftActivated=false بلا هدية', async () => {
    const user = await registerAndLogin();
    const res = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(res.body.data.loyaltyGiftActivated).toBe(false);
  });

  it('[CRITICAL] الهدية لا تظهر في discount ولا تؤثر على إجمالي ملخّص الدفع', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct(20_000);
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const res = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(res.body.data.loyaltyGiftActivated).toBe(true);
    // الخصم صفر — الهدية ليست خصماً
    expect(res.body.data.loyaltyDiscount).toBe(0);
    expect(res.body.data.discount).toBe(0);
  });
});

// ═══════════════ إنشاء الطلب ═══════════════

describe('إنشاء الطلب يربط الهدية', () => {
  it('إنشاء طلب بهدية مفعَّلة يُعيد loyaltyGiftActivated=true', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    expect(res.body.data.loyaltyGiftActivated).toBe(true);
  });

  it('إنشاء طلب بلا هدية يُعيد loyaltyGiftActivated=false', async () => {
    const user = await registerAndLogin();
    const productId = await freshProduct();
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    expect(res.body.data.loyaltyGiftActivated).toBe(false);
  });

  it('[CRITICAL] الهدية لا تؤثر على discount أو total في الطلب المنشأ', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct(15_000);
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order.loyaltyGiftActivated).toBe(true);
    // خصم المنتجات يبقى صفراً — الهدية ليست خصماً
    expect(order.discount).toBe(0);
    expect(order.total).toBeGreaterThan(0);
  });
});

// ═══════════════ صف الهدية في القاعدة ═══════════════

describe('سلامة صف الهدية في القاعدة', () => {
  it('[CRITICAL] consumed_at يبقى NULL — قيد هجرة 042', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    await placeOrder(user.token, productId);

    const { rows } = await db.query<{ consumed_at: unknown; consumed_order_id: unknown }>(
      `SELECT r.consumed_at, r.consumed_order_id
         FROM loyalty_reward_redemptions r
        WHERE r.user_id = $1 AND r.kind = 'gift'`,
      [user.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.consumed_at).toBeNull();
    expect(rows[0]!.consumed_order_id).toBeNull();
  });

  it('[CRITICAL] loyalty_gift_redemption_id مرتبط بالطلب بعد الإنشاء', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    const orderId = res.body.data.id as string;

    const { rows } = await db.query<{ loyalty_gift_redemption_id: string | null }>(
      'SELECT loyalty_gift_redemption_id FROM orders WHERE id = $1',
      [orderId],
    );
    expect(rows[0]!.loyalty_gift_redemption_id).not.toBeNull();
  });

  it('الهدية المرتبطة بطلب لا تظهر في ملخّص دفع الطلب التالي', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    await placeOrder(user.token, productId);

    // طلب ثانٍ بلا هدية متاحة
    const productId2 = await freshProduct();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: productId2, quantity: 1 })
      .expect(200);
    const quoteRes = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(quoteRes.body.data.loyaltyGiftActivated).toBe(false);
  });
});

// ═══════════════ لوحة التحكم ═══════════════

describe('لوحة التحكم — loyaltyGiftActivated', () => {
  it('المسؤول يرى loyaltyGiftActivated=true في تفاصيل الطلب', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    const orderId = res.body.data.id as string;

    const adminRes = await api
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminRes.body.data.loyaltyGiftActivated).toBe(true);
  });

  it('المسؤول يرى loyaltyGiftActivated=false للطلبات العادية', async () => {
    const user = await registerAndLogin();
    const productId = await freshProduct();
    const res = await placeOrder(user.token, productId);
    expect(res.status).toBe(201);
    const orderId = res.body.data.id as string;

    const adminRes = await api
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminRes.body.data.loyaltyGiftActivated).toBe(false);
  });

  it('هدية غير مُسلَّمة: fulfilled_at يبقى NULL قبل التسليم', async () => {
    const user = await customerWithGiftClaimed();
    const productId = await freshProduct();
    await placeOrder(user.token, productId);

    const { rows } = await db.query<{ fulfilled_at: unknown }>(
      `SELECT r.fulfilled_at
         FROM loyalty_reward_redemptions r
        WHERE r.user_id = $1 AND r.kind = 'gift'`,
      [user.userId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.fulfilled_at).toBeNull();
  });
});

// ═══════════════ هدايا متعددة المستويات ═══════════════

describe('هدايا متعددة المستويات', () => {
  it('يُعيد loyaltyGiftActivated=true للزبون برصيد champion', async () => {
    const user = await customerWithGiftClaimed('champion');
    const res = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(res.body.data.loyaltyGiftActivated).toBe(true);
  });

  it('يُعيد loyaltyGiftActivated=true للزبون برصيد legend', async () => {
    const user = await customerWithGiftClaimed('legend');
    const res = await api
      .get('/api/orders/checkout-quote')
      .set('Authorization', `Bearer ${user.token}`)
      .query({ governorateId: catalog.governorateId })
      .expect(200);
    expect(res.body.data.loyaltyGiftActivated).toBe(true);
  });
});
