import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import {
  api,
  createAdminUser,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * عقد انكشاف `/uploads` — صور التقييم قبل الاعتماد.
 *
 * ═══ القرار (تدقيق 2026-09-14) ═══ الملفات المرفوعة تُقدَّم عامّةً
 * **بالمرجع** لا بالتصفّح: مفتاح التخزين `غرض/سنة/شهر/<uuid v4>.<امتداد>`
 * (١٢٢ بتّاً من العشوائية) لا يُخمَّن، والمجلّد لا يُسرَد (`index: false`)،
 * ولا واجهةٌ عامّة تُدرج مرجعَ صورةٍ منتظرة أو مرفوضة — المجتمع وتقييمات
 * المنتج يعيدان المعتمَد وحده. من يملك الرابط هو رافعُه (يستطيع مشاركته
 * أصلاً) أو المسؤول.
 *
 * البديل — مسارٌ محميّ لصور التقييم — كان سيكسر معاينةَ الرافع في التطبيق
 * ولوحةَ المراجعة (`Image.network` و`<img>` لا يحملان توكناً) مقابل الانتقال
 * من «رابطٌ لا يُخمَّن» إلى «رابطٌ لا يُخمَّن». هذه الاختبارات تثبّت شروط
 * القرار؛ لو سقط أحدها (سردٌ، أو تسرّبُ مرجعٍ منتظر) بطل القرار معه.
 *
 * ما لا يحميه هذا العقد (مُقرٌّ به): من حصل على رابطٍ منتظر/مرفوض بأي طريق
 * يستطيع فتحه ما دام الملفّ موجوداً، والمتصفّح يحتفظ به ٣٠ يوماً.
 */
describe('[SECURITY] انكشاف /uploads', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await db.query('UPDATE products SET stock = 500 WHERE id = ANY($1::uuid[])', [
      catalog.productIds,
    ]);
  });

  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100' +
      'ffff03000006000557bfabd40000000049454e44ae426082',
    'hex',
  );

  it('لا سرد للمجلّدات — الجذر ومجلّد التقييمات', async () => {
    for (const path of ['/uploads', '/uploads/', '/uploads/review', '/uploads/review/']) {
      const res = await api.get(path);
      expect(res.status, path).toBe(404);
      expect(res.text).not.toMatch(/<a href=/i);
    }
  });

  it('صعود المسار المشفَّر لا يخرج من جذر التخزين', async () => {
    for (const path of ['/uploads/..%2fpackage.json', '/uploads/review/..%2f..%2fpackage.json', '/uploads/%2e%2e/package.json']) {
      const res = await api.get(path);
      expect([403, 404], path).toContain(res.status);
      expect(res.text, path).not.toContain('otaku-galaxy-api');
    }
  });

  it('مرجع الرفع لا يُخمَّن: غرض/سنة/شهر/uuid-v4.امتداد', async () => {
    const user = await registerAndLogin();
    const res = await api
      .post('/api/uploads')
      .set('Authorization', `Bearer ${user.token}`)
      .field('purpose', 'review')
      .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' })
      .expect(201);
    const url = res.body.data.url as string;
    expect(url).toMatch(
      /^\/uploads\/review\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    // اسم الملفّ الذي أرسله العميل لا يظهر في المرجع.
    expect(url).not.toContain('me');
  });

  it('[CRITICAL] صورةُ تقييمٍ منتظر أو مرفوض لا تظهر في أي واجهةٍ عامّة — وتظهر بعد الاعتماد', async () => {
    const user = await registerAndLogin();
    const auth = `Bearer ${user.token}`;
    const productId = catalog.productIds[2]!;
    await api.post('/api/cart').set('Authorization', auth).send({ productId, quantity: 1 }).expect(200);
    const created = await api
      .post('/api/orders')
      .set('Authorization', auth)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07736666666' })
      .expect(201);
    const orderId = created.body.data.id as string;
    await api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OUT_FOR_DELIVERY' })
      .expect(200);
    await api.post(`/api/orders/${orderId}/confirm-receipt`).set('Authorization', auth).expect(200);

    const upload = await api
      .post('/api/uploads')
      .set('Authorization', auth)
      .field('purpose', 'review')
      .attach('file', PNG, { filename: 'p.png', contentType: 'image/png' })
      .expect(201);
    const photo = upload.body.data.url as string;

    const review = await api
      .post('/api/reviews')
      .set('Authorization', auth)
      .send({ orderId, productId, rating: 5, comment: 'صورة قيد المراجعة الآن', photoUrls: [photo] })
      .expect(201);
    const reviewId = review.body.data.id as string;

    const publicSurfaces = async () => {
      const community = await api.get('/api/catalog/community/photos').expect(200);
      const product = await api.get(`/api/catalog/products/${productId}/reviews`).expect(200);
      return JSON.stringify([community.body, product.body]);
    };

    // منتظر: غائب.
    expect(await publicSurfaces()).not.toContain(photo);

    // مرفوض: غائب.
    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'rejected', rejectionReason: 'صورة غير واضحة' })
      .expect(200);
    expect(await publicSurfaces()).not.toContain(photo);

    // معتمَد: حاضر — هذا ما يجعل الرابط عامّاً فعلاً.
    await api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    expect(await publicSurfaces()).toContain(photo);

    // والملفّ نفسه يُخدَم بالمرجع في كل الحالات (القرار المُقرّ به).
    const file = await api.get(photo);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toMatch(/image\/png/);
  });
});
