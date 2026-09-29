import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { franchiseRepo } from '../src/repositories/franchisesRepo.js';
import { api, createAdminUser, seedTestCatalog } from './helpers.js';

/**
 * حذف أنمي مرتبط بمنتجات (قرار المالك، STEP 64 §6.2).
 *
 * [CRITICAL] ما يجب أن يبقى بعد الحذف — كل واحدٍ منها حالةٌ هنا:
 * المنتجات (النشطة والموقوفة)، وصورها، وأقسامها، وارتباطاتها بأنميات أخرى.
 * وما يجب أن يزول: صفّ الأنمي وارتباطاته وحدها، ومطابقة البحث باسمه.
 * والعملية كلٌّ أو لا شيء: عطلٌ بين فكّ الارتباط والحذف يُرجع الاثنين.
 */
describe('حذف الأنمي ولو ارتبط بمنتجات — المنتجات باقية', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  const STAMP = Date.now();
  const created: { franchises: string[]; products: string[] } = { franchises: [], products: [] };
  const auth = () => ({ Authorization: `Bearer ${adminToken}` });

  async function createFranchise(name: string) {
    const res = await api.post('/api/admin/franchises').set(auth()).send({ name, altNames: [] }).expect(201);
    created.franchises.push(res.body.data.id);
    return res.body.data.id as string;
  }

  async function createProduct(name: string, franchiseIds: string[], isActive = true) {
    const res = await api
      .post('/api/admin/products')
      .set(auth())
      .send({
        nameAr: name,
        descriptionAr: 'وصف',
        nameCkb: name,
        descriptionCkb: 'وەسف',
        price: 9000,
        categoryId: catalog.categoryId,
        subcategoryId: catalog.subcategoryId,
        stock: 3,
        images: [`/uploads/product/2026/09/${STAMP}-${created.products.length}.png`],
        options: [],
        franchiseIds,
      })
      .expect(201);
    const id = res.body.data.id as string;
    created.products.push(id);
    if (!isActive) await db.query('UPDATE products SET is_active = FALSE WHERE id = $1', [id]);
    return id;
  }

  async function snapshot(productId: string) {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.name_ckb, p.price, p.stock, p.category_id, p.subcategory_id, p.is_active,
              (SELECT array_agg(url ORDER BY sort_order) FROM product_images WHERE product_id = p.id) AS images
         FROM products p WHERE p.id = $1`,
      [productId],
    );
    return rows[0];
  }

  const linksOf = async (franchiseId: string) =>
    Number(
      (await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM product_franchises WHERE franchise_id = $1', [franchiseId]))
        .rows[0]!.n,
    );

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await db.query('DELETE FROM product_franchises WHERE product_id = ANY($1::uuid[])', [created.products]);
    await db.query('DELETE FROM product_images WHERE product_id = ANY($1::uuid[])', [created.products]);
    await db.query('DELETE FROM products WHERE id = ANY($1::uuid[])', [created.products]);
    await db.query('DELETE FROM franchises WHERE id = ANY($1::uuid[])', [created.franchises]);
  });

  it('usage counts active AND inactive linked products (the list counts active only)', async () => {
    const anime = await createFranchise(`قاتل الشياطين حذف ${STAMP}-usage`);
    await createProduct(`منتج نشط ${STAMP}-u1`, [anime]);
    await createProduct(`منتج موقوف ${STAMP}-u2`, [anime], false);
    const usage = await api.get(`/api/admin/franchises/${anime}/usage`).set(auth()).expect(200);
    expect(usage.body.data).toEqual({ id: anime, productCount: 2 });
    const list = await api.get('/api/admin/franchises').set(auth()).expect(200);
    expect(list.body.data.items.find((f: { id: string }) => f.id === anime).productCount).toBe(1);
  });

  it('[CRITICAL] deleting a used anime unlinks it and deletes it — products, images, categories and other links stay', async () => {
    const anime = await createFranchise(`قاتل الشياطين حذف ${STAMP}`);
    const other = await createFranchise(`ون بيس باقٍ ${STAMP}`);
    const active = await createProduct(`قلادة ${STAMP}`, [anime, other]);
    const inactive = await createProduct(`كوب ${STAMP}`, [anime], false);
    const untouched = await createProduct(`دبوس ${STAMP}`, [other]);
    const before = await Promise.all([active, inactive, untouched].map(snapshot));

    const res = await api.delete(`/api/admin/franchises/${anime}`).set(auth()).expect(200);
    expect(res.body.data).toEqual({ id: anime, unlinkedProducts: 2 });

    expect((await db.query('SELECT 1 FROM franchises WHERE id = $1', [anime])).rowCount).toBe(0);
    expect(await linksOf(anime)).toBe(0);
    // الأنمي الآخر محتفظٌ بمنتجيه، والمنتجات كما كانت حرفياً (صور، قسم، حالة).
    expect(await linksOf(other)).toBe(2);
    expect(await Promise.all([active, inactive, untouched].map(snapshot))).toEqual(before);

    // سجلّ النشاط يحمل الاسم والعدد.
    const audit = await db.query<{ details: Record<string, unknown> }>(
      `SELECT details FROM admin_audit_log WHERE action = 'franchise.deleted' AND target_id = $1`,
      [anime],
    );
    expect(audit.rows[0]!.details).toEqual({ name: `قاتل الشياطين حذف ${STAMP}`, unlinkedProducts: 2 });
  });

  it('search by the deleted anime name no longer matches its former products; the other anime still does', async () => {
    const anime = await createFranchise(`Kimetsu Delete ${STAMP}`);
    const other = await createFranchise(`Naruto Keep ${STAMP}`);
    const product = await createProduct(`وشاح ${STAMP}`, [anime, other]);
    const search = async (q: string) =>
      (
        await api.get(`/api/catalog/products/search?q=${encodeURIComponent(q)}&limit=50`).expect(200)
      ).body.data.items.map((p: { id: string }) => p.id);
    expect(await search(`Kimetsu Delete ${STAMP}`)).toContain(product);

    await api.delete(`/api/admin/franchises/${anime}`).set(auth()).expect(200);
    expect(await search(`Kimetsu Delete ${STAMP}`)).not.toContain(product);
    expect(await search(`Naruto Keep ${STAMP}`)).toContain(product);
  });

  it('[CRITICAL] transactional — a failure after unlinking rolls the unlink back; nothing is half-deleted', async () => {
    const anime = await createFranchise(`أنمي معاملة ${STAMP}`);
    const product = await createProduct(`ميدالية ${STAMP}`, [anime]);
    vi.spyOn(franchiseRepo, 'remove').mockRejectedValueOnce(new Error('injected: franchise delete'));

    const res = await api.delete(`/api/admin/franchises/${anime}`).set(auth());
    expect(res.status).toBe(500);
    expect((await db.query('SELECT 1 FROM franchises WHERE id = $1', [anime])).rowCount).toBe(1);
    expect(await linksOf(anime)).toBe(1);
    expect((await snapshot(product))?.id).toBe(product);
  });

  it('an unknown anime is 404 for both usage and delete; an unused anime deletes with 0 unlinked', async () => {
    const missing = '00000000-0000-4000-8000-00000000abcd';
    expect((await api.get(`/api/admin/franchises/${missing}/usage`).set(auth())).status).toBe(404);
    expect((await api.delete(`/api/admin/franchises/${missing}`).set(auth())).status).toBe(404);
    const lonely = await createFranchise(`بلا منتجات ${STAMP}`);
    const res = await api.delete(`/api/admin/franchises/${lonely}`).set(auth()).expect(200);
    expect(res.body.data.unlinkedProducts).toBe(0);
  });
});
