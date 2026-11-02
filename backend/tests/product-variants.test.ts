import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * ألوان المنتج (087): لكل لونٍ صورته ومخزونه المستقل — العقد في
 * docs/staging/color-variants-contract.md.
 *
 * كل منتجٍ هنا يُنشأ عبر لوحة التحكم (`POST /api/admin/products`) ويُشترى عبر
 * المسارات الحقيقية (العربة ← الطلب ← قبول الإدارة)، فالقواعد تُختبر حيث تُطبَّق.
 */
const TAG = 'VARIANTS';
const IMG = (name: string) => `/uploads/product/2026/10/${name}.png`;

/**
 * حاجزٌ حتمي (نمط `order-concurrency-audit.test.ts`): جلسةٌ تمسك قفل صفّ المنتج
 * حتى تُطلق، فتصطفّ الطلبات المتنافسة خلفه فعلاً قبل أن تتسابق — لا توقيت.
 */
const openBarriers = new Set<{ release: () => Promise<void> }>();
async function holdProductLock(id: string) {
  const client: pg.PoolClient = await db.connect();
  await client.query('BEGIN');
  await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [id]);
  const barrier = {
    async release() {
      if (!openBarriers.has(barrier)) return;
      openBarriers.delete(barrier);
      await client.query('ROLLBACK');
      client.release();
    },
  };
  openBarriers.add(barrier);
  return barrier;
}
async function waitForBlocked(n: number) {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0]!.n === n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`لم تُحجب ${n} جلسات على القفل خلال المهلة`);
}
/** supertest كسول حتى `then` — يُطلق الطلب الآن ليصل إلى القفل قبل الحاجز. */
const eager = <T>(request: PromiseLike<T>): Promise<T> => Promise.resolve(request);

describe('ألوان المنتج — صورةٌ ومخزونٌ مستقلّان لكل لون', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(async () => {
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    const ours = `(SELECT id FROM products WHERE name LIKE '${TAG} %')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${ours}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${ours}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE '${TAG} %'`);
  });

  let counter = 0;
  /** منتجٌ بلونين: أحمر (٣) وأزرق (٥) — كلٌّ بصورته. */
  async function colouredProduct(overrides: { red?: number; blue?: number } = {}) {
    counter += 1;
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} قميص ${counter}`,
        descriptionAr: 'وصف',
        price: 10000,
        categoryId: catalog.categoryId,
        images: [IMG('main')],
        variants: [
          { colorName: 'أحمر', colorNameCkb: 'سوور', colorHex: '#ff0000', imageUrl: IMG('red'), stock: overrides.red ?? 3 },
          { colorName: 'أزرق', imageUrl: IMG('blue'), stock: overrides.blue ?? 5 },
        ],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const product = res.body.data;
    const red = product.variants.find((v: { colorNameAr: string }) => v.colorNameAr === 'أحمر');
    const blue = product.variants.find((v: { colorNameAr: string }) => v.colorNameAr === 'أزرق');
    return { product, red, blue };
  }

  async function legacyProduct(stock: number) {
    counter += 1;
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} قديم ${counter}`,
        descriptionAr: 'وصف',
        price: 5000,
        categoryId: catalog.categoryId,
        stock,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data as { id: string };
  }

  async function stocks(productId: string) {
    const { rows } = await db.query<{ color_name: string; stock: number }>(
      'SELECT color_name, stock FROM product_variants WHERE product_id = $1',
      [productId],
    );
    const { rows: product } = await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [
      productId,
    ]);
    return {
      product: Number(product[0]!.stock),
      ...Object.fromEntries(rows.map((row) => [row.color_name, Number(row.stock)])),
    } as Record<string, number>;
  }

  const ORDER_BODY = () => ({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07700000000',
  });

  function addToCart(token: string, body: Record<string, unknown>) {
    return api.post('/api/cart').set('Authorization', `Bearer ${token}`).send(body);
  }

  function submit(token: string) {
    return api.post('/api/orders').set('Authorization', `Bearer ${token}`).send(ORDER_BODY());
  }

  function setStatus(orderId: string, status: string) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(admin())
      .send(status === 'REJECTED' ? { status, note: 'سبب الرفض' } : { status });
  }

  // ═══ التمثيل ═══

  it('المنتج يُرجع ألوانه بمعرّفاتها وصورها ومخزونها، ومخزونه مجموعها', async () => {
    const { product, red, blue } = await colouredProduct();
    expect(product.stock).toBe(8);
    expect(red).toMatchObject({ colorHex: '#FF0000', imageUrl: IMG('red'), stock: 3, isActive: true, sortOrder: 0 });
    expect(blue).toMatchObject({ colorHex: null, imageUrl: IMG('blue'), stock: 5, sortOrder: 1, colorNameCkb: null });

    const ckb = await api.get(`/api/catalog/products/${product.id}`).set('Accept-Language', 'ckb').expect(200);
    const names = ckb.body.data.variants.map((v: { colorName: string }) => v.colorName);
    // الكردي حاضرٌ للأحمر، والأزرق بلا كردية فيُعرض عربيُّه.
    expect(names).toEqual(['سوور', 'أزرق']);
    expect(ckb.body.data.variants[0].colorNameAr).toBe('أحمر');
  });

  it('[CRITICAL] المعرض الموحّد: الصور العامة وصور الألوان مصدران مستقلّان بترتيبهما، وحفظ أحدهما لا يمسّ الآخر', async () => {
    const { product, red, blue } = await colouredProduct();
    // صورٌ عامة بترتيبٍ غير أبجدي، إحداها هي صورة الأزرق — تُحفظ كما أُرسلت ولا تُدمج.
    const images = [IMG('side'), IMG('blue'), IMG('back')];
    const saved = await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ images });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    const detail = await api.get(`/api/catalog/products/${product.id}`).expect(200);
    // يكفي العميلَ ليبني المعرض: الصور العامة بترتيب `sort_order` وكل لونٍ بمعرّفه وصورته بترتيبه.
    expect(detail.body.data.images).toEqual(images);
    expect(detail.body.data.variants.map((v: { id: string; imageUrl: string; sortOrder: number }) => [v.id, v.imageUrl, v.sortOrder])).toEqual([
      [red.id, IMG('red'), 0],
      [blue.id, IMG('blue'), 1],
    ]);

    // حفظ الألوان وحدها يُبقي الصور العامة، والعكس.
    const colours = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [
          { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 5, expectedStock: 5 },
          { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3, expectedStock: 3 },
        ],
      });
    expect(colours.status, JSON.stringify(colours.body)).toBe(200);
    expect(colours.body.data.images).toEqual(images);
    expect(colours.body.data.variants.map((v: { id: string }) => v.id)).toEqual([blue.id, red.id]);

    const general = await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ images: [IMG('back')] });
    expect(general.status).toBe(200);
    expect(general.body.data.variants).toEqual(colours.body.data.variants);
    const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM product_images WHERE product_id = $1', [product.id]);
    expect(rows[0]!.n).toBe(1);
  });

  it('منتجٌ بلا ألوان يبقى كما كان: `variants: []` ومخزونه يُكتب مباشرة', async () => {
    const legacy = await legacyProduct(4);
    const res = await api.get(`/api/catalog/products/${legacy.id}`).expect(200);
    expect(res.body.data.variants).toEqual([]);
    expect(res.body.data.stock).toBe(4);
    const buyer = await registerAndLogin();
    expect((await addToCart(buyer.token, { productId: legacy.id, quantity: 2 })).status).toBe(200);
  });

  // ═══ العربة ═══

  it('[CRITICAL] منتجٌ بألوان لا يُضاف بلا لون — لا لون يُختار عن الزبون', async () => {
    const { product } = await colouredProduct();
    const buyer = await registerAndLogin();
    const res = await addToCart(buyer.token, { productId: product.id, quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('VARIANT_REQUIRED');
  });

  it('[CRITICAL] لونٌ من منتجٍ آخر، أو لونٌ لمنتجٍ بلا ألوان ⇒ INVALID_VARIANT', async () => {
    const a = await colouredProduct();
    const b = await colouredProduct();
    const legacy = await legacyProduct(3);
    const buyer = await registerAndLogin();
    const wrong = await addToCart(buyer.token, { productId: a.product.id, variantId: b.red.id, quantity: 1 });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error?.code).toBe('INVALID_VARIANT');
    const none = await addToCart(buyer.token, { productId: legacy.id, variantId: a.red.id, quantity: 1 });
    expect(none.status).toBe(400);
    expect(none.body.error?.code).toBe('INVALID_VARIANT');
    const malformed = await addToCart(buyer.token, { productId: a.product.id, variantId: 'red', quantity: 1 });
    expect(malformed.status).toBe(400);
  });

  it('لونٌ موقوف ⇒ VARIANT_UNAVAILABLE، ولونٌ نفد ⇒ VARIANT_OUT_OF_STOCK', async () => {
    const { product, red, blue } = await colouredProduct({ red: 0 });
    await db.query('UPDATE product_variants SET is_active = FALSE WHERE id = $1', [blue.id]);
    const buyer = await registerAndLogin();
    const off = await addToCart(buyer.token, { productId: product.id, variantId: blue.id, quantity: 1 });
    expect(off.status).toBe(409);
    expect(off.body.error?.code).toBe('VARIANT_UNAVAILABLE');
    const empty = await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 });
    expect(empty.status).toBe(409);
    expect(empty.body.error?.code).toBe('VARIANT_OUT_OF_STOCK');
    // الأزرق الموقوف خارج مخزون المنتج.
    expect((await stocks(product.id)).product).toBe(0);
  });

  it('[CRITICAL] الكمية تُقاس على مخزون اللون وحده — الأحمر لا يستهلك حصة الأزرق', async () => {
    const { product, red, blue } = await colouredProduct();
    const buyer = await registerAndLogin();
    expect((await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 3 })).status).toBe(200);
    const over = await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 });
    expect(over.status).toBe(409);
    // الأزرق كاملٌ رغم أن العربة فيها ثلاثة حمر.
    const ok = await addToCart(buyer.token, { productId: product.id, variantId: blue.id, quantity: 5 });
    expect(ok.status).toBe(200);
    const lines = ok.body.data.cart as Array<Record<string, unknown>>;
    expect(lines).toHaveLength(2);
    const redLine = lines.find((line) => line.variantId === red.id)!;
    expect(redLine).toMatchObject({
      variantColorName: 'أحمر',
      variantColorNameAr: 'أحمر',
      variantColorNameCkb: 'سوور',
      variantColorHex: '#FF0000',
      productImage: IMG('red'),
      stock: 3,
      quantity: 3,
    });
  });

  it('رفع كمية سطرٍ بلون يُقاس على لونه', async () => {
    const { product, red, blue } = await colouredProduct({ red: 2, blue: 5 });
    const buyer = await registerAndLogin();
    const added = await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 });
    await addToCart(buyer.token, { productId: product.id, variantId: blue.id, quantity: 4 }).expect(200);
    const lineId = added.body.data.item.id as string;
    const tooMany = await api
      .patch(`/api/cart/${lineId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ quantity: 3 });
    expect(tooMany.status).toBe(409);
    const fine = await api
      .patch(`/api/cart/${lineId}`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ quantity: 2 });
    expect(fine.status).toBe(200);
  });

  it('المزامنة: لونٌ أُوقف يُزال، ولونٌ نقص مخزونه يُخفَّض — وسطر اللون الآخر لا يُمسّ', async () => {
    const { product, red, blue } = await colouredProduct({ red: 3, blue: 5 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 3 }).expect(200);
    await addToCart(buyer.token, { productId: product.id, variantId: blue.id, quantity: 4 }).expect(200);
    await db.query('UPDATE product_variants SET is_active = FALSE WHERE id = $1', [red.id]);
    await db.query('UPDATE product_variants SET stock = 2 WHERE id = $1', [blue.id]);

    const res = await api.get('/api/cart').set('Authorization', `Bearer ${buyer.token}`).expect(200);
    const adjustments = res.body.data.adjustments as Array<Record<string, unknown>>;
    expect(adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ variantId: red.id, reason: 'unavailable', quantity: 0, variantColorName: 'أحمر' }),
        expect.objectContaining({ variantId: blue.id, reason: 'reduced', quantity: 2 }),
      ]),
    );
    const items = res.body.data.items as Array<{ variantId: string; quantity: number }>;
    expect(items.map((item) => [item.variantId, item.quantity])).toEqual([[blue.id, 2]]);
  });

  // ═══ الطلب والمخزون ═══

  it('[CRITICAL] شراء الأحمر ينزّل الأحمر وحده عند القبول، والطلب يحفظ لونه وصورته', async () => {
    const { product, red } = await colouredProduct({ red: 3, blue: 5 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 2 }).expect(200);
    const order = await submit(buyer.token);
    expect(order.status, JSON.stringify(order.body)).toBe(201);
    const orderId = order.body.data.id as string;
    // الإرسال لا ينزّل شيئاً (قرار 2026-09-14).
    expect(await stocks(product.id)).toEqual({ product: 8, أحمر: 3, أزرق: 5 });

    expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
    expect(await stocks(product.id)).toEqual({ product: 6, أحمر: 1, أزرق: 5 });
    // تكرار القبول لا ينزّل ثانيةً.
    expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
    expect(await stocks(product.id)).toEqual({ product: 6, أحمر: 1, أزرق: 5 });

    const mine = await api.get(`/api/orders/${orderId}`).set('Authorization', `Bearer ${buyer.token}`).expect(200);
    expect(mine.body.data.items[0]).toMatchObject({
      variantId: red.id,
      variantColorName: 'أحمر',
      variantColorNameCkb: 'سوور',
      variantColorHex: '#FF0000',
      imageUrl: IMG('red'),
      quantity: 2,
    });
    const adminView = await api.get(`/api/admin/orders/${orderId}`).set(admin()).expect(200);
    expect(adminView.body.data.items[0]).toMatchObject({ variantId: red.id, currentStock: 1 });
  });

  it('[CRITICAL] تعديل اللون أو حذفه لاحقاً لا يغيّر طلباً قائماً', async () => {
    const { product, red, blue } = await colouredProduct();
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    const orderId = (await submit(buyer.token)).body.data.id as string;

    const edit = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [{ id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 5 }],
      });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    // الأحمر له طلب ⇒ أُوقف لا حُذف.
    const redAfter = edit.body.data.variants.find((v: { id: string }) => v.id === red.id);
    expect(redAfter).toMatchObject({ isActive: false });

    const mine = await api.get(`/api/orders/${orderId}`).set('Authorization', `Bearer ${buyer.token}`).expect(200);
    expect(mine.body.data.items[0]).toMatchObject({ variantColorName: 'أحمر', imageUrl: IMG('red') });
  });

  it('[CRITICAL] رفضٌ بعد القبول يُرجع الكمية إلى لونها وحده — مرة واحدة', async () => {
    const { product, red } = await colouredProduct({ red: 3, blue: 5 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 2 }).expect(200);
    const orderId = (await submit(buyer.token)).body.data.id as string;
    expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
    expect((await setStatus(orderId, 'REJECTED')).status).toBe(200);
    expect(await stocks(product.id)).toEqual({ product: 8, أحمر: 3, أزرق: 5 });
    expect((await setStatus(orderId, 'REJECTED')).status).toBe(200);
    expect(await stocks(product.id)).toEqual({ product: 8, أحمر: 3, أزرق: 5 });
  });

  it('[CRITICAL] قبولان متزامنان للقطعة الأخيرة من لونٍ ⇒ واحدٌ ينجح، والمخزون لا يصير سالباً', async () => {
    const { product, red } = await colouredProduct({ red: 1, blue: 5 });
    const [a, b] = await Promise.all([registerAndLogin(), registerAndLogin()]);
    await addToCart(a.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    await addToCart(b.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    const [oa, ob] = await Promise.all([submit(a.token), submit(b.token)]);
    expect([oa.status, ob.status]).toEqual([201, 201]);
    // كلا القبولين يصطفّ خلف قفل المنتج قبل أن يقرأ أيٌّ منهما المخزون.
    const barrier = await holdProductLock(product.id);
    const pending = [
      eager(setStatus(oa.body.data.id, 'OUT_FOR_DELIVERY')),
      eager(setStatus(ob.body.data.id, 'OUT_FOR_DELIVERY')),
    ];
    await waitForBlocked(2);
    await barrier.release();
    const results = await Promise.all(pending);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409)!.body.error?.code).toBe('INSUFFICIENT_STOCK');
    expect(await stocks(product.id)).toEqual({ product: 5, أحمر: 0, أزرق: 5 });
  });

  it('[CRITICAL] حفظ المسؤول وقبولٌ متزامنان على اللون نفسه ⇒ لا جمود، والقطع المستهلكة لا تعود', async () => {
    const { product, red, blue } = await colouredProduct({ red: 3, blue: 5 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 2 }).expect(200);
    const orderId = (await submit(buyer.token)).body.data.id as string;
    const barrier = await holdProductLock(product.id);
    const pending = [
      eager(setStatus(orderId, 'OUT_FOR_DELIVERY')),
      eager(
        api
          .patch(`/api/admin/products/${product.id}`)
          .set(admin())
          .send({
            variants: [
              { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3, expectedStock: 3 },
              { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 5, expectedStock: 5 },
            ],
          }),
      ),
    ];
    await waitForBlocked(2);
    await barrier.release();
    const [approval, save] = await Promise.all(pending);
    expect(approval.status).toBe(200);
    // أيّاً سبق: إن حفظ المسؤول أولاً فالقبول ينزّل من قيمته (٣ ← ١)؛ وإن قُبل
    // الطلب أولاً فحفظٌ بُني على ٣ يُرفض بـSTOCK_CHANGED — لا يُعيد القطعتين.
    expect([200, 409]).toContain(save.status);
    if (save.status === 409) expect(save.body.error?.code).toBe('STOCK_CHANGED');
    expect(await stocks(product.id)).toEqual({ product: 6, أحمر: 1, أزرق: 5 });
  });

  it('[CRITICAL] قبولٌ يفشل في لونٍ واحد لا يترك تنزيلاً جزئياً في لونٍ آخر', async () => {
    const { product, red, blue } = await colouredProduct({ red: 2, blue: 5 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 2 }).expect(200);
    await addToCart(buyer.token, { productId: product.id, variantId: blue.id, quantity: 3 }).expect(200);
    const orderId = (await submit(buyer.token)).body.data.id as string;
    // الأحمر نقص بعد الإرسال.
    await db.query('UPDATE product_variants SET stock = 1 WHERE id = $1', [red.id]);
    const res = await setStatus(orderId, 'OUT_FOR_DELIVERY');
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('INSUFFICIENT_STOCK');
    expect(await stocks(product.id)).toEqual({ product: 6, أحمر: 1, أزرق: 5 });
    const { rows } = await db.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(rows[0]!.status).toBe('PENDING_ADMIN_CONFIRMATION');
  });

  it('[CRITICAL] إرسالان متزامنان للعربة نفسها ⇒ طلبٌ واحد', async () => {
    const { product, red } = await colouredProduct();
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    const [first, second] = await Promise.all([submit(buyer.token), submit(buyer.token)]);
    expect([first.status, second.status].sort()).toEqual([201, 400]);
    const { rows } = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM order_items WHERE variant_id = $1`,
      [red.id],
    );
    expect(Number(rows[0]!.count)).toBe(1);
  });

  it('إعادة الطلب بمفتاح عدم التكرار نفسه تُعيد الطلب نفسه بلونه', async () => {
    const { product, red } = await colouredProduct();
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    const key = `variant-key-${Date.now()}-abcdef`;
    const send = () =>
      api.post('/api/orders').set('Authorization', `Bearer ${buyer.token}`).set('Idempotency-Key', key).send(ORDER_BODY());
    const first = await send();
    const again = await send();
    expect(first.status).toBe(201);
    expect(again.headers['idempotency-replayed']).toBe('true');
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.body.data.items[0].variantId).toBe(red.id);
  });

  it('[CRITICAL] لونٌ أُوقف بعد الإضافة يرفض الإرسال كله (VARIANT_UNAVAILABLE) ولا يُستبدل', async () => {
    const { product, red } = await colouredProduct();
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 1 }).expect(200);
    await db.query('UPDATE product_variants SET is_active = FALSE WHERE id = $1', [red.id]);
    const quote = await api.get('/api/orders/checkout-quote').set('Authorization', `Bearer ${buyer.token}`).expect(200);
    expect(quote.body.data.issues).toEqual([
      { code: 'VARIANT_UNAVAILABLE', productId: product.id, variantId: red.id },
    ]);
    const res = await submit(buyer.token);
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('VARIANT_UNAVAILABLE');
  });

  it('المعاينة تقيس مخزون اللون وتربط البصمة باللون', async () => {
    const { product, red } = await colouredProduct({ red: 2 });
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: product.id, variantId: red.id, quantity: 2 }).expect(200);
    await db.query('UPDATE product_variants SET stock = 1 WHERE id = $1', [red.id]);
    const quote = await api.get('/api/orders/checkout-quote').set('Authorization', `Bearer ${buyer.token}`).expect(200);
    expect(quote.body.data.issues).toEqual([
      { code: 'INSUFFICIENT_STOCK', productId: product.id, available: 1, variantId: red.id },
    ]);
    expect(quote.body.data.lines[0].variantId).toBe(red.id);
  });

  // ═══ لوحة التحكم ═══

  it('[CRITICAL] تعديل لونٍ واحد يحفظ الآخر كما هو، وصورة كل لونٍ له وحده', async () => {
    const { product, red, blue } = await colouredProduct();
    const res = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [
          { id: red.id, colorName: 'أحمر', imageUrl: IMG('red-v2'), stock: 7, expectedStock: 3 },
          { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 5, expectedStock: 5 },
        ],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = res.body.data.variants;
    expect(after.map((v: { imageUrl: string }) => v.imageUrl)).toEqual([IMG('red-v2'), IMG('blue')]);
    // الحقل الغائب (`colorNameCkb`, `colorHex`) يبقى كما حُفظ.
    expect(after[0]).toMatchObject({ colorNameCkb: 'سوور', colorHex: '#FF0000', stock: 7 });
    expect(res.body.data.stock).toBe(12);

    // حفظٌ لا يرسل `variants` لا يمسّ الألوان.
    const rename = await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ price: 12000 });
    expect(rename.status).toBe(200);
    expect(rename.body.data.variants).toEqual(after);
  });

  it('[CRITICAL] مخزون لونٍ تغيّر منذ فتح الصفحة ⇒ STOCK_CHANGED ولا يُحفظ شيء', async () => {
    const { product, red, blue } = await colouredProduct();
    await db.query('UPDATE product_variants SET stock = 2 WHERE id = $1', [red.id]);
    const res = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        nameAr: `${TAG} اسم جديد لا يُحفظ`,
        variants: [
          { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3, expectedStock: 3 },
          { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 9, expectedStock: 5 },
        ],
      });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('STOCK_CHANGED');
    expect(await stocks(product.id)).toEqual({ product: 7, أحمر: 2, أزرق: 5 });
    const { rows } = await db.query<{ name: string }>('SELECT name FROM products WHERE id = $1', [product.id]);
    expect(rows[0]!.name).toBe(product.nameAr);
  });

  it('قواعد اللوحة: لا مخزونٌ للمنتج مع ألوان، لا اسمان متماثلان، لا لونٌ من منتجٍ آخر، الصورة والاسم إلزاميان', async () => {
    const { product, red } = await colouredProduct();
    const other = await colouredProduct();
    const patch = (body: Record<string, unknown>) =>
      api.patch(`/api/admin/products/${product.id}`).set(admin()).send(body);

    const stock = await patch({ stock: 4 });
    expect(stock.status).toBe(400);
    expect(stock.body.error?.code).toBe('STOCK_PER_VARIANT');

    const duplicate = await patch({
      variants: [
        { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3 },
        { colorName: ' أحمر ', imageUrl: IMG('red2'), stock: 1 },
      ],
    });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.error?.code).toBe('DUPLICATE_VARIANT_COLOR');

    const foreign = await patch({
      variants: [{ id: other.red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 3 }],
    });
    expect(foreign.status).toBe(400);
    expect(foreign.body.error?.code).toBe('INVALID_VARIANT');

    for (const bad of [
      { colorName: '', imageUrl: IMG('x'), stock: 1 },
      { colorName: 'أخضر', stock: 1 },
      { colorName: 'أخضر', imageUrl: 'javascript:alert(1)', stock: 1 },
      { colorName: 'أخضر', imageUrl: IMG('x'), stock: -1 },
      { colorName: 'أخضر', imageUrl: IMG('x'), stock: 1, colorHex: 'red' },
    ]) {
      const res = await patch({ variants: [bad] });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }

    const create = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} مخزون مع ألوان`,
        descriptionAr: 'وصف',
        price: 1000,
        categoryId: catalog.categoryId,
        stock: 5,
        variants: [{ colorName: 'أحمر', imageUrl: IMG('red'), stock: 1 }],
      });
    expect(create.status).toBe(400);
    expect(create.body.error?.code).toBe('STOCK_PER_VARIANT');
    expect(await stocks(product.id)).toEqual({ product: 8, أحمر: 3, أزرق: 5 });
  });

  it('[CRITICAL] تبديل اسمَي لونين، وإعادة تسمية لونٍ مع إضافة لونٍ باسمه القديم، يُحفظان', async () => {
    const { product, red, blue } = await colouredProduct();
    const swap = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [
          { id: red.id, colorName: 'أزرق', imageUrl: IMG('red'), stock: 3 },
          { id: blue.id, colorName: 'أحمر', imageUrl: IMG('blue'), stock: 5 },
        ],
      });
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect(swap.body.data.variants.map((v: { id: string; colorNameAr: string }) => [v.id, v.colorNameAr])).toEqual([
      [red.id, 'أزرق'],
      [blue.id, 'أحمر'],
    ]);

    const chain = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [
          { colorName: 'أحمر', imageUrl: IMG('new'), stock: 1 },
          { id: blue.id, colorName: 'أحمر غامق', imageUrl: IMG('blue'), stock: 5 },
          { id: red.id, colorName: 'أزرق', imageUrl: IMG('red'), stock: 3 },
        ],
      });
    expect(chain.status, JSON.stringify(chain.body)).toBe(200);
    expect(chain.body.data.variants.map((v: { colorNameAr: string }) => v.colorNameAr)).toEqual([
      'أحمر',
      'أحمر غامق',
      'أزرق',
    ]);
  });

  it('[CRITICAL] القاعدة ترفض كتابة مخزون منتجٍ بألوان مباشرة', async () => {
    const { product } = await colouredProduct();
    await expect(db.query('UPDATE products SET stock = 100 WHERE id = $1', [product.id])).rejects.toThrow(
      /derived from its variants/,
    );
  });

  it('لونٌ بلا طلبات يُحذف حين يغيب عن القائمة، وإزالة كل الألوان تعيد المنتج بلا ألوان', async () => {
    const { product } = await colouredProduct();
    const res = await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ variants: [] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.variants).toEqual([]);
    expect(res.body.data.stock).toBe(0);
    const restock = await api.patch(`/api/admin/products/${product.id}`).set(admin()).send({ stock: 4 });
    expect(restock.status).toBe(200);
    expect(restock.body.data.stock).toBe(4);
  });

  it('[CRITICAL] أول ألوانٍ لمنتجٍ في طلبٍ مفتوح ⇒ PRODUCT_HAS_OPEN_ORDERS', async () => {
    const legacy = await legacyProduct(5);
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: legacy.id, quantity: 1 }).expect(200);
    expect((await submit(buyer.token)).status).toBe(201);
    const res = await api
      .patch(`/api/admin/products/${legacy.id}`)
      .set(admin())
      .send({ variants: [{ colorName: 'أحمر', imageUrl: IMG('red'), stock: 2 }] });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe('PRODUCT_HAS_OPEN_ORDERS');
    expect((await stocks(legacy.id)).product).toBe(5);
  });

  it('سطرٌ قديم بلا لون لمنتجٍ صار بألوان يُزال بالمزامنة ولا يُطلب', async () => {
    const legacy = await legacyProduct(5);
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, { productId: legacy.id, quantity: 1 }).expect(200);
    const convert = await api
      .patch(`/api/admin/products/${legacy.id}`)
      .set(admin())
      .send({ variants: [{ colorName: 'أحمر', imageUrl: IMG('red'), stock: 2 }] });
    expect(convert.status, JSON.stringify(convert.body)).toBe(200);
    expect(convert.body.data.stock).toBe(2);

    const order = await submit(buyer.token);
    expect(order.status).toBe(409);
    expect(order.body.error?.code).toBe('VARIANT_UNAVAILABLE');
    const cart = await api.get('/api/cart').set('Authorization', `Bearer ${buyer.token}`).expect(200);
    expect(cart.body.data.adjustments).toEqual([
      expect.objectContaining({ productId: legacy.id, variantId: null, reason: 'unavailable', quantity: 0 }),
    ]);
  });

  it('لون عاد من صفر والمنتج كله صفر ⇒ «عاد للتوفر» للمشتركين', async () => {
    const { product, red, blue } = await colouredProduct({ red: 0, blue: 0 });
    const buyer = await registerAndLogin();
    await api
      .post('/api/restock-subscriptions')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: product.id })
      .expect((res) => expect([200, 201]).toContain(res.status));
    const res = await api
      .patch(`/api/admin/products/${product.id}`)
      .set(admin())
      .send({
        variants: [
          { id: red.id, colorName: 'أحمر', imageUrl: IMG('red'), stock: 4, expectedStock: 0 },
          { id: blue.id, colorName: 'أزرق', imageUrl: IMG('blue'), stock: 0, expectedStock: 0 },
        ],
      });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const { rows } = await db.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM restock_subscriptions WHERE product_id = $1',
      [product.id],
    );
    // الاشتراك يُستهلك عند الإشعار (`notifyRestocked`).
    expect(Number(rows[0]!.count)).toBe(0);
  });
});
