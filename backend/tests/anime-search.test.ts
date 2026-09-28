import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

/**
 * البحث بالأنمي.
 *
 * الأنمي بُعد تصنيف مستقل عن القسم والقسم الفرعي: منتج واحد قد يحمل
 * الثلاثة معاً، والبحث باسم الأنمي يجب أن يجمع منتجاته من كل الأقسام.
 * قبل هذه الدفعة كان البحث يقرأ اسم المنتج وحده، فبيانات `franchises`
 * موجودة ولا سبيل للعميل إليها.
 */
describe('البحث بالأنمي', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let franchiseId: string;
  let otherFranchiseId: string;
  const tagged: string[] = [];
  // أسماء فريدة لكل تشغيل: اسم الامتياز يقيّده فهرس فريد، والامتياز المرتبط
  // بمنتجات لا يُحذف (وهو سلوك مقصود)، فلا سبيل لإعادة استعمال اسم سابق.
  const STAMP = Date.now();
  const DEMON = `Demon Slayer Test ${STAMP}`;
  const DEMON_AR = `قاتل الشياطين اختبار ${STAMP}`;
  const ONE_PIECE = `One Piece Test ${STAMP}`;
  const ONE_PIECE_AR = `ون بيس اختبار ${STAMP}`;
  const NECKLACE = `قلادة فضية اختبار ${STAMP}`;
  const MUG = `كوب سيراميك اختبار ${STAMP}`;
  const PIN = `دبوس معدني اختبار ${STAMP}`;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();

    // امتياز باسم إنجليزي ومرادفين عربيين — هذا هو جوهر الحالة.
    const created = await api
      .post('/api/admin/franchises')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: DEMON,
        altNames: [DEMON_AR, `Kimetsu Test ${STAMP}`],
      })
      .expect(201);
    franchiseId = created.body.data.id;
    expect(created.body.data.altNames).toEqual([DEMON_AR, `Kimetsu Test ${STAMP}`]);

    const other = await api
      .post('/api/admin/franchises')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: ONE_PIECE, altNames: [ONE_PIECE_AR] })
      .expect(201);
    otherFranchiseId = other.body.data.id;

    // منتجان في قسمين مختلفين لا يحمل اسمهما أي أثر للأنمي — لو رجع أحدهما
    // في نتائج البحث فذلك بفضل الربط لا بفضل تطابق نصي في الاسم.
    for (const [name, subcategoryId] of [
      [NECKLACE, catalog.subcategoryId],
      [MUG, null],
    ] as const) {
      const product = await api
        .post('/api/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          nameAr: name,
          descriptionAr: 'وصف',
          nameCkb: name,
          descriptionCkb: 'وەسف',
          price: 9000,
          categoryId: catalog.categoryId,
          subcategoryId,
          stock: 5,
          images: [],
          options: [],
          franchiseIds: [franchiseId],
        })
        .expect(201);
      tagged.push(product.body.data.id);
    }

    // منتج مرتبط بأنمي آخر — حارس ضد بحث يعيد كل شيء.
    await api
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nameAr: PIN,
        descriptionAr: 'وصف',
        nameCkb: PIN,
        descriptionCkb: 'وەسف',
        price: 3000,
        categoryId: catalog.categoryId,
        stock: 5,
        images: [],
        options: [],
        franchiseIds: [otherFranchiseId],
      })
      .expect(201);
  });

  async function search(query: string) {
    const res = await api
      .get(`/api/catalog/products/search?q=${encodeURIComponent(query)}&limit=50`)
      .expect(200);
    return res.body.data.items as { id: string; name: string }[];
  }

  it('البحث بالاسم الإنجليزي للأنمي يعيد منتجاته من أقسام مختلفة', async () => {
    const items = await search(DEMON);
    const ids = items.map((item) => item.id);
    for (const id of tagged) expect(ids).toContain(id);
  });

  it('البحث بالمرادف العربي يعيد النتائج نفسها', async () => {
    const items = await search(DEMON_AR);
    const ids = items.map((item) => item.id);
    for (const id of tagged) expect(ids).toContain(id);
  });

  it('البحث بأنمي آخر لا يعيد منتجات هذا الأنمي', async () => {
    const items = await search(ONE_PIECE_AR);
    const ids = items.map((item) => item.id);
    for (const id of tagged) expect(ids).not.toContain(id);
    expect(items.some((item) => item.name === PIN)).toBe(true);
  });

  it('البحث باسم المنتج ما زال يعمل مستقلاً عن الأنمي', async () => {
    const items = await search(NECKLACE);
    expect(items.some((item) => item.name === NECKLACE)).toBe(true);
  });

  it('العدّ الإجمالي يطابق النتائج المعادة لا نتائج الاسم وحده', async () => {
    const res = await api
      .get(`/api/catalog/products/search?q=${encodeURIComponent(DEMON)}&limit=50`)
      .expect(200);
    expect(res.body.data.total).toBeGreaterThanOrEqual(tagged.length);
    expect(res.body.data.total).toBe(res.body.data.items.length);
  });

  it('إيقاف الأنمي يُخرج منتجاته من نتائج البحث باسمه', async () => {
    await api
      .patch(`/api/admin/franchises/${franchiseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false })
      .expect(200);

    const items = await search(DEMON);
    const ids = items.map((item) => item.id);
    for (const id of tagged) expect(ids).not.toContain(id);

    // ما زال المنتج نفسه قابلاً للعثور عليه باسمه — الإيقاف يخصّ الأنمي.
    const byName = await search(NECKLACE);
    expect(byName.some((item) => item.name === NECKLACE)).toBe(true);

    await api
      .patch(`/api/admin/franchises/${franchiseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: true })
      .expect(200);
  });

  it('الأنمي لا يغيّر شجرة الأقسام — المنتج يبقى في قسمه', async () => {
    const { rows } = await db.query<{ category_id: string; subcategory_id: string | null }>(
      'SELECT category_id, subcategory_id FROM products WHERE id = $1',
      [tagged[0]],
    );
    expect(rows[0]!.category_id).toBe(catalog.categoryId);
    expect(rows[0]!.subcategory_id).toBe(catalog.subcategoryId);
  });

  it('المرادفات المكرّرة والفارغة تُنظَّف عند الحفظ', async () => {
    const res = await api
      .patch(`/api/admin/franchises/${otherFranchiseId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ altNames: [ONE_PIECE_AR, ONE_PIECE_AR, `  قطعة واحدة ${STAMP}  `] })
      .expect(200);
    expect(res.body.data.altNames).toEqual([ONE_PIECE_AR, `قطعة واحدة ${STAMP}`]);
  });

  it('غير المسؤول لا يعدّل الأنمي', async () => {
    const anonymous = await api
      .patch(`/api/admin/franchises/${otherFranchiseId}`)
      .send({ name: 'محاولة' });
    expect(anonymous.status).toBe(401);
  });
});
