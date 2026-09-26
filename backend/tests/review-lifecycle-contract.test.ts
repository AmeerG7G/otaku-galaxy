// عقد دورة التقييم من جهة العميل: متى يختفي زرّ «قيّم طلبك» (على الخادم)،
// وأن إعادة إرسال تقييم مرفوض بصوره القائمة تنجح.
//
// [CRITICAL] كان `canReview` (= استُلم الطلب) هو الحقل الوحيد، وهو صحيح إلى
// الأبد؛ فبقي الزرّ ظاهراً بعد أن قُيّم كل منتج. `reviewableProductCount`
// يقول للتطبيق ما بقي. وكان التطبيق يعرض للزبون روابط صور مطلقة ويعيد
// إرسالها عند تعديل تقييمٍ مرفوض، فيرفضها الخادم `INVALID_PHOTO_URL` رغم
// أنها صوره — فيصير المرفوض غيرَ قابلٍ للتصحيح إن حمل صورة.

import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { config } from '../src/config/index.js';
import { toStoredMediaReference } from '../src/services/reviewsService.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

describe('عقد دورة التقييم', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query('UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])', [
      catalog.productIds,
    ]);
  });

  /** طلبٌ بمنتجين استُلم فعلاً — التقييم مفتوح على الاثنين. */
  async function receivedOrder() {
    const user = await registerAndLogin();
    const auth = `Bearer ${user.token}`;
    for (const productId of catalog.productIds.slice(0, 2)) {
      await api.post('/api/cart').set('Authorization', auth).send({ productId, quantity: 1 }).expect(200);
    }
    const created = await api
      .post('/api/orders')
      .set('Authorization', auth)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07734444444' })
      .expect(201);
    const orderId = created.body.data.id as string;
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    await api.post(`/api/orders/${orderId}/confirm-receipt`).set('Authorization', auth).expect(200);
    return { user, auth, orderId };
  }

  const review = (auth: string, orderId: string, productId: string, photoUrls: string[] = []) =>
    api
      .post('/api/reviews')
      .set('Authorization', auth)
      .send({ orderId, productId, rating: 4, comment: 'ممتاز جداً', photoUrls });

  it('[CRITICAL] reviewableProductCount ينقص مع كل تقييم ويصل الصفر', async () => {
    const { auth, orderId } = await receivedOrder();
    const [first, second] = catalog.productIds;

    const before = await api.get(`/api/orders/${orderId}`).set('Authorization', auth).expect(200);
    expect(before.body.data.canReview).toBe(true);
    expect(before.body.data.reviewableProductCount).toBe(2);

    await review(auth, orderId, first!).expect(201);
    const mid = await api.get(`/api/orders/${orderId}`).set('Authorization', auth).expect(200);
    expect(mid.body.data.reviewableProductCount).toBe(1);

    await review(auth, orderId, second!).expect(201);
    const after = await api.get(`/api/orders/${orderId}`).set('Authorization', auth).expect(200);
    expect(after.body.data.canReview).toBe(true);
    expect(after.body.data.reviewableProductCount).toBe(0);

    // والقائمة تحمل الحقل نفسه — بطاقة الطلب تقرأ منها.
    const list = await api.get('/api/orders').set('Authorization', auth).expect(200);
    const row = (list.body.data.items as { id: string; reviewableProductCount: number }[]).find(
      (o) => o.id === orderId,
    );
    expect(row?.reviewableProductCount).toBe(0);

    // رفضُ الإدارة يعيد المنتج إلى «قابل للفعل» — ليصحّح صاحبه تقييمه.
    const mine = await api.get('/api/reviews').set('Authorization', auth).expect(200);
    const rejectedId = (mine.body.data as { id: string; productId: string }[]).find(
      (r) => r.productId === first,
    )!.id;
    await api
      .patch(`/api/admin/reviews/${rejectedId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'نصّ غير مناسب' })
      .expect(200);
    const afterReject = await api.get(`/api/orders/${orderId}`).set('Authorization', auth).expect(200);
    expect(afterReject.body.data.reviewableProductCount).toBe(1);
  });

  it('[CRITICAL] تعديل تقييم مرفوض بصوره المطلقة (كما يعرضها التطبيق) ينجح', async () => {
    const { user, auth, orderId } = await receivedOrder();
    const [productId] = catalog.productIds;
    const relative = await registerUploadedPhoto(user.userId);

    const created = await review(auth, orderId, productId!, [relative]).expect(201);
    const reviewId = created.body.data.id as string;

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'الصورة غير واضحة' })
      .expect(200);

    // أصلٌ غريب يبقى مرفوضاً — ما دام التقييم مرفوضاً وقابلاً للتعديل.
    const foreign = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 5, comment: 'x', photoUrls: [`https://evil.example${relative}`] });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_PHOTO_URL');

    // التطبيق يحلّ المرجع إلى رابط مطلق للعرض ويعيده كما هو.
    const absolute = `${config.publicBaseUrl.replace(/\/+$/, '')}${relative}`;
    const resubmitted = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 5, comment: 'أعدت الصورة', photoUrls: [absolute] });
    expect(resubmitted.status).toBe(200);
    expect(resubmitted.body.data.status).toBe('pending');
    expect(resubmitted.body.data.photoUrls).toEqual([relative]);
  });

  it('[CRITICAL] أصلُ المحاكي (10.0.2.2) ≠ publicBaseUrl ⇒ المطلق يُرفض والنسبي يمرّ', async () => {
    // هذا هو سبب أن يرسل التطبيق **المرجع** لا رابط العرض: الهاتف يرى الخادم
    // بأصلٍ يختلف عن `PUBLIC_BASE_URL` (محاكي أندرويد ‎10.0.2.2‎، شبكة محلية،
    // staging خلف اسم آخر). قبولُ ذلك الأصل يعني قبول أي أصل؛ فالمرجع النسبي
    // هو ما يعمل في كل بيئة.
    const { user, auth, orderId } = await receivedOrder();
    const [, productId] = catalog.productIds;
    const relative = await registerUploadedPhoto(user.userId);

    const created = await review(auth, orderId, productId!, [relative]).expect(201);
    const reviewId = created.body.data.id as string;
    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'أعد الصورة' })
      .expect(200);

    const devOrigin = `http://10.0.2.2:4000${relative}`;
    expect(new URL(devOrigin).origin).not.toBe(new URL(config.publicBaseUrl).origin);
    const asDisplayUrl = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 5, comment: 'من المحاكي', photoUrls: [devOrigin] });
    expect(asDisplayUrl.status).toBe(400);
    expect(asDisplayUrl.body.error.code).toBe('INVALID_PHOTO_URL');

    const asReference = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 5, comment: 'من المحاكي بالمرجع', photoUrls: [relative] })
      .expect(200);
    expect(asReference.body.data.photoUrls).toEqual([relative]);
    expect(asReference.body.data.status).toBe('pending');
  });

  it('toStoredMediaReference يطبّع المطلق ويترك غيره', () => {
    expect(toStoredMediaReference('/uploads/a.jpg')).toBe('/uploads/a.jpg');
    expect(toStoredMediaReference(`${config.publicBaseUrl}/uploads/a.jpg`)).toBe('/uploads/a.jpg');
    expect(toStoredMediaReference('https://evil.example/uploads/a.jpg')).toBe(
      'https://evil.example/uploads/a.jpg',
    );
    expect(toStoredMediaReference('https://evil.example/other/a.jpg')).toBe(
      'https://evil.example/other/a.jpg',
    );
    expect(toStoredMediaReference('not a url')).toBe('not a url');
  });
});
