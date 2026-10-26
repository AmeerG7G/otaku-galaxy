import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * فائض خصم التوصيل — الجزء الذي تجاوز رسوم التوصيل.
 *
 * [CRITICAL] الثابت الذي تحرسه هذه السويت كلها: الخام يُقسم قسمين ولا يضيع
 * ولا يتضخّم — `خصم الزبون + فائض المتجر = الخام`، و`خصم الزبون ≤ الرسوم`.
 * وما زاد عن الرسوم **لا يصير خصماً للزبون بأي طريق**: لا ينقص مجموع
 * المنتجات، ولا `discount`، ولا `total`.
 *
 * قبل هذا التغيير كان `Math.min` يبتلع الفائض بلا أثر.
 */
describe('فائض خصم التوصيل', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  /** رسوم محافظة هذه السويت — ٥٬٠٠٠ كما في مثال العمل. */
  const DELIVERY_FEE = 5000;
  const PRICE = 15000;
  /**
   * هاتف الطلب بالصيغة المعتمدة E.164 — ما يُنتجه `normalizeIraqiPhone` لـ`07700000000`.
   *
   * [CRITICAL] الإدراجات المباشرة في `orders` أدناه تتجاوز المُدقّق، فلا شيء
   * يوحّد الرقم قبل القيد. كان النصّ المحلي يمرّ فقط لأن PostgreSQL صادف أن
   * يقيّم قيود التوصيل قبل `orders_phone_check` (E.164 منذ الهجرة 037) —
   * بالصيغة المعتمدة يصير القيد المقصود وحده سبب الرفض.
   */
  const ORDER_PHONE = '+9647700000000';

  let governorateId: string;
  let productA: string; // خصم ١٬٠٠٠ للقطعة
  let productB: string; // خصم ٥٠٠ للقطعة
  let plainProduct: string; // بلا ترويج

  async function makeProduct(name: string, promo: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products
         (name, description, price, category_id, subcategory_id, stock,
          has_delivery_promo, delivery_promo_amount)
       VALUES ($1, 'وصف', $2, $3, $4, 500, $5, $6)
       RETURNING id`,
      [name, PRICE, catalog.categoryId, catalog.subcategoryId, promo > 0, promo],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    // محافظة خاصة برسوم ٥٬٠٠٠ حتى تطابق الأرقام مثال العمل حرفياً.
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee, is_active)
       VALUES ('محافظة فائض التوصيل', $1, TRUE)
       ON CONFLICT (name) DO UPDATE SET delivery_fee = EXCLUDED.delivery_fee
       RETURNING id`,
      [DELIVERY_FEE],
    );
    governorateId = rows[0]!.id;

    productA = await makeProduct('فائض أ', 1000);
    productB = await makeProduct('فائض ب', 500);
    plainProduct = await makeProduct('فائض بلا ترويج', 0);
  });

  afterAll(async () => {
    // الطلبات أولاً: المحافظة مرجعٌ لها (`orders_governorate_id_fkey`)،
    // وأبناء الطلب يسقطون بالتتالي. ثم المنتجات ثم المحافظة.
    await db.query('DELETE FROM orders WHERE governorate_id = $1', [governorateId]);
    await db.query('DELETE FROM products WHERE name LIKE $1', ['فائض %']);
    await db.query('DELETE FROM governorates WHERE id = $1', [governorateId]);
  });

  async function orderWith(
    token: string,
    lines: Array<{ productId: string; quantity: number }>,
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
      .send({ governorateId, fullAddress: 'بغداد، الكرادة', phone: ORDER_PHONE })
      .expect(201);
    return res.body.data;
  }

  /** الصفّ الخام من القاعدة — الفائض لا يخرج في استجابة العميل. */
  async function rowOf(orderId: string) {
    const { rows } = await db.query<{
      products_total: string;
      delivery_fee: string;
      discount: string;
      delivery_discount: string;
      delivery_discount_excess: string;
      total: string;
    }>(
      `SELECT products_total, delivery_fee, discount,
              delivery_discount, delivery_discount_excess, total
         FROM orders WHERE id = $1`,
      [orderId],
    );
    const r = rows[0]!;
    return {
      productsTotal: Number(r.products_total),
      deliveryFee: Number(r.delivery_fee),
      discount: Number(r.discount),
      deliveryDiscount: Number(r.delivery_discount),
      excess: Number(r.delivery_discount_excess),
      total: Number(r.total),
    };
  }

  // ═══════════════ الحالة الإلزامية ═══════════════

  it('[CRITICAL] رسوم ٥٬٠٠٠ · خصم ١٬٠٠٠/قطعة · ٦ قطع ⇒ خصم ٥٬٠٠٠ وفائض ١٬٠٠٠', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [{ productId: productA, quantity: 6 }]);
    const row = await rowOf(order.id);

    // الخام = ٦ × ١٬٠٠٠ = ٦٬٠٠٠
    expect(row.deliveryFee).toBe(5000);
    expect(row.deliveryDiscount).toBe(5000); // ما ناله الزبون — مسقوف
    expect(row.excess).toBe(1000); // ما قُيِّد للمتجر
    expect(row.deliveryDiscount + row.excess).toBe(6000); // لا شيء ضاع

    // التوصيل صفر، ومجموع المنتجات لم يمسّه شيء.
    expect(row.deliveryFee - row.deliveryDiscount).toBe(0);
    expect(row.productsTotal).toBe(PRICE * 6);
    expect(row.discount).toBe(0);
    // [CRITICAL] الإجمالي = المنتجات فقط. الألف الفائض لم يُخصم منه.
    expect(row.total).toBe(PRICE * 6);
  });

  // ═══════════════ منتجات متعددة (§٦) ═══════════════

  it('أ×٤ + ب×٢ ⇒ الخام ٥٬٠٠٠ بالضبط: توصيل صفر بلا فائض', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: productA, quantity: 4 },
      { productId: productB, quantity: 2 },
    ]);
    const row = await rowOf(order.id);

    expect(row.deliveryDiscount).toBe(5000); // ٤٬٠٠٠ + ١٬٠٠٠
    expect(row.excess).toBe(0);
    expect(row.deliveryFee - row.deliveryDiscount).toBe(0);
    expect(row.total).toBe(PRICE * 6);
  });

  it('أ×٦ + ب×٢ ⇒ الخام ٧٬٠٠٠: خصم ٥٬٠٠٠ وفائض ٢٬٠٠٠', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: productA, quantity: 6 },
      { productId: productB, quantity: 2 },
    ]);
    const row = await rowOf(order.id);

    expect(row.deliveryDiscount).toBe(5000);
    expect(row.excess).toBe(2000);
    expect(row.deliveryDiscount + row.excess).toBe(7000);
    expect(row.total).toBe(PRICE * 8);
  });

  it('المنتج بلا ترويج لا يساهم بشيء', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [
      { productId: plainProduct, quantity: 10 },
    ]);
    const row = await rowOf(order.id);

    expect(row.deliveryDiscount).toBe(0);
    expect(row.excess).toBe(0);
    expect(row.total).toBe(PRICE * 10 + DELIVERY_FEE);
  });

  it('الخصم دون الرسوم ⇒ لا فائض والزبون يدفع الفرق', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [{ productId: productA, quantity: 2 }]);
    const row = await rowOf(order.id);

    expect(row.deliveryDiscount).toBe(2000);
    expect(row.excess).toBe(0);
    expect(row.total).toBe(PRICE * 2 + (DELIVERY_FEE - 2000));
  });

  // ═══════════════ الثوابت (§٩) ═══════════════

  describe('ثوابت لا تُخرَق', () => {
    const cases = [
      { qty: 1, label: 'قطعة' },
      { qty: 5, label: 'خمس قطع — الخام = الرسوم بالضبط' },
      { qty: 6, label: 'ست قطع — أول فائض' },
      { qty: 50, label: 'خمسون قطعة — فائض كبير' },
    ];

    for (const c of cases) {
      it(`[CRITICAL] الثوابت تصمد عند ${c.label}`, async () => {
        const { token } = await registerAndLogin();
        const order = await orderWith(token, [
          { productId: productA, quantity: c.qty },
        ]);
        const row = await rowOf(order.id);
        const raw = 1000 * c.qty;

        expect(row.deliveryDiscount).toBeLessThanOrEqual(row.deliveryFee);
        expect(row.deliveryFee - row.deliveryDiscount).toBeGreaterThanOrEqual(0);
        expect(row.excess).toBeGreaterThanOrEqual(0);
        expect(row.deliveryDiscount + row.excess).toBe(raw);
        // الفائض لم يُخصم من المنتجات ولا من الإجمالي بأي صورة.
        expect(row.productsTotal).toBe(PRICE * c.qty);
        expect(row.discount).toBe(0);
        expect(row.total).toBe(
          row.productsTotal + (row.deliveryFee - row.deliveryDiscount),
        );
      });
    }

    it('[CRITICAL] القاعدة ترفض فائضاً مع خصمٍ دون الرسوم', async () => {
      // الثابت محروسٌ في القاعدة لا في الشيفرة وحدها: صفٌّ يُقيّد للمتجر
      // فائضاً بينما الزبون ما يزال يدفع توصيلاً لا يمكن أن يوجد أصلاً.
      const { userId } = await registerAndLogin();
      await expect(
        db.query(
          `INSERT INTO orders
             (number, user_id, governorate_id, province, delivery_fee,
              full_address, phone, products_total, discount, total, status,
              delivery_discount, delivery_discount_excess)
           VALUES ('X-EXCESS', $1, $2, 'اختبار', 5000, 'عنوان', $3,
                   1000, 0, 3000, 'PENDING_ADMIN_CONFIRMATION', 2000, 500)`,
          [userId, governorateId, ORDER_PHONE],
        ),
      ).rejects.toThrow(/orders_delivery_excess_only_when_fee_covered/);
    });

    it('[CRITICAL] القاعدة ترفض فائضاً سالباً', async () => {
      const { userId } = await registerAndLogin();
      await expect(
        db.query(
          `INSERT INTO orders
             (number, user_id, governorate_id, province, delivery_fee,
              full_address, phone, products_total, discount, total, status,
              delivery_discount, delivery_discount_excess)
           VALUES ('X-NEG', $1, $2, 'اختبار', 5000, 'عنوان', $3,
                   1000, 0, 1000, 'PENDING_ADMIN_CONFIRMATION', 5000, -1)`,
          [userId, governorateId, ORDER_PHONE],
        ),
      ).rejects.toThrow(/delivery_discount_excess/);
    });
  });

  // ═══════════════ اللقطة التاريخية (§٧) ═══════════════

  it('[CRITICAL] تغيير إعداد المنتج لاحقاً لا يمسّ طلباً مضى', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [{ productId: productA, quantity: 6 }]);
    const before = await rowOf(order.id);
    expect(before.excess).toBe(1000);

    // المسؤول يضاعف المبلغ ثم يُطفئ الترويج تماماً.
    await api
      .patch(`/api/admin/products/${productA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: true, deliveryPromoAmount: 4000 })
      .expect(200);
    await api
      .patch(`/api/admin/products/${productA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: false, deliveryPromoAmount: 0 })
      .expect(200);

    const after = await rowOf(order.id);
    expect(after).toEqual(before);

    // إعادة الضبط لبقية الاختبارات.
    await api
      .patch(`/api/admin/products/${productA}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ hasDeliveryPromo: true, deliveryPromoAmount: 1000 })
      .expect(200);
  });

  // ═══════════════ لا تسرّب للعميل (§٥ / §١١) ═══════════════

  it('[CRITICAL] استجابة العميل لا تحمل الفائض', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [{ productId: productA, quantity: 6 }]);

    const detail = await api
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const list = await api
      .get('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    for (const body of [order, detail.body.data, list.body.data]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain('deliveryDiscountExcess');
      expect(text).not.toContain('delivery_discount_excess');
    }
    // وما يراه العميل من خصم توصيل هو المسقوف لا الخام.
    expect(detail.body.data.deliveryDiscount).toBe(5000);
  });

  it('المسؤول وحده يقرأ الفائض', async () => {
    const { token } = await registerAndLogin();
    const order = await orderWith(token, [{ productId: productA, quantity: 6 }]);

    const asAdmin = await api
      .get(`/api/admin/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(asAdmin.body.data.deliveryDiscountExcess).toBe(1000);

    // نفس المسار بتوكن الزبون مرفوض.
    await api
      .get(`/api/admin/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  // ═══════════════ العميل لا يتحكم بشيء (§٨) ═══════════════

  describe('العميل لا يملي القيم', () => {
    it('[CRITICAL] القيم الملفّقة في جسم الطلب تُتجاهل كلها', async () => {
      const { token } = await registerAndLogin();
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productA, quantity: 6 })
        .expect(200);

      const res = await api
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          governorateId,
          fullAddress: 'بغداد، الكرادة',
          phone: ORDER_PHONE,
          // كلها مُلفَّقة — يعيد الخادم حسابها من بياناته وحدها.
          deliveryDiscount: 999999,
          deliveryDiscountExcess: 0,
          excessDeliveryDiscount: 0,
          finalDeliveryCharge: -5000,
          deliveryFee: 0,
          discount: 999999,
          total: 1,
          productsTotal: 1,
        })
        .expect(201);

      const row = await rowOf(res.body.data.id);
      expect(row.deliveryFee).toBe(5000);
      expect(row.deliveryDiscount).toBe(5000);
      expect(row.excess).toBe(1000);
      expect(row.discount).toBe(0);
      expect(row.total).toBe(PRICE * 6);
    });

    it('الكمية المتلاعب بها تُرفض بدل أن تُضخّم الخصم', async () => {
      const { token } = await registerAndLogin();
      for (const quantity of [-5, 0, 1.5]) {
        const res = await api
          .post('/api/cart')
          .set('Authorization', `Bearer ${token}`)
          .send({ productId: productA, quantity });
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    });

    it('الكمية فوق المخزون تُرفض فلا يُشترى خصم توصيل بلا بضاعة', async () => {
      const { token } = await registerAndLogin();
      const res = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: productA, quantity: 100000 });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  // ═══════════════ صلاحية الإعداد (§٨) ═══════════════

  describe('إعداد المنتج محميّ', () => {
    it('زبون يحاول تفعيل خصم التوصيل → 403', async () => {
      const { token } = await registerAndLogin();
      await api
        .patch(`/api/admin/products/${productB}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: 99999 })
        .expect(403);
    });

    it('بلا مصادقة → 401', async () => {
      await api
        .patch(`/api/admin/products/${productB}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: 99999 })
        .expect(401);
    });

    it('[CRITICAL] مبلغ سالب مرفوض', async () => {
      const res = await api
        .patch(`/api/admin/products/${productB}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: -1000 });
      expect(res.status).toBe(400);

      const { rows } = await db.query<{ delivery_promo_amount: string }>(
        'SELECT delivery_promo_amount FROM products WHERE id = $1',
        [productB],
      );
      expect(Number(rows[0]!.delivery_promo_amount)).toBe(500);
    });

    it('[CRITICAL] «مفعَّل بمبلغ صفر» مرفوض — شارة بلا خصم', async () => {
      const res = await api
        .patch(`/api/admin/products/${productB}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: 0 });
      expect(res.status).toBe(400);
      // رسالة تخصّ الحقل لا رسالة عامة: المسؤول يجب أن يعرف ما ينقصه.
      expect(res.body.message).toContain('خصم التوصيل');
    });

    it('مبلغ أكبر من أي رسوم مقبول — السقف يقع وقت الطلب لا وقت الضبط', async () => {
      await api
        .patch(`/api/admin/products/${productB}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: 50000 })
        .expect(200);

      const { token } = await registerAndLogin();
      const order = await orderWith(token, [{ productId: productB, quantity: 1 }]);
      const row = await rowOf(order.id);
      expect(row.deliveryDiscount).toBe(5000); // مسقوف بالرسوم
      expect(row.excess).toBe(45000);
      expect(row.total).toBe(PRICE); // ولا فلس نزل عن سعر المنتج

      await api
        .patch(`/api/admin/products/${productB}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ hasDeliveryPromo: true, deliveryPromoAmount: 500 })
        .expect(200);
    });
  });
});
