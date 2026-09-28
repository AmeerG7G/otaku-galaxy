import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

/**
 * التنقّل الإداري: قسم ← قسم فرعي ← منتجاته ← إضافة منتج.
 *
 * [CRITICAL] الترشيح على الخادم لا في المتصفح. قائمة مرقَّمة تُرشَّح بعد
 * جلبها تعرض منتجات الصفحة الحالية فقط، فيبدو القسم الفرعي فارغاً وفيه
 * عشرات المنتجات على الصفحة الثانية — وهو خطأ يُصدَّق لأنه يبدو معقولاً.
 */
describe('تصفّح الأقسام في لوحة التحكم', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let otherSubcategoryId: string;
  const inSubcategory: string[] = [];

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO subcategories (category_id, name)
       VALUES ($1, $2)
       ON CONFLICT (category_id, name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [catalog.categoryId, `قسم فرعي آخر ${Date.now()}`],
    );
    otherSubcategoryId = rows[0]!.id;

    // منتجات تكفي لتجاوز صفحة واحدة، فيثبت أن الترشيح ليس ترشيح صفحة.
    for (let i = 0; i < 15; i += 1) {
      const created = await api
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameAr: `منتج تنقّل ${Date.now()}-${i}`,
          descriptionAr: 'وصف',
          nameCkb: `بەرهەمی گەشت ${i}`,
          descriptionCkb: 'وەسف',
          price: 5000,
          categoryId: catalog.categoryId,
          subcategoryId: catalog.subcategoryId,
          stock: 3,
          images: [],
          options: [],
        })
        .expect(201);
      inSubcategory.push(created.body.data.id);
    }

    await api
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameAr: `منتج قسم آخر ${Date.now()}`,
        descriptionAr: 'وصف',
        nameCkb: 'بەرهەمی بەشێکی تر',
        descriptionCkb: 'وەسف',
        price: 5000,
        categoryId: catalog.categoryId,
        subcategoryId: otherSubcategoryId,
        stock: 3,
        images: [],
        options: [],
      })
      .expect(201);
  });

  async function listProducts(query: Record<string, string | number>) {
    const res = await api
      .get('/api/admin/products')
      .query(query)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    return res.body.data as {
      items: { id: string; subcategoryId: string | null }[];
      total: number;
    };
  }

  it('القسم يعرض أقسامه الفرعية', async () => {
    const res = await api
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const category = (res.body.data.items as {
      id: string;
      subcategories: { id: string }[];
    }[]).find((c) => c.id === catalog.categoryId);
    expect(category).toBeDefined();
    const ids = category!.subcategories.map((s) => s.id);
    expect(ids).toContain(catalog.subcategoryId);
    expect(ids).toContain(otherSubcategoryId);
  });

  it('الترشيح بالقسم الفرعي يعيد منتجاته وحدها', async () => {
    const data = await listProducts({ subcategoryId: catalog.subcategoryId, limit: 50 });
    for (const item of data.items) {
      expect(item.subcategoryId).toBe(catalog.subcategoryId);
    }
    for (const id of inSubcategory) {
      expect(data.items.map((i) => i.id)).toContain(id);
    }
  });

  it('العدّ الإجمالي يخصّ القسم الفرعي لا كل المنتجات', async () => {
    const scoped = await listProducts({ subcategoryId: otherSubcategoryId, limit: 50 });
    const all = await listProducts({ limit: 50 });
    expect(scoped.total).toBe(1);
    expect(all.total).toBeGreaterThan(scoped.total);
  });

  it('الترشيح يعمل عبر الصفحات لا داخل صفحة واحدة', async () => {
    const firstPage = await listProducts({
      subcategoryId: catalog.subcategoryId,
      page: 1,
      limit: 5,
    });
    const secondPage = await listProducts({
      subcategoryId: catalog.subcategoryId,
      page: 2,
      limit: 5,
    });
    expect(firstPage.items).toHaveLength(5);
    expect(secondPage.items).toHaveLength(5);
    expect(firstPage.total).toBeGreaterThanOrEqual(15);
    // لا تداخل بين الصفحتين.
    const overlap = firstPage.items
      .map((i) => i.id)
      .filter((id) => secondPage.items.some((i) => i.id === id));
    expect(overlap).toHaveLength(0);
    for (const item of [...firstPage.items, ...secondPage.items]) {
      expect(item.subcategoryId).toBe(catalog.subcategoryId);
    }
  });

  it('الترشيح بالقسم الرئيسي يشمل أقسامه الفرعية كلها', async () => {
    const data = await listProducts({ categoryId: catalog.categoryId, limit: 50 });
    const subcategoryIds = new Set(data.items.map((i) => i.subcategoryId));
    expect(subcategoryIds.has(catalog.subcategoryId)).toBe(true);
    expect(subcategoryIds.has(otherSubcategoryId)).toBe(true);
  });

  it('المنتج المُنشأ من قسم فرعي يُحفظ مرتبطاً به', async () => {
    const created = await api
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameAr: `منتج من القسم الفرعي ${Date.now()}`,
        descriptionAr: 'وصف',
        nameCkb: 'بەرهەمی ژێربەش',
        descriptionCkb: 'وەسف',
        price: 7000,
        categoryId: catalog.categoryId,
        subcategoryId: otherSubcategoryId,
        stock: 2,
        images: [],
        options: [],
      })
      .expect(201);

    expect(created.body.data.categoryId).toBe(catalog.categoryId);
    expect(created.body.data.subcategoryId).toBe(otherSubcategoryId);

    const scoped = await listProducts({ subcategoryId: otherSubcategoryId, limit: 50 });
    expect(scoped.items.map((i) => i.id)).toContain(created.body.data.id);
  });

  it('معرّف قسم غير صالح يُرفض بدل تجاهله', async () => {
    const res = await api
      .get('/api/admin/products')
      .query({ subcategoryId: 'not-a-uuid' })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
