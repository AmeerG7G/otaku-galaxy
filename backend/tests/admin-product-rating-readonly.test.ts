// التقييم وعدد التقييمات قيمتان مشتقّتان من التقييمات المنشورة (زناد
// `refresh_product_rating`)، لا حقلا إدخال.
//
// كان `PATCH /api/admin/products/:id` يقبلهما، وصفحة التعديل تعيد إرسال
// القيمتين المعروضتين (معطَّلتين في النموذج) مع كل حفظ — فأي تقييم يُنشر
// بين فتح الصفحة وحفظها كان يُمحى بقيمةٍ قديمة. المنتج الجديد يبدأ بلا
// تقييم، ولا مسار إداري يخترع له واحداً.

import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

describe('التقييم للقراءة فقط من جهة الإدارة', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  it('المنتج الجديد يبدأ بلا تقييم وبلا عدد', async () => {
    const res = await api
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameAr: `منتج تدقيق ${Date.now()}`,
        descriptionAr: 'وصف',
        nameCkb: 'بەرهەمی پشکنین',
        descriptionCkb: 'وەسف',
        price: 7000,
        categoryId: catalog.categoryId,
        subcategoryId: catalog.subcategoryId,
        stock: 4,
        images: [],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.rating).toBeNull();
    expect(res.body.data.reviewCount).toBe(0);
  });

  it('[CRITICAL] `rating` و`reviewCount` في التعديل يُتجاهلان', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
       VALUES ($1, '', 9000, $2, $3, 2) RETURNING id`,
      [`منتج تدقيق تقييم ${Date.now()}`, catalog.categoryId, catalog.subcategoryId],
    );
    const id = rows[0]!.id;

    const res = await api
      .patch(`/api/admin/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 4.9, reviewCount: 99, stock: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBe(5);
    expect(res.body.data.rating).toBeNull();
    expect(res.body.data.reviewCount).toBe(0);

    const row = await db.query<{ rating: string | null; review_count: number }>(
      'SELECT rating, review_count FROM products WHERE id = $1',
      [id],
    );
    expect(row.rows[0]!.rating).toBeNull();
    expect(row.rows[0]!.review_count).toBe(0);
  });
});
