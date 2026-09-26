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
 * دورة المخزون: يُستهلك **عند قبول الإدارة** وحده.
 *
 * ═══ العقد (قرار عمل 2026-09-14) ═══
 *   إرسال الزبون      ← الطلب ينتظر، والمخزون **لا يُمسّ** ولا يُحجز.
 *   رفضُ طلبٍ منتظر   ← المخزون **لا يُمسّ** (لا شيء يُسترد لأن شيئاً لم يُنزَّل).
 *   قبول الإدارة      ← معاملة واحدة: قفل صفّ الطلب، قفل صفوف المنتجات بترتيب
 *                        ثابت، قراءة المخزون **الحالي**، فإمّا تنزيلٌ كامل أو
 *                        لا شيء — `409 INSUFFICIENT_STOCK` والطلب يبقى منتظراً.
 *   رفضٌ بعد القبول   ← يُرجع ما استُهلك مرةً واحدة (القاعدة القائمة سلفاً).
 *
 * كان المخزون يُنزَّل عند الإرسال ويُسترد عند الرفض. النموذج الجديد يعني
 * أن المخزون قد يتغيّر بين الإرسال والقبول، فالقبول يتحقّق لحظتَه لا لحظة
 * الإرسال. السباق الحقيقي هنا بين **قبولين**، وحارسه PostgreSQL لا الذاكرة.
 */
describe('استهلاك المخزون عند القبول', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM order_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'APPROVAL %')`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN
                    (SELECT id FROM products WHERE name LIKE 'APPROVAL %')`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'APPROVAL %'`);
  });

  async function product(name: string, stock: number) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 1000, $2, $3, TRUE) RETURNING id`,
      [`APPROVAL ${name}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  async function stockOf(id: string) {
    const { rows } = await db.query<{ stock: string }>(
      'SELECT stock FROM products WHERE id = $1',
      [id],
    );
    return Number(rows[0]!.stock);
  }

  async function statusOf(orderId: string) {
    const { rows } = await db.query<{ status: string }>(
      'SELECT status FROM orders WHERE id = $1',
      [orderId],
    );
    return rows[0]!.status;
  }

  const ORDER_BODY = () => ({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07700000000',
  });

  /** زبون جديد يضع الأسطر المعطاة في عربته ويرسل الطلب — يعيد معرّفه. */
  async function submitOrder(
    lines: Array<{ productId: string; quantity: number; optionValue?: string }>,
  ) {
    const buyer = await registerAndLogin();
    for (const line of lines) {
      await api
        .post('/api/cart')
        .set('Authorization', `Bearer ${buyer.token}`)
        .send(line)
        .expect(200);
    }
    const res = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send(ORDER_BODY())
      .expect(201);
    return { orderId: res.body.data.id as string, buyer };
  }

  function approve(orderId: string, token = adminToken) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'OUT_FOR_DELIVERY' });
  }

  function reject(orderId: string) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED', note: 'سبب الرفض' });
  }

  it('[CRITICAL] إرسال الزبون لا يمسّ المخزون', async () => {
    const id = await product('إرسال', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 3 }]);
    expect(await stockOf(id)).toBe(5);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[CRITICAL] الرفض لا يمسّ المخزون — ولا تكراره', async () => {
    const id = await product('رفض', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 3 }]);
    expect((await reject(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(5);
    expect((await reject(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(5);
    expect(await statusOf(orderId)).toBe('REJECTED');
  });

  it('[CRITICAL] القبول ينزّل الكمية بالضبط — مرة واحدة مهما تكرّر', async () => {
    const id = await product('قبول', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 3 }]);
    expect((await approve(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(2);
    expect(await statusOf(orderId)).toBe('OUT_FOR_DELIVERY');

    // إعادة الطلب نفسه (ضغطة ثانية، أو إعادة إرسال بعد انقطاع) لا تنزّل ثانيةً.
    expect((await approve(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(2);
  });

  it('[CRITICAL] قبولان متزامنان للطلب **نفسه** ⇒ تنزيل واحد (القرار تحت قفل صفّ الطلب)', async () => {
    const id = await product('ضغطتان', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 3 }]);
    const [ra, rb] = await Promise.all([approve(orderId), approve(orderId)]);
    expect([ra.status, rb.status]).toEqual([200, 200]);
    expect(await stockOf(id)).toBe(2);
    expect(await statusOf(orderId)).toBe('OUT_FOR_DELIVERY');
  });

  it('[CRITICAL] المخزون تغيّر بين الإرسال والقبول ⇒ القبول يفشل بلا تنزيل جزئي', async () => {
    const id = await product('تغيّر', 5);
    // الطلب الأول يطلب ٥ وهي كلّ المخزون لحظة الإرسال.
    const first = await submitOrder([{ productId: id, quantity: 5 }]);
    expect(await stockOf(id)).toBe(5);
    // طلبٌ آخر بثلاث قطع يُقبل أولاً.
    const second = await submitOrder([{ productId: id, quantity: 3 }]);
    expect((await approve(second.orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(2);

    // الآن لم يبقَ للأول إلّا قطعتان: القبول يجب أن يفشل ويترك الطلب منتظراً.
    const res = await approve(first.orderId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(id)).toBe(2);
    expect(await statusOf(first.orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[CRITICAL] منتجان في طلب: نقصُ أحدهما يُعيد تنزيل الآخر (ذرّية المعاملة)', async () => {
    const ample = await product('كافٍ', 10);
    const scarce = await product('نادر', 1);
    const { orderId } = await submitOrder([
      { productId: ample, quantity: 4 },
      { productId: scarce, quantity: 1 },
    ]);
    // بين الإرسال والقبول يستهلك طلبٌ آخر النادر كلّه.
    const other = await submitOrder([{ productId: scarce, quantity: 1 }]);
    expect((await approve(other.orderId)).status).toBe(200);
    expect(await stockOf(scarce)).toBe(0);

    const res = await approve(orderId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    // لا شيء نُزّل من الكافي رغم كفايته — كلٌّ أو لا شيء.
    expect(await stockOf(ample)).toBe(10);
    expect(await stockOf(scarce)).toBe(0);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('سطران بخيارين لمنتج واحد يُجمعان عند القبول', async () => {
    const id = await product('خيارات', 3);
    const { orderId } = await submitOrder([
      { productId: id, quantity: 2, optionValue: 'أحمر' },
      { productId: id, quantity: 1, optionValue: 'أزرق' },
    ]);
    expect(await stockOf(id)).toBe(3);
    expect((await approve(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(0);
  });

  it('سطران مجموعهما فوق المخزون لحظة القبول يُرفضان معاً', async () => {
    const id = await product('خيارات فوق', 3);
    const { orderId } = await submitOrder([
      { productId: id, quantity: 2, optionValue: 'أحمر' },
      { productId: id, quantity: 1, optionValue: 'أزرق' },
    ]);
    // المسؤول خفّض المخزون يدوياً قبل القبول.
    await db.query('UPDATE products SET stock = 2 WHERE id = $1', [id]);
    const res = await approve(orderId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(id)).toBe(2);
  });

  it('[CRITICAL] قبولان متزامنان على مخزون ٥ بثلاث قطع لكلٍّ ⇒ واحد فقط', async () => {
    const id = await product('سباق', 5);
    const a = await submitOrder([{ productId: id, quantity: 3 }]);
    const b = await submitOrder([{ productId: id, quantity: 3 }]);
    // كلاهما منتظر والمخزون كامل — الإرسال لا يحجز.
    expect(await stockOf(id)).toBe(5);

    const [ra, rb] = await Promise.all([approve(a.orderId), approve(b.orderId)]);
    const codes = [ra.status, rb.status].sort();
    expect(codes).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    expect(loser.body.error.code).toBe('INSUFFICIENT_STOCK');

    expect(await stockOf(id)).toBe(2);
    const statuses = [await statusOf(a.orderId), await statusOf(b.orderId)].sort();
    expect(statuses).toEqual(['OUT_FOR_DELIVERY', 'PENDING_ADMIN_CONFIRMATION']);
  });

  it('[CRITICAL] خمسة قبولات متزامنة على مخزون ١ ⇒ قطعة واحدة تُستهلك ولا سالب', async () => {
    const id = await product('سباق ٥', 1);
    const orders = [];
    for (let i = 0; i < 5; i += 1) {
      orders.push(await submitOrder([{ productId: id, quantity: 1 }]));
    }
    const results = await Promise.all(orders.map((o) => approve(o.orderId)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await stockOf(id)).toBe(0);
  });

  it('الانتقالات غير الصالحة تُرفض بلا مساس بالمخزون', async () => {
    const id = await product('انتقال', 5);
    const done = await submitOrder([{ productId: id, quantity: 2 }]);
    expect((await approve(done.orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(3);
    // OUT_FOR_DELIVERY → COMPLETED (تأكيد الاستلام من الإدارة) ثم محاولة الرجوع.
    await api
      .patch(`/api/admin/orders/${done.orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    expect(await stockOf(id)).toBe(3);
    const back = await approve(done.orderId);
    expect(back.status).toBe(409);
    expect(await stockOf(id)).toBe(3);

    // مرفوضٌ لا يُقبل بعد الرفض.
    const rejected = await submitOrder([{ productId: id, quantity: 1 }]);
    expect((await reject(rejected.orderId)).status).toBe(200);
    const revive = await approve(rejected.orderId);
    expect(revive.status).toBe(409);
    expect(await stockOf(id)).toBe(3);
  });

  /**
   * رفضٌ بعد القبول (العميل لم يستلم): القبول استهلك المخزون، فالرفض يُعيد
   * البضاعة إلى الرفّ — القاعدة القائمة قبل نقل التنزيل إلى القبول
   * (`order-status-flow.test.ts`)، ولم يُطلب تغييرها. مرةً واحدة: تكرار
   * الرفض «حالةٌ نفسها» بلا أثر.
   */
  it('رفضُ طلبٍ مقبول يُرجع ما استُهلك — مرة واحدة مهما تكرّر', async () => {
    const id = await product('رفض بعد قبول', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 2 }]);
    expect((await approve(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(3);
    expect((await reject(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(5);
    expect(await statusOf(orderId)).toBe('REJECTED');
    expect((await reject(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(5);
  });

  /**
   * طلبٌ موروث واقف في «تم تأكيده» (نزّل مخزونه عند إنشائه تحت النموذج
   * القديم): رفضه يُرجع المخزون كما كان يفعل — لا يُعامَل كمنتظرٍ لم يُنزَّل.
   */
  it('رفضُ طلبٍ موروث في CONFIRMED يُرجع المخزون', async () => {
    const id = await product('موروث', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 2 }]);
    // النموذج القديم: التنزيل عند الإنشاء ثم الحالة الموروثة — تُزرع مباشرةً.
    await db.query('UPDATE products SET stock = stock - 2 WHERE id = $1', [id]);
    await db.query(`UPDATE orders SET status = 'CONFIRMED' WHERE id = $1`, [orderId]);
    expect(await stockOf(id)).toBe(3);
    expect((await reject(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(5);
  });

  it('مخزون صفر: الإرسال يُرفض عند العربة، والقبول يُرفض إن صار صفراً بعد الإرسال', async () => {
    const id = await product('صفر', 1);
    const { orderId } = await submitOrder([{ productId: id, quantity: 1 }]);
    await db.query('UPDATE products SET stock = 0 WHERE id = $1', [id]);
    const res = await approve(orderId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(id)).toBe(0);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');

    const empty = await registerAndLogin();
    const add = await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${empty.token}`)
      .send({ productId: id, quantity: 1 });
    expect(add.status).toBe(409);
  });

  it('المخزون يساوي الكمية بالضبط ⇒ القبول ينجح ويصفّر المخزون', async () => {
    const id = await product('بالضبط', 3);
    const { orderId } = await submitOrder([{ productId: id, quantity: 3 }]);
    expect((await approve(orderId)).status).toBe(200);
    expect(await stockOf(id)).toBe(0);
    expect(await statusOf(orderId)).toBe('OUT_FOR_DELIVERY');
  });

  it('[CRITICAL] منتجٌ حُذف من القاعدة قبل القبول ⇒ القبول يفشل ولا يُنزَّل غيره', async () => {
    const ample = await product('باقٍ', 10);
    const doomed = await product('محذوف', 5);
    const { orderId } = await submitOrder([
      { productId: ample, quantity: 2 },
      { productId: doomed, quantity: 1 },
    ]);
    // حذفٌ صلب (لا `is_active = FALSE`): `order_items.product_id` يصير NULL.
    await db.query('DELETE FROM cart_items WHERE product_id = $1', [doomed]);
    await db.query('DELETE FROM products WHERE id = $1', [doomed]);
    const res = await approve(orderId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
    expect(await stockOf(ample)).toBe(10);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[SECURITY] الزبون لا يقبل طلباً ولا يغيّر مخزوناً', async () => {
    const id = await product('صلاحية', 5);
    const { orderId, buyer } = await submitOrder([{ productId: id, quantity: 2 }]);
    const res = await approve(orderId, buyer.token);
    expect(res.status).toBe(403);
    expect(await stockOf(id)).toBe(5);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[SECURITY] بلا توكن، أو بتوكن مزوَّر، أو زبونٌ آخر: لا قبول ولا مساس بالمخزون', async () => {
    const id = await product('صلاحية ٢', 5);
    const { orderId } = await submitOrder([{ productId: id, quantity: 2 }]);
    const other = await registerAndLogin();

    const anonymous = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .send({ status: 'OUT_FOR_DELIVERY' });
    expect(anonymous.status).toBe(401);

    const forged = await approve(orderId, 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImFkbWluIn0.forged');
    expect(forged.status).toBe(401);

    const stranger = await approve(orderId, other.token);
    expect(stranger.status).toBe(403);

    expect(await stockOf(id)).toBe(5);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[SECURITY] الزبون لا يغيّر حالة طلبه عبر مسارات العميل، وحقول المخزون في الجسم تُهمَل', async () => {
    const id = await product('تلاعب', 5);
    const { orderId, buyer } = await submitOrder([{ productId: id, quantity: 2 }]);

    // لا مسار عميل يغيّر الحالة — 404 من معالج المسارات المجهولة.
    const patch = await api
      .patch(`/api/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ status: 'OUT_FOR_DELIVERY' });
    expect(patch.status).toBe(404);

    // تأكيد الاستلام لا يقفز من الانتظار.
    const confirm = await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${buyer.token}`);
    expect(confirm.status).toBe(409);
    expect(await statusOf(orderId)).toBe('PENDING_ADMIN_CONFIRMATION');

    // حتى المسؤول: حقول المخزون/الكمية في الجسم لا تُقرأ — التنزيل من لقطة
    // الطلب وحدها.
    const tampered = await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY', stock: 999, quantity: 0, items: [] });
    expect(tampered.status).toBe(200);
    expect(await stockOf(id)).toBe(3);

    // معرّف طلب مزوَّر.
    const ghost = await approve('00000000-0000-4000-8000-000000000000');
    expect(ghost.status).toBe(404);
    const junk = await approve('not-a-uuid');
    expect(junk.status).toBe(400);
  });
});
