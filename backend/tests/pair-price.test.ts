import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { pairPricedLineTotals } from '../src/domain/orderPricing.js';
import { addProductOption, api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] «قطعة بـ٤٠٠٠، قطعتان بـ٧٠٠٠» — سعر القطعتين للمنتج (STEP 69، هجرة 085).
 *
 * ═══ القرار (المالك، 2026-10-24) ═══
 * - حقلٌ اختياري لكل منتج يضبطه المسؤول: سعر قطعتين من **المنتج نفسه** (وإن
 *   اختلف الخيار). منتجٌ بلا هذا الحقل يبقى على سعره كما هو.
 * - يتكرّر: كل قطعتين بسعر القطعتين والفردة بسعر القطعة (٣ = ١١٠٠٠، ٤ = ١٤٠٠٠).
 * - خصما الميلاد والمزيّة يُحسبان على مجموع المنتجات الناتج، كما اليوم.
 * - الخادم وحده يحسب: لا مبلغ من العميل، والمخزون يتحرّك بالكمية عند القبول.
 */

describe('pairPricedLineTotals — حساب الأسطر', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 9, 24, 0, 0, n));
  const line = (id: string, quantity: number, extra: Partial<Parameters<typeof pairPricedLineTotals>[0][number]> = {}) => ({
    id,
    productId: 'p1',
    quantity,
    unitPrice: 4000,
    pairPrice: 7000 as number | null,
    createdAt: at(Number(id.replace(/\D/g, '')) || 0),
    ...extra,
  });
  const totals = (lines: Parameters<typeof pairPricedLineTotals>[0]) => Object.fromEntries(pairPricedLineTotals(lines));

  it('قطعة ٤٠٠٠، قطعتان ٧٠٠٠ لا ٨٠٠٠، والعرض يتكرّر', () => {
    expect(totals([line('l1', 1)])).toEqual({ l1: 4000 });
    expect(totals([line('l1', 2)])).toEqual({ l1: 7000 });
    expect(totals([line('l1', 3)])).toEqual({ l1: 11000 });
    expect(totals([line('l1', 4)])).toEqual({ l1: 14000 });
  });

  it('قطعتان بخيارين مختلفين من المنتج نفسه = ٧٠٠٠، والتوفير على السطر الذي تكتمل فيه القطعتان', () => {
    // الترتيب بالإضافة لا بترتيب المصفوفة: النتيجة نفسها مهما رُتِّبت الأسطر.
    const red = line('l1', 1);
    const blue = line('l2', 1);
    expect(totals([blue, red])).toEqual({ l1: 4000, l2: 3000 });
    expect(totals([red, blue])).toEqual({ l1: 4000, l2: 3000 });
    expect(totals([line('l1', 1), line('l2', 2)])).toEqual({ l1: 4000, l2: 7000 });
  });

  it('منتجٌ بلا سعر قطعتين، ومنتجٌ آخر بجانبه، لا يتأثّران', () => {
    expect(totals([line('l1', 2, { pairPrice: null })])).toEqual({ l1: 8000 });
    expect(totals([line('l1', 1), line('l2', 1, { productId: 'p2' })])).toEqual({ l1: 4000, l2: 4000 });
  });
});

describe('[CRITICAL] سعر القطعتين من اللوحة إلى المخزون', () => {
  const TAG = `PAIRPRICE ${Date.now()}`;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  const address = () => ({ fullAddress: 'بغداد، الكرادة', phone: '07700000000' });

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterAll(async () => {
    const owned = `(SELECT id FROM products WHERE name LIKE '${TAG}%')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM product_options WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM restock_subscriptions WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM notifications WHERE product_id IN ${owned}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE '${TAG}%'`);
  });

  async function product(name: string, overrides: Record<string, unknown> = {}) {
    const res = await api
      .post('/api/admin/products')
      .set(admin())
      .send({
        nameAr: `${TAG} ${name}`,
        descriptionAr: 'وصف',
        nameCkb: `${TAG} ${name}`,
        descriptionCkb: 'وەسف',
        price: 4000,
        pairPrice: 7000,
        categoryId: catalog.categoryId,
        stock: 10,
        ...overrides,
      });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  async function stock(id: string) {
    const { rows } = await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id]);
    return rows[0]!.stock;
  }

  async function buyer() {
    const user = await registerAndLogin();
    return { ...user, auth: { Authorization: `Bearer ${user.token}` } };
  }

  async function addToCart(auth: Record<string, string>, productId: string, quantity: number, optionValue?: string) {
    await api.post('/api/cart').set(auth).send({ productId, quantity, ...(optionValue ? { optionValue } : {}) }).expect(200);
  }

  function placeOrder(auth: Record<string, string>, body: Record<string, unknown> = {}, key?: string) {
    const req = api.post('/api/orders').set(auth);
    if (key) req.set('Idempotency-Key', key);
    return req.send({ governorateId: catalog.governorateId, ...address(), ...body });
  }

  const setStatus = (orderId: string, status: string) =>
    api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(admin())
      .send(status === 'REJECTED' ? { status, note: 'سبب الرفض' } : { status });

  it('المسؤول يضبط سعر القطعتين ويعدّله ويزيله؛ والقيم التي ليست عرضاً مرفوضة', async () => {
    const id = await product('ضبط');
    const detail = await api.get(`/api/catalog/products/${id}`).expect(200);
    expect(detail.body.data).toMatchObject({ price: 4000, pairPrice: 7000 });

    for (const pairPrice of [8000, 9000, 3999, 0, -7000, '7000']) {
      const res = await api.patch(`/api/admin/products/${id}`).set(admin()).send({ pairPrice });
      expect(res.status, String(pairPrice)).toBe(400);
      if (typeof pairPrice === 'number' && pairPrice > 0) expect(res.body.error.code).toBe('INVALID_PAIR_PRICE');
    }
    // سعرٌ جديد للقطعة يجعل سعر القطعتين القديم ليس عرضاً (٧٠٠٠ ≥ ٢ × ٣٥٠٠): يُرفض لا يُقبل بصمت.
    const cheaper = await api.patch(`/api/admin/products/${id}`).set(admin()).send({ price: 3500 });
    expect(cheaper.status).toBe(400);
    expect(cheaper.body.error.code).toBe('INVALID_PAIR_PRICE');
    // وإعادة المنتج «بلا سعر» تحتاج إزالة سعر القطعتين أولاً.
    const unpriced = await api.patch(`/api/admin/products/${id}`).set(admin()).send({ price: null });
    expect(unpriced.body.error.code).toBe('INVALID_PAIR_PRICE');

    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ pairPrice: 6000 }).expect(200);
    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ pairPrice: null }).expect(200);
    const after = await api.get(`/api/catalog/products/${id}`).expect(200);
    expect(after.body.data).toMatchObject({ price: 4000, pairPrice: null });

    const bad = await api
      .post('/api/admin/products')
      .set(admin())
      .send({ nameAr: `${TAG} بلا سعر`, descriptionAr: 'و', nameCkb: `${TAG} بلا سعر`, descriptionCkb: 'و', price: null, pairPrice: 7000, categoryId: catalog.categoryId, stock: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_PAIR_PRICE');
  });

  it('قطعة واحدة ٤٠٠٠، قطعتان ٧٠٠٠ — في العربة والمعاينة والطلب، ويُخصم من المخزون قطعتان عند القبول', async () => {
    const id = await product('طلب');
    const one = await buyer();
    await addToCart(one.auth, id, 1);
    const cartOne = await api.get('/api/cart').set(one.auth).expect(200);
    expect(cartOne.body.data.items[0]).toMatchObject({ unitPrice: 4000, pairPrice: 7000, quantity: 1, lineTotal: 4000 });
    const orderOne = await placeOrder(one.auth).expect(201);
    expect(orderOne.body.data.productsTotal).toBe(4000);

    const two = await buyer();
    await addToCart(two.auth, id, 2);
    const cartTwo = await api.get('/api/cart').set(two.auth).expect(200);
    expect(cartTwo.body.data.items[0]).toMatchObject({ unitPrice: 4000, quantity: 2, lineTotal: 7000 });
    const quote = await api.get('/api/orders/checkout-quote').query({ governorateId: catalog.governorateId }).set(two.auth).expect(200);
    expect(quote.body.data.productsTotal).toBe(7000);
    expect(quote.body.data.lines).toEqual([expect.objectContaining({ productId: id, quantity: 2, unitPrice: 4000, lineTotal: 7000 })]);

    // مبلغٌ من المتصفّح لا يُقرأ: الخادم يحسب ٧٠٠٠ مهما أُرسل.
    const before = await stock(id);
    const order = await placeOrder(two.auth, { total: 1, productsTotal: 1, items: [{ productId: id, quantity: 2, price: 1 }] }).expect(201);
    expect(order.body.data.productsTotal).toBe(7000);
    const { deliveryFee, deliveryDiscount, discount } = order.body.data;
    expect(order.body.data.total).toBe(7000 + Number(deliveryFee) - Number(deliveryDiscount) - Number(discount));
    const { rows } = await db.query<{ price: string; quantity: number; line_total: string; pair_price: string | null }>(
      'SELECT price, quantity, line_total, pair_price FROM order_items WHERE order_id = $1',
      [order.body.data.id],
    );
    expect(rows.map((r) => [Number(r.price), r.quantity, Number(r.line_total), Number(r.pair_price)])).toEqual([[4000, 2, 7000, 7000]]);
    expect(await stock(id)).toBe(before);

    await setStatus(order.body.data.id, 'OUT_FOR_DELIVERY').expect(200);
    expect(await stock(id)).toBe(before - 2);
  });

  it('قطعتان بخيارين من المنتج نفسه = ٧٠٠٠، وأربع قطع = ١٤٠٠٠', async () => {
    const id = await product('خيارات');
    await addProductOption(id);
    const shopper = await buyer();
    await addToCart(shopper.auth, id, 1, 'أحمر');
    await addToCart(shopper.auth, id, 1, 'أزرق');
    const quote = await api.get('/api/orders/checkout-quote').query({ governorateId: catalog.governorateId }).set(shopper.auth).expect(200);
    expect(quote.body.data.productsTotal).toBe(7000);
    const order = await placeOrder(shopper.auth).expect(201);
    expect(order.body.data.productsTotal).toBe(7000);
    const lines = order.body.data.items as Array<{ lineTotal: number }>;
    expect(lines.map((l) => Number(l.lineTotal)).sort()).toEqual([3000, 4000]);

    const four = await buyer();
    await addToCart(four.auth, id, 4, 'أحمر');
    expect((await placeOrder(four.auth).expect(201)).body.data.productsTotal).toBe(14000);
  });

  it('منتجٌ بلا سعر قطعتين يبقى ٨٠٠٠ لقطعتين، وطلبٌ قديم لا يُعاد حسابه', async () => {
    const plain = await product('عادي', { pairPrice: null });
    const shopper = await buyer();
    await addToCart(shopper.auth, plain, 2);
    const old = await placeOrder(shopper.auth).expect(201);
    expect(old.body.data.productsTotal).toBe(8000);

    // العرض يُضاف لاحقاً: الطلب القائم على مبلغه.
    await api.patch(`/api/admin/products/${plain}`).set(admin()).send({ pairPrice: 7000 }).expect(200);
    const { rows } = await db.query<{ products_total: string; line_total: string; pair_price: string | null }>(
      `SELECT o.products_total, oi.line_total, oi.pair_price
         FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.id = $1`,
      [old.body.data.id],
    );
    expect(rows.map((r) => [Number(r.products_total), Number(r.line_total), r.pair_price])).toEqual([[8000, 8000, null]]);
  });

  it('إعادة الإرسال بالمفتاح نفسه تعيد الطلب نفسه، والقبول يخصم قطعتين مرةً واحدة', async () => {
    const id = await product('تكرار');
    const shopper = await buyer();
    await addToCart(shopper.auth, id, 2);
    const key = randomUUID();
    const first = await placeOrder(shopper.auth, {}, key).expect(201);
    const replay = await placeOrder(shopper.auth, {}, key).expect(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(replay.body.data.productsTotal).toBe(7000);

    const before = await stock(id);
    await setStatus(first.body.data.id, 'OUT_FOR_DELIVERY').expect(200);
    await setStatus(first.body.data.id, 'OUT_FOR_DELIVERY');
    expect(await stock(id)).toBe(before - 2);
  });

  it('الرفض قبل القبول لا يمسّ المخزون، وبعده يعيد القطعتين', async () => {
    const id = await product('رفض');
    const a = await buyer();
    await addToCart(a.auth, id, 2);
    const pending = await placeOrder(a.auth).expect(201);
    const start = await stock(id);
    await setStatus(pending.body.data.id, 'REJECTED').expect(200);
    expect(await stock(id)).toBe(start);

    const b = await buyer();
    await addToCart(b.auth, id, 2);
    const approved = await placeOrder(b.auth).expect(201);
    await setStatus(approved.body.data.id, 'OUT_FOR_DELIVERY').expect(200);
    expect(await stock(id)).toBe(start - 2);
    await setStatus(approved.body.data.id, 'REJECTED').expect(200);
    expect(await stock(id)).toBe(start);
  });

  it('قبولان متزامنان لطلبين من قطعتين على مخزون ٣: واحدٌ فقط، والمخزون لا ينزل تحت الصفر', async () => {
    const id = await product('تزامن', { stock: 3 });
    const orders: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const shopper = await buyer();
      await addToCart(shopper.auth, id, 2);
      orders.push((await placeOrder(shopper.auth).expect(201)).body.data.id as string);
    }
    const results = await Promise.all(orders.map((orderId) => setStatus(orderId, 'OUT_FOR_DELIVERY')));
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await stock(id)).toBe(1);
  });

  it('[CRITICAL] التطبيق يرسل سعر القطعتين الذي راجعه: تعديله قبل الإرسال ⇒ PRODUCT_PRICE_CHANGED ولا طلب', async () => {
    // التطبيق يرسل `expectedPrices` لا بصمة المعاينة. سعر الوحدة باقٍ ٤٠٠٠، فبلا
    // `pairPrice` في الفحص كان العرض المُزال يمرّ ويُحفظ الطلب بـ٨٠٠٠ لا ٧٠٠٠.
    const id = await product('توقّع');
    const shopper = await buyer();
    await addToCart(shopper.auth, id, 2);
    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ pairPrice: null }).expect(200);

    const res = await placeOrder(shopper.auth, { expectedPrices: [{ productId: id, unitPrice: 4000, pairPrice: 7000 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM orders WHERE user_id = $1', [shopper.userId]);
    expect(rows[0]!.n).toBe(0);

    // ما يطابق الحالي يمرّ؛ وعميلٌ أقدم بلا الحقل لا يُفحص له — كما كان.
    const ok = await placeOrder(shopper.auth, { expectedPrices: [{ productId: id, unitPrice: 4000, pairPrice: null }] }).expect(201);
    expect(ok.body.data.productsTotal).toBe(8000);
    const legacy = await buyer();
    await addToCart(legacy.auth, id, 2);
    await placeOrder(legacy.auth, { expectedPrices: [{ productId: id, unitPrice: 4000 }] }).expect(201);
  });

  it('سعر قطعتين تغيّر بعد المراجعة ⇒ QUOTE_CHANGED ولا طلب', async () => {
    const id = await product('مراجعة');
    const shopper = await buyer();
    await addToCart(shopper.auth, id, 2);
    const quote = await api.get('/api/orders/checkout-quote').query({ governorateId: catalog.governorateId }).set(shopper.auth).expect(200);
    await api.patch(`/api/admin/products/${id}`).set(admin()).send({ pairPrice: 7500 }).expect(200);
    const res = await placeOrder(shopper.auth, { expectedQuote: quote.body.data.fingerprint });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_CHANGED');
    const { rows } = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM orders WHERE user_id = (SELECT id FROM users WHERE phone = $1)',
      [shopper.phone],
    );
    expect(rows[0]!.n).toBe(0);
  });
});
