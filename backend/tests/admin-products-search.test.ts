// بحث المنتجات في لوحة التحكم: بالاسم، على الخادم، مع الأحرف الخاصة.
//
// كانت قائمة `GET /api/admin/products` بلا أي معامل بحث؛ المسؤول يقلّب
// الصفحات يدوياً ليجد منتجاً. البحث العام `/catalog/products/search` لا
// يصلح بديلاً: يستثني المنتجات غير النشطة ولا يهرّب `%`/`_`.

import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

describe('بحث المنتجات للمسؤول', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  const marker = randomUUID().slice(0, 8);

  async function insertProduct(name: string, isActive = true) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_active)
       VALUES ($1, '', 5000, $2, $3, 3, $4) RETURNING id`,
      [name, catalog.categoryId, catalog.subcategoryId, isActive],
    );
    return rows[0]!.id;
  }

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    await insertProduct(`دفتر ${marker} ناروتو`);
    await insertProduct(`قلم ${marker} لوفي`, false);
    await insertProduct(`حقيبة 100% ${marker}`);
  });

  const search = (q: string) =>
    api.get('/api/admin/products').set('Authorization', `Bearer ${adminToken}`).query({ q, limit: 50 });

  it('جزء من الاسم يكفي، والنتيجة تشمل غير النشط', async () => {
    const res = await search(marker).expect(200);
    const names = (res.body.data.items as { name: string }[]).map((p) => p.name);
    expect(names).toContain(`دفتر ${marker} ناروتو`);
    expect(names).toContain(`قلم ${marker} لوفي`);
    expect(names).toContain(`حقيبة 100% ${marker}`);
  });

  it('`%` و`_` في النصّ حرفان لا أنماط', async () => {
    const res = await search(`100% ${marker}`).expect(200);
    const names = (res.body.data.items as { name: string }[]).map((p) => p.name);
    expect(names).toEqual([`حقيبة 100% ${marker}`]);

    const wildcard = await search('%').expect(200);
    // لو كانت `%` نمطاً لعادت كل المنتجات؛ حرفاً حرفياً لا يطابق إلا ما يحويها.
    for (const p of wildcard.body.data.items as { name: string }[]) {
      expect(p.name).toContain('%');
    }
  });

  it('كلمة لا يحويها اسمٌ تُعيد قائمة فارغة', async () => {
    const res = await search(`لا-وجود-${marker}`).expect(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.total).toBe(0);
  });
});
