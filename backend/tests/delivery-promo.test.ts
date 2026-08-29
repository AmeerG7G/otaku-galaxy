import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * ترويج التوصيل: يُحتسب على الخادم من بيانات المنتج وقت الطلب، بسقف رسوم
 * التوصيل، ويُخزَّن كلقطة تاريخية لا تتأثر بتغيير الترويج لاحقاً.
 */
describe('delivery promo discount', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  /** منتج مخصّص لهذه المجموعة حتى لا يلوّث بقية الاختبارات. */
  let promoProductId: string;
  let plainProductId: string;

  const DELIVERY_FEE = 4000;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products
         (name, description, price, category_id, subcategory_id, stock,
          has_delivery_promo, delivery_promo_amount)
       VALUES ($1, 'وصف', 15000, $2, $3, 50, TRUE, 1000)
       RETURNING id`,
      ['منتج ترويج توصيل', catalog.categoryId, catalog.subcategoryId],
    );
    promoProductId = rows[0]!.id;
    plainProductId = catalog.productIds[0]!;
  });

  afterAll(async () => {
    await db.query('DELETE FROM products WHERE id = $1', [promoProductId]);
  });

  /** يضيف للسلة ثم ينشئ طلباً ويعيد جسم الطلب. */
  async function orderWith(
    token: string,
    lines: Array<{ productId: string; quantity: number }>,
    governorateId = catalog.governorateId,
  ) {
    for (const line of lines) {
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send(line)
        .expect(200);
    }
    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07700000000',
      })
      .expect(201);
    return res.body.data;
  }

  it('applies the promo for a single eligible product', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: promoProductId, quantity: 1 },
    ]);

    expect(order.deliveryFee).toBe(DELIVERY_FEE);
    expect(order.deliveryDiscount).toBe(1000);
    expect(order.total).toBe(15000 + (DELIVERY_FEE - 1000));
  });

  it('multiplies the promo by the ordered quantity', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: promoProductId, quantity: 3 },
    ]);

    expect(order.deliveryDiscount).toBe(3000);
    expect(order.total).toBe(3 * 15000 + (DELIVERY_FEE - 3000));
  });

  it('ignores products that are not eligible', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: plainProductId, quantity: 2 },
    ]);

    expect(order.deliveryDiscount).toBe(0);
    expect(order.total).toBe(2 * 15000 + DELIVERY_FEE);
  });

  it('sums the promo across several eligible lines', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products
         (name, description, price, category_id, subcategory_id, stock,
          has_delivery_promo, delivery_promo_amount)
       VALUES ($1, 'وصف', 5000, $2, $3, 50, TRUE, 500)
       RETURNING id`,
      ['منتج ترويج ثانٍ', catalog.categoryId, catalog.subcategoryId],
    );
    const secondId = rows[0]!.id;

    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: promoProductId, quantity: 1 },
      { productId: secondId, quantity: 2 },
    ]);

    // ‎1000 + (500 × 2) = 2000
    expect(order.deliveryDiscount).toBe(2000);
    expect(order.total).toBe(15000 + 2 * 5000 + (DELIVERY_FEE - 2000));

    await db.query('DELETE FROM products WHERE id = $1', [secondId]);
  });

  it('caps the discount at the delivery fee — delivery never goes negative', async () => {
    const { token } = await registerAndLogin();
    // ‎5 × 1000 = 5000 > رسوم التوصيل 4000.
    const order = await orderWith(token, [
      { productId: promoProductId, quantity: 5 },
    ]);

    expect(order.deliveryDiscount).toBe(DELIVERY_FEE);
    expect(order.total).toBe(5 * 15000);
  });

  it('stays at zero when the governorate has no delivery fee', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee)
       VALUES ('محافظة بلا رسوم', 0)
       ON CONFLICT (name) DO UPDATE SET delivery_fee = 0
       RETURNING id`,
    );
    const freeGovId = rows[0]!.id;

    const { token } = await registerAndLogin();
    const order = await orderWith(
      token,
      [{ productId: promoProductId, quantity: 2 }],
      freeGovId,
    );

    expect(order.deliveryFee).toBe(0);
    expect(order.deliveryDiscount).toBe(0);
    expect(order.total).toBe(2 * 15000);
    // لا نحذف المحافظة: الطلب أعلاه يرجع إليها بمفتاح أجنبي، والإدراج
    // نفسه idempotent فلا تتراكم نسخ عبر التشغيلات.
  });

  it('keeps past orders unchanged when the product promo changes later', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: promoProductId, quantity: 1 },
    ]);
    const orderId = order.id;
    expect(order.deliveryDiscount).toBe(1000);

    // الإدارة تُطفئ الترويج بعد إنشاء الطلب.
    await api
      .patch(`/api/admin/products/${promoProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: false })
      .expect(200);

    const fetched = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.data.deliveryDiscount).toBe(1000);

    // إعادة التفعيل لبقية الاختبارات.
    await api
      .patch(`/api/admin/products/${promoProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
      .expect(200);
  });

  it('ignores a discount or total forged by the client', async () => {
    const { token } = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: plainProductId, quantity: 1 })
      .expect(200);

    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07700000000',
        // قيم مدسوسة من العميل — يجب أن تُهمل تماماً.
        deliveryDiscount: 999999,
        discount: 999999,
        total: 1,
      })
      .expect(201);

    expect(res.body.data.deliveryDiscount).toBe(0);
    expect(res.body.data.total).toBe(15000 + DELIVERY_FEE);
  });
});
