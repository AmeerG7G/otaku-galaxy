import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
} from './helpers.js';

/**
 * ملكية صور التقييم — والصورة الشخصية.
 *
 * [SECURITY] كان `assertOwnedPhotos` يتحقّق من **وجود** الصفّ في
 * `media_files` فقط. أي زبون يستطيع أخذ مرجع صورةٍ منشورة في المجتمع (أو
 * صورة منتج رفعها المسؤول) وإرفاقها بتقييمه، فينال نقاط «تقييم بصورة»
 * عن لقطةٍ ليست له، وتُنسب إليه في المجتمع. المخطّط يحمل المالك
 * (`uploaded_by`) والغرض (`purpose`) منذ الهجرة ٠١٨ — فالفحص يقرأهما.
 *
 * الرسالة والرمز واحدان للمفقود وللمملوك لغيرك: لا نكشف وجود ملفّ لا
 * يملكه السائل.
 */
describe('[SECURITY] ملكية صور التقييم', () => {
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
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07735555555' })
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

  const review = (auth: string, orderId: string, productId: string, photoUrls: string[]) =>
    api
      .post('/api/reviews')
      .set('Authorization', auth)
      .send({ orderId, productId, rating: 5, comment: 'تجربة ممتازة فعلاً', photoUrls });

  /** صفّ وسائط رفعه المسؤول لغرض غير التقييم (صورة منتج) — مرجعٌ عام. */
  async function adminProductImage(adminUserId: string) {
    const key = `product/test/${crypto.randomUUID()}.png`;
    const url = `/uploads/${key}`;
    await db.query(
      `INSERT INTO media_files (storage_key, url, purpose, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, 'product', 'image/png', 2048, $3)`,
      [key, url, adminUserId],
    );
    return url;
  }

  async function adminUserId() {
    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1`,
    );
    return rows[0]!.id;
  }

  it('[CRITICAL] صورة زبونٍ آخر لا تُرفق — INVALID_PHOTO_URL بلا كشف', async () => {
    const victim = await registerAndLogin();
    const stolen = await registerUploadedPhoto(victim.userId);
    const { auth, orderId } = await receivedOrder();

    const res = await review(auth, orderId, catalog.productIds[0]!, [stolen]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTO_URL');
    // نفس الرسالة التي تُعطى لمرجعٍ لا وجود له — لا فرق يُستنتج منه.
    const missing = await review(auth, orderId, catalog.productIds[0]!, ['/uploads/review/x/none.png']);
    expect(missing.status).toBe(400);
    expect(missing.body.error.message).toBe(res.body.error.message);
  });

  it('[CRITICAL] صورة منتجٍ رفعها المسؤول (مرجعٌ عام) لا تُرفق بتقييم', async () => {
    const publicRef = await adminProductImage(await adminUserId());
    const { auth, orderId } = await receivedOrder();
    const res = await review(auth, orderId, catalog.productIds[0]!, [publicRef]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTO_URL');
  });

  it('صورةٌ رفعها الزبون نفسه لغرض التقييم تُقبل وتمنح نقاط الصورة عند الاعتماد', async () => {
    const { user, auth, orderId } = await receivedOrder();
    const own = await registerUploadedPhoto(user.userId);
    const created = await review(auth, orderId, catalog.productIds[0]!, [own]).expect(201);
    await api
      .patch(`/api/admin/reviews/${created.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    const { rows } = await db.query<{ reason: string; amount: number }>(
      `SELECT reason, amount FROM points_ledger WHERE user_id = $1 AND review_id = $2 ORDER BY reason`,
      [user.userId, created.body.data.id],
    );
    expect(rows.map((r) => r.reason)).toContain('review_with_photo');
  });

  it('[CRITICAL] مصفوفة أول عنصرها مملوك وباقيها مسروق تُرفض كلّها', async () => {
    const victim = await registerAndLogin();
    const stolen = await registerUploadedPhoto(victim.userId);
    const { user, auth, orderId } = await receivedOrder();
    const own = await registerUploadedPhoto(user.userId);
    const res = await review(auth, orderId, catalog.productIds[0]!, [own, stolen]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTO_URL');
    const mine = await api.get('/api/reviews').set('Authorization', auth).expect(200);
    expect(mine.body.data).toEqual([]);
  });

  it('إعادة الإرسال تُبقي صورةً قائمةً على التقييم ولو فُقد صفّ مالكها، وترفض صورةً غريبةً جديدة', async () => {
    const { user, auth, orderId } = await receivedOrder();
    const own = await registerUploadedPhoto(user.userId);
    const created = await review(auth, orderId, catalog.productIds[1]!, [own]).expect(201);
    const reviewId = created.body.data.id as string;
    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'أعد الصياغة' })
      .expect(200);

    // «مالكٌ مفقود»: صفّ الوسائط فقد رافعه (ON DELETE SET NULL، أو بيانات
    // أقدم). الصورة كانت على التقييم منذ قُبلت أولَ مرة، فتبقى.
    await db.query('UPDATE media_files SET uploaded_by = NULL WHERE url = $1', [own]);
    const kept = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 4, comment: 'صياغة معدّلة وأفضل', photoUrls: [own] })
      .expect(200);
    expect(kept.body.data.photoUrls).toEqual([own]);
    expect(kept.body.data.status).toBe('pending');

    // أمّا صورةٌ **جديدة** لغير صاحب التقييم فتُرفض في إعادة الإرسال أيضاً.
    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'مرة أخرى' })
      .expect(200);
    const victim = await registerAndLogin();
    const stolen = await registerUploadedPhoto(victim.userId);
    const res = await api
      .patch(`/api/reviews/${reviewId}`)
      .set('Authorization', auth)
      .send({ rating: 4, comment: 'صياغة معدّلة وأفضل', photoUrls: [own, stolen] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_PHOTO_URL');
  });
});

describe('[SECURITY] ملكية الصورة الشخصية', () => {
  it('صورة زبونٍ آخر لا تصير صورتك الشخصية', async () => {
    const victim = await registerAndLogin();
    const stolen = await registerUploadedPhoto(victim.userId);
    const me = await registerAndLogin();
    const res = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ avatarUrl: stolen });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AVATAR_URL');
  });

  it('صورتك أنت تُقبل، وتبقى مع تعديلٍ لاحق لا يغيّرها', async () => {
    const me = await registerAndLogin();
    const own = await registerUploadedPhoto(me.userId);
    const set = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ avatarUrl: own })
      .expect(200);
    expect(set.body.data.user.avatarUrl).toBe(own);

    // تطبيقٌ يعيد إرسال الصورة الحالية مع تغيير الاسم — تبقى كما هي.
    const again = await api
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${me.token}`)
      .send({ username: 'اسم جديد', avatarUrl: own })
      .expect(200);
    expect(again.body.data.user.avatarUrl).toBe(own);
    expect(again.body.data.user.username).toBe('اسم جديد');
  });
});
