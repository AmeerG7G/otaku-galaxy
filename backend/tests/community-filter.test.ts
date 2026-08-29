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
 * فلترة صور المجتمع بالقسم — تتم على الخادم قبل الحدّ الأعلى، فتشمل كامل
 * البيانات لا الصفحة المحمَّلة فقط.
 */
describe('community photos category filter', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  /** قسم ثانٍ بمنتجه، حتى نتحقق أن الفلترة تفصل فعلاً. */
  let otherCategoryId: string;
  let otherProductId: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    const { rows: catRows } = await db.query<{ id: string }>(
      `INSERT INTO categories (name, image_url) VALUES ('قسم مجتمع اختبار', '')
       ON CONFLICT (name) DO UPDATE SET image_url = EXCLUDED.image_url
       RETURNING id`,
    );
    otherCategoryId = catRows[0]!.id;

    const { rows: subRows } = await db.query<{ id: string }>(
      `INSERT INTO subcategories (category_id, name) VALUES ($1, 'فرعي مجتمع')
       ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [otherCategoryId],
    );

    const { rows: prodRows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
       VALUES ('منتج مجتمع اختبار', 'وصف', 9000, $1, $2, 50)
       ON CONFLICT DO NOTHING RETURNING id`,
      [otherCategoryId, subRows[0]!.id],
    );
    otherProductId =
      prodRows[0]?.id ??
      (
        await db.query<{ id: string }>('SELECT id FROM products WHERE name = $1', [
          'منتج مجتمع اختبار',
        ])
      ).rows[0]!.id;
  });

  /** يوصل طلباً للاكتمال ثم ينشر تقييماً مصوّراً معتمداً للمنتج. */
  async function publishPhotoReview(productId: string) {
    const user = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ productId, quantity: 1 })
      .expect(200);
    const created = await api
      .post('/api/orders')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        governorateId: catalog.governorateId,
        fullAddress: 'بغداد',
        phone: '07755555555',
      })
      .expect(201);
    const orderId = created.body.data.id as string;
    for (const next of ['CONFIRMED', 'PREPARING', 'OUT_FOR_DELIVERY', 'COMPLETED']) {
      await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: next })
        .expect(200);
    }
    // نافذة التقييم تُفتح بعد مهلة الاستلام — ننقل الطلب إلى الماضي.
    await fastForwardRatingWindow(orderId);
    const review = await api
      .post('/api/reviews')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        orderId,
        productId,
        rating: 5,
        comment: 'ممتاز',
        photoUrl: await registerUploadedPhoto(user.userId),
      })
      .expect(201);
    await api
      .patch(`/api/admin/reviews/${review.body.data.id}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' })
      .expect(200);
    return review.body.data.id as string;
  }

  beforeAll(async () => {
    await publishPhotoReview(catalog.productIds[0]!);
    await publishPhotoReview(otherProductId);
  });

  it('returns every photo with its category when unfiltered', async () => {
    const res = await api.get('/api/catalog/community/photos').expect(200);
    const items = res.body.data as Array<{ categoryId: string | null }>;

    expect(items.length).toBeGreaterThanOrEqual(2);
    // كل صورة تحمل قسمها — عليه تُبنى شرائح الفلترة.
    expect(items.every((p) => typeof p.categoryId === 'string')).toBe(true);
    expect(items.some((p) => p.categoryId === catalog.categoryId)).toBe(true);
    expect(items.some((p) => p.categoryId === otherCategoryId)).toBe(true);
  });

  it('returns only the requested category', async () => {
    const res = await api
      .get('/api/catalog/community/photos')
      .query({ categoryId: otherCategoryId })
      .expect(200);
    const items = res.body.data as Array<{ categoryId: string | null }>;

    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((p) => p.categoryId === otherCategoryId)).toBe(true);
  });

  it('exposes the category name for display', async () => {
    const res = await api
      .get('/api/catalog/community/photos')
      .query({ categoryId: otherCategoryId })
      .expect(200);
    const items = res.body.data as Array<{ categoryName: string | null }>;
    expect(items[0]!.categoryName).toBe('قسم مجتمع اختبار');
  });

  it('returns an empty list for a category with no photos', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO categories (name, image_url) VALUES ('قسم بلا صور', '')
       ON CONFLICT (name) DO UPDATE SET image_url = EXCLUDED.image_url
       RETURNING id`,
    );
    const res = await api
      .get('/api/catalog/community/photos')
      .query({ categoryId: rows[0]!.id })
      .expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects a category id that is not a real uuid', async () => {
    const res = await api
      .get('/api/catalog/community/photos')
      .query({ categoryId: 'كل-الأقسام' });
    // الفلترة لا تُتجاهل بصمت — قيمة غير صالحة تُرفض.
    expect(res.status).toBe(400);
  });

  it('filters across the whole dataset, not just the returned page', async () => {
    // الفلترة في SQL قبل LIMIT: عدد نتائج القسم لا يتأثر بترتيب/حدّ القائمة
    // الكاملة، ويساوي عدّ الصور المعتمدة لذلك القسم في القاعدة.
    const filtered = await api
      .get('/api/catalog/community/photos')
      .query({ categoryId: otherCategoryId })
      .expect(200);

    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM reviews r
         JOIN products p ON p.id = r.product_id
        WHERE r.status = 'approved'
          AND r.photo_url IS NOT NULL AND btrim(r.photo_url) <> ''
          AND p.category_id = $1`,
      [otherCategoryId],
    );
    expect((filtered.body.data as unknown[]).length).toBe(Number(rows[0]!.count));
  });
});
