import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, createSubAdmin, purgeSubAdmins, registerAndLogin } from './helpers.js';

/**
 * ترتيب الأقسام بالسحب (2026-11-03) — `PUT /admin/categories/order` و
 * `PUT /admin/categories/:id/subcategories/order`.
 *
 * العقد: القائمة كاملةً بترتيبها الجديد؛ الخادم يطابقها بالمجموعة الفعلية تحت
 * قفل ويحفظها في جملةٍ واحدة. لا ينقل فرعياً بين الأقسام، ولا يمسّ المعرّفات
 * ولا روابط المنتجات. المتجر والتطبيق يقرآن الترتيب نفسه من `/catalog`.
 */
const tag = `ترتيب ${Date.now()}`;
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe('ترتيب الأقسام بالسحب', () => {
  let admin: string;
  let originalOrder: string[];
  const cats: string[] = [];
  const subsA: string[] = [];
  const subsB: string[] = [];
  let productId: string;

  const A = () => ({ Authorization: `Bearer ${admin}` });

  async function adminCategories() {
    const res = await api.get('/api/admin/categories').set(A()).expect(200);
    return res.body.data.items as Array<{ id: string; isActive: boolean; subcategories: Array<{ id: string }> }>;
  }

  beforeAll(async () => {
    admin = await createAdminUser();
    originalOrder = (await adminCategories()).map((c) => c.id);
    for (const n of [1, 2, 3]) {
      const res = await api.post('/api/admin/categories').set(A()).send({ name: `قسم ${tag} ${n}` }).expect(201);
      cats.push(res.body.data.id);
    }
    for (const [parent, list] of [[cats[0]!, subsA], [cats[1]!, subsB]] as const) {
      for (const n of [1, 2, 3]) {
        const res = await api
          .post('/api/admin/subcategories')
          .set(A())
          .send({ categoryId: parent, name: `فرعي ${tag} ${n}` })
          .expect(201);
        list.push(res.body.data.id);
      }
    }
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock)
       VALUES ($1, 'وصف', 1000, $2, $3, 1) RETURNING id`,
      [`منتج ${tag}`, cats[0], subsA[1]],
    );
    productId = rows[0]!.id;
  });

  afterAll(async () => {
    await db.query('DELETE FROM products WHERE id = $1', [productId]);
    await db.query('DELETE FROM subcategories WHERE id = ANY($1::uuid[])', [[...subsA, ...subsB]]);
    await db.query('DELETE FROM categories WHERE id = ANY($1::uuid[])', [cats]);
    const rest = (await adminCategories()).map((c) => c.id);
    if (rest.length === originalOrder.length) {
      await api.put('/api/admin/categories/order').set(A()).send({ ids: originalOrder });
    }
    await purgeSubAdmins();
  });

  it('القسم الجديد يُلحق بآخر القائمة', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    expect(ids.slice(-3)).toEqual(cats);
    const a = (await adminCategories()).find((c) => c.id === cats[0])!;
    expect(a.subcategories.map((s) => s.id)).toEqual(subsA);
  });

  it('[CRITICAL] الرئيسية تُرتَّب، وتبقى بعد إعادة القراءة، والمتجر والتطبيق يريان الترتيب نفسه', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    const reordered = [...ids].reverse();
    const res = await api.put('/api/admin/categories/order').set(A()).send({ ids: reordered }).expect(200);
    expect(res.body.data.items.map((c: { id: string }) => c.id)).toEqual(reordered);

    expect((await adminCategories()).map((c) => c.id)).toEqual(reordered);
    const activeOrder = (await adminCategories()).filter((c) => c.isActive).map((c) => c.id);
    // `/catalog/categories` يخدم المتجر والتطبيق معاً، و`/catalog/home` شاشة التطبيق الرئيسية.
    for (const lang of ['ar', 'ckb']) {
      const pub = await api.get('/api/catalog/categories').set('Accept-Language', lang).expect(200);
      expect(pub.body.data.items.map((c: { id: string }) => c.id)).toEqual(activeOrder);
      const home = await api.get('/api/catalog/home').set('Accept-Language', lang).expect(200);
      expect(home.body.data.categories.map((c: { id: string }) => c.id)).toEqual(activeOrder);
    }

    const { rows } = await db.query<{ sort_order: number }>(
      'SELECT sort_order FROM categories WHERE id = ANY($1::uuid[]) ORDER BY sort_order',
      [reordered],
    );
    expect(rows.map((r) => r.sort_order)).toEqual(reordered.map((_, i) => i + 1));
  });

  it('نقل قسمٍ رئيسي لا يمسّ فرعيّاته ولا منتجاته', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    const moved = [cats[0]!, ...ids.filter((id) => id !== cats[0])];
    await api.put('/api/admin/categories/order').set(A()).send({ ids: moved }).expect(200);
    const a = (await adminCategories()).find((c) => c.id === cats[0])!;
    expect(a.subcategories.map((s) => s.id)).toEqual(subsA);
    const { rows } = await db.query('SELECT category_id, subcategory_id FROM products WHERE id = $1', [productId]);
    expect(rows[0]).toEqual({ category_id: cats[0], subcategory_id: subsA[1] });
  });

  it('فرعيّات قسمٍ تُرتَّب وحدها — القسم الآخر كما هو', async () => {
    const reordered = [subsA[2]!, subsA[0]!, subsA[1]!];
    const res = await api
      .put(`/api/admin/categories/${cats[0]}/subcategories/order`)
      .set(A())
      .send({ ids: reordered })
      .expect(200);
    expect(res.body.data.subcategories.map((s: { id: string }) => s.id)).toEqual(reordered);

    const all = await adminCategories();
    expect(all.find((c) => c.id === cats[0])!.subcategories.map((s) => s.id)).toEqual(reordered);
    expect(all.find((c) => c.id === cats[1])!.subcategories.map((s) => s.id)).toEqual(subsB);

    const pub = await api.get('/api/catalog/categories').expect(200);
    const pubA = pub.body.data.items.find((c: { id: string }) => c.id === cats[0]);
    expect(pubA.subcategories.map((s: { id: string }) => s.id)).toEqual(reordered);

    const { rows } = await db.query<{ category_id: string }>(
      'SELECT DISTINCT category_id FROM subcategories WHERE id = ANY($1::uuid[])',
      [reordered],
    );
    expect(rows).toEqual([{ category_id: cats[0] }]);
  });

  it('فرعيٌّ من قسمٍ آخر مرفوض ولا يُنقل', async () => {
    const res = await api
      .put(`/api/admin/categories/${cats[0]}/subcategories/order`)
      .set(A())
      .send({ ids: [subsA[0], subsA[1], subsB[0]] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ORDER_FOREIGN_ID');
    const { rows } = await db.query('SELECT category_id FROM subcategories WHERE id = $1', [subsB[0]]);
    expect(rows[0]).toEqual({ category_id: cats[1] });
  });

  it('القائمة الناقصة 409، والمعرّف المجهول والمكرّر والفارغ 400، والقسم المجهول 404', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    const before = ids;

    const missing = await api.put('/api/admin/categories/order').set(A()).send({ ids: ids.slice(1) });
    expect(missing.status).toBe(409);
    expect(missing.body.error.code).toBe('ORDER_STALE');

    const unknown = await api.put('/api/admin/categories/order').set(A()).send({ ids: [...ids, UNKNOWN] });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('ORDER_FOREIGN_ID');

    const duplicate = await api.put('/api/admin/categories/order').set(A()).send({ ids: [...ids, ids[0]] });
    expect(duplicate.status).toBe(400);
    await api.put('/api/admin/categories/order').set(A()).send({ ids: [] }).expect(400);
    await api.put('/api/admin/categories/order').set(A()).send({ ids: ['x'] }).expect(400);
    await api.put('/api/admin/categories/order').set(A()).send({}).expect(400);

    await api
      .put(`/api/admin/categories/${UNKNOWN}/subcategories/order`)
      .set(A())
      .send({ ids: subsA })
      .expect(404);

    expect((await adminCategories()).map((c) => c.id)).toEqual(before);
  });

  it('حفظان متزامنان يتسلسلان: يفوز أحدهما كاملاً، بلا ترتيبٍ مكرّر', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    const first = [...ids].reverse();
    const second = [...ids.slice(1), ids[0]!];
    const [r1, r2] = await Promise.all([
      api.put('/api/admin/categories/order').set(A()).send({ ids: first }),
      api.put('/api/admin/categories/order').set(A()).send({ ids: second }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const final = (await adminCategories()).map((c) => c.id);
    expect([JSON.stringify(first), JSON.stringify(second)]).toContain(JSON.stringify(final));
    const { rows } = await db.query<{ n: string; d: string }>(
      'SELECT COUNT(*)::text AS n, COUNT(DISTINCT sort_order)::text AS d FROM categories',
    );
    expect(rows[0]!.n).toBe(rows[0]!.d);
  });

  it('تكرار الطلب نفسه لا يغيّر شيئاً', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    await api.put('/api/admin/categories/order').set(A()).send({ ids }).expect(200);
    await api.put('/api/admin/categories/order').set(A()).send({ ids }).expect(200);
    expect((await adminCategories()).map((c) => c.id)).toEqual(ids);
  });

  it('[CRITICAL] غير المخوَّل لا يرتّب: مجهول 401، زبون 403، مسؤول بلا «الأقسام» 403', async () => {
    const ids = (await adminCategories()).map((c) => c.id);
    const reordered = [...ids].reverse();
    const subPath = `/api/admin/categories/${cats[0]}/subcategories/order`;

    await api.put('/api/admin/categories/order').send({ ids: reordered }).expect(401);
    await api.put(subPath).send({ ids: subsA }).expect(401);

    const customer = await registerAndLogin();
    const asCustomer = { Authorization: `Bearer ${customer.token}` };
    await api.put('/api/admin/categories/order').set(asCustomer).send({ ids: reordered }).expect(403);
    await api.put(subPath).set(asCustomer).send({ ids: subsA }).expect(403);

    const products = await createSubAdmin(['products'], { suffix: 9201 });
    const asProducts = { Authorization: `Bearer ${products.token}` };
    await api.put('/api/admin/categories/order').set(asProducts).send({ ids: reordered }).expect(403);
    await api.put(subPath).set(asProducts).send({ ids: subsA }).expect(403);

    expect((await adminCategories()).map((c) => c.id)).toEqual(ids);

    const categories = await createSubAdmin(['categories'], { suffix: 9202 });
    await api
      .put('/api/admin/categories/order')
      .set({ Authorization: `Bearer ${categories.token}` })
      .send({ ids: reordered })
      .expect(200);
  });
});
