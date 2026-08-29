import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  fastForwardRatingWindow,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * اختبارات الأنظمة المضافة: التقييمات ومراجعتها، نقاط المجرّة، المجموعات،
 * الإشعارات، عيد الميلاد، ومناطق التوصيل — مع التركيز على الملكية والصلاحية
 * وعدم تكرار المنح/الخصم.
 */

let adminToken: string;
let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

beforeAll(async () => {
  catalog = await seedTestCatalog();
  adminToken = await createAdminUser();
});

/** يوصل طلباً حتى COMPLETED ليصبح قابلاً للتقييم. */
async function completedOrder(productId: string, quantity = 1) {
  const user = await registerAndLogin();
  await api
    .post('/api/cart')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ productId, quantity })
    .expect(200);

  const order = await api
    .post('/api/orders')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' });
  expect(order.status).toBe(201);
  const orderId = order.body.data.id as string;

  for (const status of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status })
      .expect(200);
  }
  // التقييم لا يُفتح إلا بعد مهلة الاستلام؛ ننقل الطلب إلى الماضي بدل
  // تعطيل القاعدة، فتبقى القاعدة الإنتاجية تحت الاختبار.
  await fastForwardRatingWindow(orderId);
  return { user, orderId };
}

describe('reviews + moderation', () => {
  it('customer submits a review, admin approves it, and it becomes public', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await completedOrder(productId);

    const submitted = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 5, comment: 'منتج ممتاز' });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.status).toBe('pending');
    const reviewId = submitted.body.data.id as string;

    // قبل الاعتماد لا يظهر التقييم للعامة.
    const before = await api.get(`/api/catalog/products/${productId}/reviews`).expect(200);
    expect(before.body.data.some((r: { id: string }) => r.id === reviewId)).toBe(false);

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);

    const after = await api.get(`/api/catalog/products/${productId}/reviews`).expect(200);
    expect(after.body.data.some((r: { id: string }) => r.id === reviewId)).toBe(true);
  });

  it('rejecting a review requires a reason and allows edit + resubmit', async () => {
    const productId = catalog.productIds[1]!;
    const { user, orderId } = await completedOrder(productId);

    const submitted = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 2, comment: 'نص غير لائق' })
      .expect(201);
    const reviewId = submitted.body.data.id as string;

    const noReason = await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected' });
    expect(noReason.status).toBe(400);

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'لغة غير مناسبة' })
      .expect(200);

    const mine = await api
      .get('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const rejected = mine.body.data.find((r: { id: string }) => r.id === reviewId);
    expect(rejected.status).toBe('rejected');
    expect(rejected.rejectionReason).toBe('لغة غير مناسبة');

    // التعديل يعيده لقائمة الانتظار ويمسح سبب الرفض.
    const resubmitted = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', `Bearer ${user.token}`)
      .send({ rating: 4, comment: 'تعليق مهذّب' })
      .expect(200);
    expect(resubmitted.body.data.status).toBe('pending');
    expect(resubmitted.body.data.rejectionReason).toBeNull();
  });

  it('a customer cannot review another customer order', async () => {
    const productId = catalog.productIds[2]!;
    const { orderId } = await completedOrder(productId);
    const intruder = await registerAndLogin();

    const response = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${intruder.token}`)
      .send({ orderId, productId, rating: 5, comment: 'محاولة' });
    expect(response.status).toBe(404);
  });

  it('re-applying the same moderation decision has no side effects', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await completedOrder(productId);

    const submitted = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ orderId, productId, rating: 4, comment: 'تكرار القرار' })
      .expect(201);
    const reviewId = submitted.body.data.id as string;

    const notificationsAfter = async () =>
      (
        await api
          .get('/api/notifications')
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200)
      ).body.data.items.length as number;
    const pointsAfter = async () =>
      (
        await api
          .get('/api/points')
          .set('Authorization', `Bearer ${user.token}`)
          .expect(200)
      ).body.data.balance as number;

    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    const notificationsOnce = await notificationsAfter();
    const pointsOnce = await pointsAfter();

    // ضغطتان إضافيتان على «نشر» يجب ألا تُنتجا إشعارات أو نقاطاً جديدة.
    for (let i = 0; i < 2; i++) {
      await api
        .patch(`/api/admin/reviews/${reviewId}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'approved' })
        .expect(200);
    }

    expect(await notificationsAfter()).toBe(notificationsOnce);
    expect(await pointsAfter()).toBe(pointsOnce);
  });

  it('a customer cannot moderate reviews', async () => {
    const customer = await registerAndLogin();
    const response = await api
      .get('/api/admin/reviews')
      .set('Authorization', `Bearer ${customer.token}`);
    expect(response.status).toBe(403);
  });
});

describe('galaxy points ledger', () => {
  it('awards points once for a received order and again when a review is approved', async () => {
    const productId = catalog.productIds[0]!;
    const { user, orderId } = await completedOrder(productId);

    const afterOrder = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(afterOrder.body.data.balance).toBe(20);
    expect(afterOrder.body.data.activity).toHaveLength(1);

    // إعادة ضبط الحالة إلى COMPLETED مجدداً يجب ألا تمنح نقاطاً ثانية.
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);
    const repeat = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(repeat.body.data.balance).toBe(20);

    // تقييم مصوّر معتمد يمنح ٥ نقاط.
    const submitted = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        orderId,
        productId,
        rating: 5,
        comment: 'رائع',
        photoUrl: await registerUploadedPhoto(user.userId),
      })
      .expect(201);
    await api
      .patch(`/api/admin/reviews/${submitted.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);

    const afterReview = await api
      .get('/api/points')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(afterReview.body.data.balance).toBe(25);
  });
});

describe('collections ownership', () => {
  it('creates, renames, adds products and blocks other users', async () => {
    const owner = await registerAndLogin();
    const stranger = await registerAndLogin();
    const productId = catalog.productIds[0]!;

    const createdCollection = await api
      .post('/api/collections')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'أريدها لاحقاً' })
      .expect(201);
    const collectionId = createdCollection.body.data.id as string;

    await api
      .post(`/api/collections/${collectionId}/products`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ productId })
      .expect(200);

    const mine = await api
      .get('/api/collections')
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(mine.body.data[0].productIds).toContain(productId);

    // مجموعات المالك لا تظهر لغيره.
    const others = await api
      .get('/api/collections')
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(200);
    expect(others.body.data).toHaveLength(0);

    // ولا يستطيع تعديلها أو حذفها.
    const rename = await api
      .patch(`/api/collections/${collectionId}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ name: 'اختراق' });
    expect(rename.status).toBe(404);

    const remove = await api
      .delete(`/api/collections/${collectionId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(remove.status).toBe(404);
  });
});

describe('notifications', () => {
  it('creates order notifications and tracks read state per owner', async () => {
    const productId = catalog.productIds[1]!;
    const { user } = await completedOrder(productId);

    const listed = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    // قبول + خروج للتوصيل + استلام = ثلاثة إشعارات على الأقل.
    expect(listed.body.data.items.length).toBeGreaterThanOrEqual(3);
    expect(listed.body.data.unread).toBe(listed.body.data.items.length);

    const firstId = listed.body.data.items[0].id as string;
    await api
      .post(`/api/notifications/${firstId}/read`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);

    const afterOne = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(afterOne.body.data.unread).toBe(listed.body.data.unread - 1);

    await api
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    const afterAll = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(afterAll.body.data.unread).toBe(0);

    // إشعار شخص آخر لا يمكن تعليمه مقروءاً (ولا يظهر أصلاً).
    const stranger = await registerAndLogin();
    const strangerList = await api
      .get('/api/notifications')
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(200);
    expect(strangerList.body.data.items).toHaveLength(0);
  });
});

describe('birthday discount', () => {
  it('locks until first completed order, saves once, and cannot be reused in the same year', async () => {
    const productId = catalog.productIds[0]!;
    const fresh = await registerAndLogin();

    // مقفل قبل أول طلب مستلم.
    const locked = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${fresh.token}`)
      .expect(200);
    expect(locked.body.data.unlocked).toBe(false);
    const rejectedSave = await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${fresh.token}`)
      .send({ day: 1, month: 1 });
    expect(rejectedSave.status).toBe(400);

    const { user } = await completedOrder(productId);
    const unlocked = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(unlocked.body.data.unlocked).toBe(true);

    // نضبط عيد الميلاد على اليوم الحالي ليصبح الخصم متاحاً.
    const today = new Date();
    await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ day: today.getDate(), month: today.getMonth() + 1 })
      .expect(200);

    // لا يمكن تغييره بعد الحفظ.
    const secondSave = await api
      .post('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ day: 2, month: 2 });
    expect(secondSave.status).toBe(409);

    const status = await api
      .get('/api/birthday')
      .set('Authorization', `Bearer ${user.token}`)
      .expect(200);
    expect(status.body.data.isBirthdayToday).toBe(true);
    expect(status.body.data.rewardAvailable).toBe(true);

    // أول طلب بعد ضبط الميلاد يأخذ الخصم فعلياً.
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const discounted = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' })
      .expect(201);
    expect(discounted.body.data.discount).toBeGreaterThan(0);

    // الطلب الثاني في نفس السنة بلا خصم — القيد الفريد يمنع التكرار.
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const second = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07733333333' })
      .expect(201);
    expect(second.body.data.discount).toBe(0);
  });
});

describe('delivery zones pricing', () => {
  let zonedGovernorateId: string;
  let insideZoneId: string;
  let outsideZoneId: string;

  beforeAll(async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee)
       VALUES ('محافظة اختبار المناطق', 5000)
       ON CONFLICT (name) DO UPDATE SET delivery_fee = 5000
       RETURNING id`,
    );
    zonedGovernorateId = rows[0]!.id;
    // الاختبارات تعمل على قاعدة بيانات مستمرة — ننظّف مناطق هذه المحافظة
    // أولاً حتى تكون التهيئة قابلة للتكرار.
    await db.query('DELETE FROM governorate_zones WHERE governorate_id = $1', [
      zonedGovernorateId,
    ]);

    const inside = await api
      .post('/api/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ governorateId: zonedGovernorateId, name: 'داخل القضاء', deliveryFee: 3000, sortOrder: 0 });
    expect(inside.status).toBe(201);
    insideZoneId = inside.body.data.id as string;

    const outside = await api
      .post('/api/admin/zones')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ governorateId: zonedGovernorateId, name: 'خارج القضاء', deliveryFee: 8000, sortOrder: 1 });
    expect(outside.status).toBe(201);
    outsideZoneId = outside.body.data.id as string;
  });

  it('exposes zones publicly and charges the zone fee, not the governorate fee', async () => {
    const publicZones = await api
      .get(`/api/catalog/governorates/${zonedGovernorateId}/zones`)
      .expect(200);
    expect(publicZones.body.data.items).toHaveLength(2);

    const productId = catalog.productIds[0]!;

    const cheap = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${cheap.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const cheapOrder = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${cheap.token}`)
      .send({
        governorateId: zonedGovernorateId,
        zoneId: insideZoneId,
        fullAddress: 'عنوان اختبار داخل',
        phone: '07733333333',
      })
      .expect(201);
    expect(cheapOrder.body.data.deliveryFee).toBe(3000);
    expect(cheapOrder.body.data.zoneName).toBe('داخل القضاء');

    const pricey = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${pricey.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const priceyOrder = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${pricey.token}`)
      .send({
        governorateId: zonedGovernorateId,
        zoneId: outsideZoneId,
        fullAddress: 'عنوان اختبار خارج',
        phone: '07733333333',
      })
      .expect(201);
    expect(priceyOrder.body.data.deliveryFee).toBe(8000);
  });

  it('requires a zone when the governorate has zones', async () => {
    const productId = catalog.productIds[0]!;
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);

    const missing = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        governorateId: zonedGovernorateId,
        fullAddress: 'عنوان بلا منطقة',
        phone: '07733333333',
      });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('ZONE_REQUIRED');
  });

  it('only admins can manage zones', async () => {
    const customer = await registerAndLogin();
    const response = await api
      .post('/api/admin/zones')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ governorateId: zonedGovernorateId, name: 'اختراق', deliveryFee: 0 });
    expect(response.status).toBe(403);
  });
});
