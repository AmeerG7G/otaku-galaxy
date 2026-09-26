import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, registerAndLogin, seedTestCatalog, purgeTestUsers } from './helpers.js';

/**
 * منع البيع فوق المخزون — كل المسارات.
 *
 * [CRITICAL] ثلاثة عيوب حقيقية وُجدت في هذه المنطقة، ولكلٍّ منها حارسٌ هنا:
 *
 *  ١. `UNIQUE (cart_id, product_id, option_value)` لا يصطدم حين القيمة NULL
 *     (NULL ≠ NULL في فهرس فريد)، فكل إضافة تُنشئ صفّاً جديداً ولا يُدمَج
 *     شيء. أُصلح في الهجرة ٠٤٦.
 *  ٢. التحقق كان سطراً سطراً، فتمرّ عربةٌ مجموعُها فوق المخزون.
 *  ٣. **السباق**: طلبان متزامنان يقرآن المخزون نفسه فيجتاز كلاهما التحقق،
 *     ثم يفشل التنزيل المشروط بصمت لأن `rowCount` لم يكن يُفحص — فيُنشأ
 *     طلبٌ ببضاعة لا وجود لها. المقيس: مخزون ٣ باع ٦.
 *
 * كل اختبار هنا يقيس **الوحدات المباعة فعلاً** من `order_items`، لا رمز
 * الاستجابة وحده: طلبٌ ينجح بلا بضاعة هو العطب نفسه.
 *
 * [CONTRACT 2026-09-14] المخزون يُستهلك عند **قبول الإدارة** لا عند إرسال
 * الزبون (انظر `order-approval-stock.test.ts`). لذلك «المباع» هنا يُقرأ من
 * الطلبات المقبولة، والسباق الذي يُقاس هو سباق **القبولين** لا الإرسالين:
 * الإرسالان يمرّان معاً (لا حجز)، والقبول هو ما يحسم.
 */
describe('حراسة البيع فوق المخزون', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM order_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'OVERSELL %')`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'OVERSELL %')`);
    await db.query(`DELETE FROM products WHERE name LIKE 'OVERSELL %'`);
    await purgeTestUsers();
  });

  async function product(name: string, stock: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 1000, $2, $3, TRUE) RETURNING id`,
      [`OVERSELL ${name}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  /** الوحدات المباعة فعلاً = أسطر الطلبات التي **قُبلت** (خرجت من الانتظار ولم تُرفض). */
  async function unitsSold(id: string) {
    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(oi.quantity), 0)::text AS total
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = $1
          AND o.status NOT IN ('PENDING_ADMIN_CONFIRMATION', 'REJECTED')`,
      [id],
    );
    return Number(rows[0]!.total);
  }

  function approve(orderId: string) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' });
  }

  async function stockOf(id: string) {
    const { rows } = await db.query<{ stock: number }>(
      'SELECT stock FROM products WHERE id = $1',
      [id],
    );
    return Number(rows[0]!.stock);
  }

  const ORDER_BODY = (governorateId: string) => ({
    governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07700000000',
  });

  // ═══════════════ الحالة ١: إضافات متكرّرة، منتج بلا خيار ═══════════════

  it('[CRITICAL] ٥ إضافات بقطعة على مخزون ٣ ⇒ ٣ مقبولة والباقي مرفوض', async () => {
    const buyer = await registerAndLogin();
    const id = await product('تكرار', 3);

    const codes: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ productId: id, quantity: 1 });
      codes.push(res.status);
    }
    expect(codes.filter((c) => c === 200)).toHaveLength(3);
    expect(codes.filter((c) => c === 409)).toHaveLength(2);

    const { rows } = await db.query<{ total: string; lines: string }>(
      `SELECT COALESCE(SUM(ci.quantity),0)::text AS total, COUNT(*)::text AS lines
         FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE ci.product_id = $1 AND c.user_id = $2`,
      [id, buyer.userId],
    );
    expect(Number(rows[0]!.total)).toBe(3);
    // الهجرة ٠٤٦: صفٌّ واحد لا خمسة.
    expect(Number(rows[0]!.lines)).toBe(1);
  });

  // ═══════════════ الحالة ٢: طلب واحد يتجاوز المخزون ═══════════════

  it('كمية أكبر من المخزون في طلب واحد ⇒ 409 والمخزون سليم', async () => {
    const buyer = await registerAndLogin();
    const id = await product('دفعة', 3);
    const res = await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, quantity: 4 });
    expect(res.status).toBe(409);
    expect(await stockOf(id)).toBe(3);
  });

  // ═══════════════ الحالة ٣: صفوف متعدّدة مزروعة في القاعدة ═══════════════

  it('[CRITICAL] صفوف مزروعة مباشرةً (منها NULL) لا تمرّ عند الطلب', async () => {
    const buyer = await registerAndLogin();
    const id = await product('صفوف', 3);
    const { rows: cart } = await db.query<{ id: string }>(
      `INSERT INTO carts (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id RETURNING id`,
      [buyer.userId],
    );
    // خيارات مختلفة + NULL: يتخطّى مسار العربة كلّه.
    for (const [opt, qty] of [['أحمر', 2], [null, 2]] as const) {
      await db.query(
        `INSERT INTO cart_items (cart_id, product_id, option_value, quantity)
         VALUES ($1, $2, $3, $4)`,
        [cart[0]!.id, id, opt, qty],
      );
    }

    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send(ORDER_BODY(catalog.governorateId));
    expect(res.status).toBe(409);
    expect(await stockOf(id)).toBe(3);
    expect(await unitsSold(id)).toBe(0);

    await db.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
  });

  // ═══════════════ الحالة ٤: منتج بخيارات — المخزون على مستوى المنتج ═══════════════

  it('[CRITICAL] خياران لا يتجاوزان مخزون المنتج مجتمعَين', async () => {
    // `products.stock` عمود واحد للمنتج، فالحدّ على المنتج لا على الخيار.
    const buyer = await registerAndLogin();
    const id = await product('خيارات', 3);

    await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, optionValue: 'أحمر', quantity: 2 }).expect(200);
    const second = await api.post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, optionValue: 'أزرق', quantity: 2 });
    expect(second.status).toBe(409);

    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(ci.quantity),0)::text AS total FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
        WHERE ci.product_id = $1 AND c.user_id = $2`,
      [id, buyer.userId],
    );
    expect(Number(rows[0]!.total)).toBeLessThanOrEqual(3);
    await db.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
  });

  it('خياران ضمن الحدّ يمرّان ويُباعان مرة واحدة', async () => {
    const buyer = await registerAndLogin();
    const id = await product('خيارات صالحة', 3);
    await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, optionValue: 'أحمر', quantity: 2 }).expect(200);
    await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, optionValue: 'أزرق', quantity: 1 }).expect(200);

    const order = await api.post('/api/orders').set('Authorization', `Bearer ${buyer.token}`)
      .send(ORDER_BODY(catalog.governorateId)).expect(201);
    // الإرسال لا يمسّ المخزون؛ القبول يستهلك مجموع السطرين مرة واحدة.
    expect(await stockOf(id)).toBe(3);
    expect(await unitsSold(id)).toBe(0);
    expect((await approve(order.body.data.id as string)).status).toBe(200);
    expect(await unitsSold(id)).toBe(3);
    expect(await stockOf(id)).toBe(0);
  });

  // ═══════════════ الحالة ٦: كميات غير صالحة ═══════════════

  it('الكميات السالبة والكسرية والصفرية مرفوضة عند الحدّ', async () => {
    const buyer = await registerAndLogin();
    const id = await product('كميات', 5);
    for (const quantity of [-1, 0, 1.5, 1e9]) {
      const res = await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send({ productId: id, quantity });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
    expect(await stockOf(id)).toBe(5);
  });

  // ═══════════════ الحالة ٧: تعديل الكمية ليس منفذاً ═══════════════

  it('[CRITICAL] تعديل كمية سطر لا يتجاوز مخزون المنتج', async () => {
    const buyer = await registerAndLogin();
    const id = await product('تعديل', 3);
    await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: id, optionValue: 'أحمر', quantity: 1 }).expect(200);

    const cart = await api.get('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`).expect(200);
    const items = (cart.body.data.items ?? cart.body.data) as { id: string }[];
    const itemId = items[0]!.id;

    // محاولة رفع السطر فوق المخزون.
    const res = await api
      .patch(`/api/cart/${itemId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ quantity: 99 });
    expect(res.status).toBeGreaterThanOrEqual(400);

    // ومهما كانت النتيجة: القبول لا يبيع فوق المخزون.
    const order = await api.post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send(ORDER_BODY(catalog.governorateId));
    if (order.status === 201) {
      await approve(order.body.data.id as string);
      expect(await unitsSold(id)).toBeLessThanOrEqual(3);
    }
    expect(await stockOf(id)).toBeGreaterThanOrEqual(0);
    await db.query('DELETE FROM cart_items WHERE product_id = $1', [id]);
  });

  // ═══════════════ الحالة ٨: التزامن ═══════════════

  describe('[CRITICAL] التزامن — سباق القبولين', () => {
    /** يرسل طلباً بكمية معيّنة ويعيد معرّفه — الإرسال لا يحجز شيئاً. */
    async function submit(token: string) {
      const res = await api.post('/api/orders').set('Authorization', `Bearer ${token}`)
        .send(ORDER_BODY(catalog.governorateId)).expect(201);
      return res.body.data.id as string;
    }

    it('طلبان بثلاث قطع على مخزون ٣ يُرسَلان معاً، وقبولٌ واحد ينجح و٣ قطع تُباع', async () => {
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      const id = await product('سباق ٢', 3);
      for (const u of [a, b]) {
        await api.post('/api/cart').set('Authorization', `Bearer ${u.token}`)
          .send({ productId: id, quantity: 3 }).expect(200);
      }
      const [oa, ob] = await Promise.all([submit(a.token), submit(b.token)]);
      expect(await stockOf(id)).toBe(3);
      expect(await unitsSold(id)).toBe(0);

      const [r1, r2] = await Promise.all([approve(oa), approve(ob)]);
      expect([r1.status, r2.status].sort()).toEqual([200, 409]);
      expect(await unitsSold(id)).toBe(3);
      expect(await stockOf(id)).toBe(0);
    });

    it('[CRITICAL] خمسة قبولات متزامنة على مخزون ١ ⇒ قطعة واحدة تُباع', async () => {
      const buyers = await Promise.all(
        Array.from({ length: 5 }, () => registerAndLogin()),
      );
      const id = await product('سباق ٥', 1);
      for (const u of buyers) {
        await api.post('/api/cart').set('Authorization', `Bearer ${u.token}`)
          .send({ productId: id, quantity: 1 }).expect(200);
      }
      const orders = await Promise.all(buyers.map((u) => submit(u.token)));
      expect(await stockOf(id)).toBe(1);

      const results = await Promise.all(orders.map((o) => approve(o)));
      expect(results.filter((r) => r.status === 200)).toHaveLength(1);
      expect(await unitsSold(id)).toBe(1);
      expect(await stockOf(id)).toBe(0);
    });

    it('المخزون لا يصير سالباً تحت أي ضغط', async () => {
      const buyers = await Promise.all(
        Array.from({ length: 4 }, () => registerAndLogin()),
      );
      const id = await product('سباق سالب', 2);
      for (const u of buyers) {
        await api.post('/api/cart').set('Authorization', `Bearer ${u.token}`)
          .send({ productId: id, quantity: 2 }).expect(200);
      }
      const orders = await Promise.all(buyers.map((u) => submit(u.token)));
      await Promise.all(orders.map((o) => approve(o)));
      expect(await stockOf(id)).toBeGreaterThanOrEqual(0);
      expect(await unitsSold(id)).toBeLessThanOrEqual(2);
    });
  });
});
