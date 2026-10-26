import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, seedTestCatalog } from './helpers.js';

/**
 * دورة حياة التعطيل والتفعيل في لوحة التحكم.
 *
 * المسار الذي فشل سابقاً: `adminCategorySchema` و`adminGovernorateSchema`
 * لم يحملا `isActive`، فكان `PATCH` المتوافق يجرد الحقل وينجح بصمت — تبدو
 * الشاشة نجحت والتغيير لم يصل قط. وتشمل هذه المجموعة أيضاً التزام
 * `listGovernorates` بإظهار المعطَّلة مع النشطة (المسؤول يحتاج رؤيتها معاً).
 */
describe('لوحة التحكم — تعطيل/تفعيل قسم ومحافظة', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let categoryId: string;
  let governorateId: string;

  beforeAll(async () => {
    await purgeTestUsers();
    adminToken = await createAdminUser();
    catalog = await seedTestCatalog();

    const category = await api
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `قسم دورة حياة ${Date.now()}` })
      .expect(201);
    categoryId = category.body.data.id;

    const governorate = await api
      .post('/api/admin/governorates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `محافظة دورة حياة ${Date.now()}`, deliveryFee: 5000 })
      .expect(201);
    governorateId = governorate.body.data.id;
  });

  afterAll(async () => {
    // تنظيف من القاع: لا تبعيات فوق أيٍّ منهما.
    await db.query('DELETE FROM governorates WHERE id = $1', [governorateId]);
    await db.query('DELETE FROM subcategories WHERE category_id = $1', [categoryId]);
    await db.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    await purgeTestUsers();
  });

  it('التعطيل عبر تعديل القسم يصل إلى القاعدة والقائمة تظهره معطّلاً', async () => {
    const res = await api
      .patch(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);
    // صفّ التعديل يعود خاماً باصطلاح القاعدة (is_active)، والقائمة تعود
    // باصطلاح camelCase (isActive) — الاصطلاحان مقصودان ومعرّفان في الطرفين.
    expect(res.body.data.is_active).toBe(false);

    const list = await api
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = list.body.data.items.find(
      (entry: { id: string }) => entry.id === categoryId,
    );
    expect(row).toBeTruthy();
    expect(row.isActive).toBe(false);
  });

  it('إعادة التفعيل تعيده إلى النشطة', async () => {
    await api
      .patch(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);

    const list = await api
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = list.body.data.items.find(
      (entry: { id: string }) => entry.id === categoryId,
    );
    expect(row.isActive).toBe(true);
  });

  it('تعطيل قسم فرعي يُدرك بإعادة القراءة', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO subcategories (category_id, name) VALUES ($1, $2) RETURNING id`,
      [categoryId, `فرعي دورة حياة ${Date.now()}`],
    );
    const subId = rows[0]!.id;

    const updated = await api
      .patch(`/api/admin/subcategories/${subId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);
    expect(updated.body.data.isActive).toBe(false);

    const list = await api
      .get('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const category = list.body.data.items.find(
      (entry: { id: string }) => entry.id === categoryId,
    );
    // القسم الفرعي المعطَّل يبقى ظاهراً للأدمن في قائمة القسم مع
    // isActive: false — حتى يتسنّى للمشرف رؤيته وإعادة تفعيله.
    const disabled = category.subcategories.find(
      (entry: { id: string; isActive: boolean }) => entry.id === subId,
    );
    expect(disabled).toBeDefined();
    expect(disabled.isActive).toBe(false);

    await db.query('DELETE FROM subcategories WHERE id = $1', [subId]);
  });

  it('قائمة المحافظات تُظهر المعطَّلة مع النشطة', async () => {
    await api
      .patch(`/api/admin/governorates/${governorateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const list = await api
      .get('/api/admin/governorates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const inactive = list.body.data.items.find(
      (entry: { id: string }) => entry.id === governorateId,
    );
    expect(inactive).toBeTruthy();
    expect(inactive.isActive).toBe(false);

    // والنشطة ما تزال هناك — التعطيل لم يُخفِ القائمة.
    const active = list.body.data.items.find(
      (entry: { id: string }) => entry.id === catalog.governorateId,
    );
    expect(active).toBeTruthy();
    expect(active.isActive).toBe(true);
  });

  it('تعطيل محافظة ثم إعادة تفعيلها يشملان رحلة القرار الكاملة', async () => {
    await api
      .patch(`/api/admin/governorates/${governorateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);

    const list = await api
      .get('/api/admin/governorates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const row = list.body.data.items.find(
      (entry: { id: string }) => entry.id === governorateId,
    );
    expect(row.isActive).toBe(true);
  });
});