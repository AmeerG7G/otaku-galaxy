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
 * أهلية التقييم — تأكيد الاستلام، ودورة المراجعة.
 *
 * [CRITICAL] كل ما يُقاس هنا يقع على **الخادم**. الحكم مبنيّ على
 * `delivered_at` في القاعدة، فلا ساعةَ جهازٍ تدخل فيه ولا حالةَ تطبيق.
 * الاختبارات تنادي الـAPI مباشرةً — أي أنها هي نفسها «محاولة التجاوز»:
 * عميلٌ يخاطب الخادم بلا مرور بالواجهة.
 *
 * [NOTE] كانت هذه السويت تُسمّى «أهلية التقييم بعد ١٦ ساعة» وتثبّت مهلةً
 * يضبطها المسؤول بين الاستلام وفتح التقييم. أُلغيت المهلة: التقييم يُفتح
 * بتأكيد الاستلام في اللحظة نفسها. ما بقي من السويت — دورة المراجعة
 * والملكية — لم يتغيّر ولم يُمَس.
 */
describe('أهلية التقييم بتأكيد الاستلام', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query(
      'UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])',
      [catalog.productIds],
    );
  });

  async function dispatchedOrder() {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId: catalog.productIds[0]!, quantity: 1 })
      .expect(200);
    const created = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد، الكرادة',
        phone: '07733333333',
      })
      .expect(201);
    const orderId = created.body.data.id as string;

    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    return { user, orderId };
  }

  /** الطلب بعد أن ضغط صاحبه «استلمت طلبي» — المسار الحقيقي للزبون. */
  async function receivedOrder() {
    const { user, orderId } = await dispatchedOrder();
    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    return { user, orderId };
  }

  // [NOTE] حُذفت `ageOrderByMinutes`. كانت تزحزح الطوابع لتجاوز المهلة؛
  // لا مهلة تُتجاوَز بعد اليوم.

  function submit(token: string, orderId: string) {
    return api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        productId: catalog.productIds[0]!,
        rating: 5,
        comment: 'منتج ممتاز وخدمة سريعة',
      });
  }

  // ── الأهلية: الاستلام يفتحها ──

  it('[CRITICAL] قبل تأكيد الاستلام — يُرفض', async () => {
    const { user, orderId } = await dispatchedOrder();

    const res = await submit(user.token, orderId);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ORDER_NOT_COMPLETED');
  });

  it('[CRITICAL] فور تأكيد الاستلام — يُقبل بلا انتظار', async () => {
    const { user, orderId } = await receivedOrder();

    const res = await submit(user.token, orderId);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  it('الطلب يعلن الأهلية — نفس مصدر حكم الواجهة', async () => {
    // الواجهة لا تحسب شيئاً: تقرأ `canReview` من هذا المسار.
    const { user, orderId } = await dispatchedOrder();

    const before = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(before.body.data.canReview).toBe(false);

    await api
      .post(`/api/orders/${orderId}/confirm-receipt`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const after = await api
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body.data.canReview).toBe(true);
  });

  /**
   * [CRITICAL] الواجهة تُخفي الزرّ؛ الخادم هو من يمنع.
   *
   * عميلٌ يبني الطلب بيده متجاوزاً الشاشة كلها لا يمرّ بأي شرط في فلاتر.
   */
  it('[CRITICAL] استدعاء الـAPI مباشرةً لطلب غير مستلَم لا يمرّ', async () => {
    const { user, orderId } = await dispatchedOrder();

    const res = await submit(user.token, orderId);
    expect([400, 409]).toContain(res.status);

    const { rows } = await db.query('SELECT 1 FROM reviews WHERE order_id = $1', [
      orderId,
    ]);
    expect(rows).toHaveLength(0);
  });

  /** [CRITICAL] ولا يُقيَّم طلبُ غيره ولو كان مستلَماً. */
  it('[CRITICAL] طلب زبون آخر — يُرفض', async () => {
    const { orderId } = await receivedOrder();
    const stranger = await registerAndLogin();

    const res = await submit(stranger.token, orderId);
    expect(res.status).toBe(404);
  });

  // ── دورة المراجعة ──

  it('[CRITICAL] المُرسَل يصير «قيد المراجعة» ولا يُقبل مرتين', async () => {
    const { user, orderId } = await receivedOrder();

    const first = await submit(user.token, orderId);
    expect(first.status).toBe(201);
    expect(first.body.data.status).toBe('pending');

    // إرسالٌ ثانٍ لنفس المنتج في نفس الطلب — تقييمان معلّقان لا يجوزان.
    const second = await submit(user.token, orderId);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('REVIEW_EXISTS');
  });

  it('[CRITICAL] المعتمَد يبقى مغلقاً — لا إعادة إرسال', async () => {
    const { user, orderId } = await receivedOrder();
    const created = await submit(user.token, orderId);
    const reviewId = created.body.data.id as string;

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);

    expect((await submit(user.token, orderId)).status).toBe(409);

    // ومسار التعديل مغلق كذلك — المرفوض وحده يُعدَّل.
    const edit = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 4, comment: 'تعديل بعد الاعتماد' });
    expect(edit.status).toBe(400);
    expect(edit.body.error.code).toBe('REVIEW_NOT_REJECTED');
  });

  it('[CRITICAL] المرفوض يُفتح للتعديل من جديد', async () => {
    const { user, orderId } = await receivedOrder();
    const created = await submit(user.token, orderId);
    const reviewId = created.body.data.id as string;

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'صورة غير واضحة' })
      .expect(200);

    const edit = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 4, comment: 'نصّ محدَّث بعد الرفض' })
      .expect(200);
    expect(edit.body.data.status).toBe('pending');
  });

  it('المعلَّق لا يُعدَّل قبل أن يبتّ فيه المسؤول', async () => {
    const { user, orderId } = await receivedOrder();
    const created = await submit(user.token, orderId);

    const edit = await api
      .patch(`/api/reviews/${created.body.data.id}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 1, comment: 'محاولة تعديل أثناء المراجعة' });
    expect(edit.status).toBe(400);
    expect(edit.body.error.code).toBe('REVIEW_NOT_REJECTED');
  });

  // ── الحالة تعيش على الخادم ──

  it('[CRITICAL] حالة الزرّ تُقرأ من الخادم — تصمد عبر أي إعادة تشغيل', async () => {
    // الواجهة تسأل هذا المسار عند كل فتح للشاشة؛ لا علم محليّ يقرّر.
    const { user, orderId } = await receivedOrder();

    const before = await api
      .get('/api/reviews/find')
      .query({ orderId, productId: catalog.productIds[0]! })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(before.body.data).toBeNull();

    await submit(user.token, orderId);

    const after = await api
      .get('/api/reviews/find')
      .query({ orderId, productId: catalog.productIds[0]! })
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(after.body.data.status).toBe('pending');
  });

  it('تقييم عميل آخر لا يُرى ولا يمنع', async () => {
    const { user, orderId } = await receivedOrder();
    await submit(user.token, orderId);

    const stranger = await registerAndLogin();
    const res = await api
      .get('/api/reviews/find')
      .query({ orderId, productId: catalog.productIds[0]! })
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(200);
    expect(res.body.data).toBeNull();
  });
});

afterAll(async () => {
  await purgeTestUsers();
  await db.end();
});
