import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { CATALOG_UNPRICED_HEADER } from '../src/controllers/catalogController.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] «قريباً — السعر يُعلن لاحقاً»: منتجٌ يُعلَن بلا سعر (STEP 69، هجرة 084).
 *
 * ═══ القرار (المالك، 2026-10-24) ═══
 * - السعر غير المعلن `NULL` في القاعدة — لا صفر ولا قيمةٌ نائبة. الصفر ليس «بلا سعر».
 * - المنتج بلا سعر يُعرض ولا يُشترى: لا عربة، ولا معاينة، ولا طلب.
 * - التطبيقات المثبَّتة تقرأ `price ?? 0` (`product.dart`)، فلو رأت منتجاً بلا سعر
 *   لعرضته «٠ د.ع». لذلك لا يظهر في ردود الكتالوج إلا لمن يطلبه صراحةً بترويسة
 *   `X-OG-Unpriced: 1` (الموقع)؛ لوحة التحكم تراه دائماً.
 * - تعيين السعر لاحقاً تعديلٌ للمنتج نفسه: المعرّف والمحتوى والصور كما هي.
 */
describe('[CRITICAL] منتجٌ بلا سعر بعد: يُعرض لمن يطلبه، ولا يُشترى، ويُسعَّر لاحقاً', () => {
  const TAG = `UNPRICED ${Date.now()}`;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const optIn = { [CATALOG_UNPRICED_HEADER]: '1' };

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    const owned = `(SELECT id FROM products WHERE name LIKE '${TAG}%')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM favorites WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM restock_subscriptions WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM notifications WHERE product_id IN ${owned}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE '${TAG}%'`);
  });

  function createProduct(name: string, overrides: Record<string, unknown> = {}) {
    return api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} ${name}`,
        descriptionAr: 'وصف',
        nameCkb: `${TAG} ${name}`,
        descriptionCkb: 'وەسف',
        price: null,
        categoryId: catalog.categoryId,
        stock: 5,
        images: ['/uploads/coming-soon.webp'],
        options: [],
        isSelected: true,
        ...overrides,
      });
  }

  async function dbPrice(id: string) {
    const { rows } = await db.query<{ price: string | null }>('SELECT price FROM products WHERE id = $1', [id]);
    return rows[0]!.price;
  }

  const ids = (body: { data: { items?: Array<{ id: string }> } }) => (body.data.items ?? []).map((p) => p.id);

  it('المسؤول يحفظ منتجاً بلا سعر: NULL في القاعدة و`price: null` في الرد — لا صفر', async () => {
    const res = await createProduct('حفظ').expect(201);
    expect(res.body.data.price).toBeNull();
    expect(await dbPrice(res.body.data.id)).toBeNull();

    const edit = await api.get(`/api/admin/products/${res.body.data.id}`).set(admin()).expect(200);
    expect(edit.body.data.price).toBeNull();
  });

  it('الأسعار غير الصالحة مرفوضة كما كانت، وغياب الحقل ليس «بلا سعر»', async () => {
    for (const price of [0, -1000, '4000', 1_000_000_001]) {
      const res = await createProduct(`سعر ${String(price)}`, { price });
      expect(res.status, String(price)).toBe(400);
    }
    const { price: _omit, ...withoutPrice } = {
      nameAr: `${TAG} بلا حقل`,
      descriptionAr: 'وصف',
      nameCkb: `${TAG} بلا حقل`,
      descriptionCkb: 'وەسف',
      price: undefined,
      categoryId: catalog.categoryId,
      stock: 1,
    };
    await api.post('/api/admin/products').set(admin()).send(withoutPrice).expect(400);
  });

  it('لا «سعر قبل الخصم» لمنتجٍ لم يُعلن سعره — في الإنشاء والتعديل وفي القاعدة', async () => {
    const create = await createProduct('سابق', { previousPrice: 9000 });
    expect(create.status).toBe(400);
    expect(create.body.error.code).toBe('INVALID_PREVIOUS_PRICE');

    const priced = await createProduct('سابق ٢', { price: 5000, previousPrice: 9000 }).expect(201);
    const unset = await api
      .patch(`/api/admin/products/${priced.body.data.id}`)
      .set(admin())
      .send({ price: null });
    expect(unset.status).toBe(400);
    expect(unset.body.error.code).toBe('INVALID_PREVIOUS_PRICE');
    expect(Number(await dbPrice(priced.body.data.id))).toBe(5000);

    await expect(
      db.query('UPDATE products SET price = NULL WHERE id = $1', [priced.body.data.id]),
    ).rejects.toMatchObject({ code: '23514', constraint: 'products_previous_price_needs_price' });
  });

  it('الكتالوج يخفيه عن التطبيق المثبَّت ويُظهره لمن يطلبه — بسعر null لا صفر', async () => {
    const res = await createProduct('كتالوج').expect(201);
    const id = res.body.data.id as string;

    const reads = [
      (h: Record<string, string>) => api.get('/api/catalog/products').query({ limit: 50 }).set(h),
      (h: Record<string, string>) => api.get('/api/catalog/products').query({ limit: 50, selected: 'true' }).set(h),
      (h: Record<string, string>) => api.get('/api/catalog/products').query({ limit: 50, categoryId: catalog.categoryId }).set(h),
      (h: Record<string, string>) => api.get('/api/catalog/products/search').query({ q: TAG, limit: 50 }).set(h),
    ];
    for (const read of reads) {
      expect(ids((await read({}).expect(200)).body)).not.toContain(id);
      const shown = (await read(optIn).expect(200)).body.data.items as Array<{ id: string; price: unknown }>;
      expect(shown.find((p) => p.id === id)?.price).toBeNull();
    }

    const home = (await api.get('/api/catalog/home').expect(200)).body.data;
    for (const list of [home.selectedProducts, home.offers, home.discover]) {
      expect((list as Array<{ id: string }>).map((p) => p.id)).not.toContain(id);
    }
    const homeOptIn = (await api.get('/api/catalog/home').set(optIn).expect(200)).body.data;
    expect((homeOptIn.selectedProducts as Array<{ id: string }>).map((p) => p.id)).toContain(id);

    await api.get(`/api/catalog/products/${id}`).expect(404);
    const detail = await api.get(`/api/catalog/products/${id}`).set(optIn).expect(200);
    expect(detail.body.data.price).toBeNull();
    expect(detail.body.data.stock).toBe(5);

    // قيمةٌ أخرى للترويسة ليست طلباً.
    await api.get(`/api/catalog/products/${id}`).set(CATALOG_UNPRICED_HEADER, 'true').expect(404);
  });

  it('المفضلة لا تعيده لتطبيقٍ لا يفهمه', async () => {
    const res = await createProduct('مفضلة').expect(201);
    const buyer = await registerAndLogin();
    const auth = { Authorization: `Bearer ${buyer.token}` };
    await api.post('/api/favorites').set(auth).send({ productId: res.body.data.id });
    const list = await api.get('/api/favorites').set(auth).expect(200);
    expect(JSON.stringify(list.body.data)).not.toContain(res.body.data.id);
  });

  it('لا يدخل العربة ولو طلبه العميل صراحةً', async () => {
    const res = await createProduct('عربة').expect(201);
    const buyer = await registerAndLogin();
    const add = await api
      .post('/api/cart')
      .set({ Authorization: `Bearer ${buyer.token}`, ...optIn })
      .send({ productId: res.body.data.id, quantity: 1 });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe('PRODUCT_NOT_PRICED');
    const { rows } = await db.query('SELECT 1 FROM cart_items WHERE product_id = $1', [res.body.data.id]);
    expect(rows).toHaveLength(0);
  });

  it('سعرٌ أُزيل بعد الإضافة إلى العربة: المعاينة تنبّه، والطلب يُرفض بلا أثر', async () => {
    const res = await createProduct('طلب', { price: 6000 }).expect(201);
    const id = res.body.data.id as string;
    const buyer = await registerAndLogin();
    const auth = { Authorization: `Bearer ${buyer.token}` };
    await api.post('/api/cart').set(auth).send({ productId: id, quantity: 2 }).expect(200);

    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ price: null }).expect(200);
    expect(await dbPrice(id)).toBeNull();

    const quote = await api
      .get('/api/orders/checkout-quote')
      .query({ governorateId: catalog.governorateId })
      .set(auth)
      .expect(200);
    expect(quote.body.data.issues).toContainEqual({ code: 'PRODUCT_NOT_PRICED', productId: id });
    expect(quote.body.data.productsTotal).toBe(0);

    const order = await api
      .post('/api/orders')
      .set(auth)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' });
    expect(order.status).toBe(409);
    expect(order.body.error.code).toBe('PRODUCT_NOT_PRICED');
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM orders o WHERE o.user_id = (SELECT id FROM users WHERE phone = $1)`,
      [buyer.phone],
    );
    expect(rows[0]!.n).toBe(0);
    const { rows: stock } = await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id]);
    expect(stock[0]!.stock).toBe(5);
  });

  it('السعر يُعيَّن لاحقاً على المنتج نفسه، فيظهر للجميع ويُشترى بسعره، والطلبات السابقة على سعرها', async () => {
    const res = await createProduct('لاحقاً').expect(201);
    const id = res.body.data.id as string;

    const priced = await api.patch(`/api/admin/products/${id}`).set(admin()).send({ price: 4000 }).expect(200);
    expect(priced.body.data.id).toBe(id);
    expect(priced.body.data.price).toBe(4000);
    expect(priced.body.data.nameAr).toBe(`${TAG} لاحقاً`);
    expect(priced.body.data.images).toEqual(['/uploads/coming-soon.webp']);

    const detail = await api.get(`/api/catalog/products/${id}`).expect(200);
    expect(detail.body.data.price).toBe(4000);

    const buyer = await registerAndLogin();
    const auth = { Authorization: `Bearer ${buyer.token}` };
    await api.post('/api/cart').set(auth).send({ productId: id, quantity: 1 }).expect(200);
    const order = await api
      .post('/api/orders')
      .set(auth)
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' })
      .expect(201);
    expect(order.body.data.productsTotal).toBe(4000);

    // إعادته «قريباً» لا تمسّ الطلب القائم: سعره لقطةٌ في order_items.
    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ price: null }).expect(200);
    const { rows } = await db.query<{ price: string; line_total: string }>(
      'SELECT price, line_total FROM order_items WHERE order_id = $1',
      [order.body.data.id],
    );
    expect(rows.map((r) => [Number(r.price), Number(r.line_total)])).toEqual([[4000, 4000]]);
  });

  it('قائمة اللوحة تعرضه دائماً، بلا ترويسة', async () => {
    const res = await createProduct('لوحة').expect(201);
    const list = await api.get('/api/admin/products').query({ limit: 50, q: TAG }).set(admin()).expect(200);
    const row = (list.body.data.items as Array<{ id: string; price: unknown }>).find((p) => p.id === res.body.data.id);
    expect(row?.price).toBeNull();
  });
});
