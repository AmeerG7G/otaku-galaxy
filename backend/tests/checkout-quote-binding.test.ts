import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] ربط الإرسال بالمعاينة التي راجعها الزبون (`expectedQuote`).
 *
 * ═══ العطل ═══ `expectedPrices` يحرس سعر الوحدة وحده. ما عداه كان يتغيّر بين
 * المراجعة والتأكيد بصمت فيُنشأ طلبٌ غير الذي رآه الزبون: سطرٌ أُضيف من جهازٍ
 * آخر، كميةٌ زادت، رسوم منطقةٍ عدّلتها الإدارة، أو وجهةٌ غير التي سُعّرت.
 *
 * ═══ العقد ═══
 *   المعاينة تُرجع `fingerprint` (و`lines` و`issues`) — `null` ما لم يكن الطلب قابلاً للإرسال
 *   الإرسال بالبصمة نفسها              ← 201 بمبالغ المعاينة حرفياً
 *   أي تغيّر مما رآه الزبون             ← 409 `QUOTE_CHANGED` ولا طلب، والعربة كما هي
 *   بلا `expectedQuote` (التطبيق)       ← السلوك القائم حرفياً
 *   إعادةٌ بمفتاح عدم التكرار بعد الالتزام ← الطلب الملتزَم لا `QUOTE_CHANGED`
 */

type Quote = {
  total: number | null;
  deliveryFee: number | null;
  fingerprint: string | null;
  lines: Array<{ productId: string; optionValue: string | null; quantity: number; unitPrice: number; lineTotal: number }>;
  issues: Array<{ code: string; productId: string; available?: number }>;
};

describe('[CRITICAL] الإرسال مربوطٌ بالمعاينة التي راجعها الزبون', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let zonedGovernorateId: string;
  let zoneA: string;
  let zoneB: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    const { rows: [governorate] } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee) VALUES ('QBIND محافظة مقسّمة', 5000)
       ON CONFLICT (name) DO UPDATE SET delivery_fee = 5000, is_active = TRUE RETURNING id`,
    );
    zonedGovernorateId = governorate!.id;
    const zone = async (name: string, fee: number) =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO governorate_zones (governorate_id, name, delivery_fee) VALUES ($1, $2, $3)
           ON CONFLICT (governorate_id, name) DO UPDATE SET delivery_fee = $3, is_active = TRUE
           RETURNING id`,
          [zonedGovernorateId, name, fee],
        )
      ).rows[0]!.id;
    zoneA = await zone('QBIND منطقة أ', 3000);
    zoneB = await zone('QBIND منطقة ب', 4000);
  });

  afterAll(async () => {
    const owned = `(SELECT id FROM products WHERE name LIKE 'QBIND %')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${owned}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'QBIND %'`);
    // المحافظة ومنطقتاها تبقيان: الإدراج أعلاه idempotent فلا تتراكم نسخ.
  });

  async function product(stock = 10, price = 1000) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', $2, $3, $4, TRUE) RETURNING id`,
      [`QBIND ${randomUUID().slice(0, 8)}`, price, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function addToCart(token: string, productId: string, quantity = 1) {
    const res = await api.post('/api/cart').set(auth(token)).send({ productId, quantity }).expect(200);
    return res.body.data.item as { id: string; productId: string };
  }

  async function quote(token: string, query: Record<string, string>) {
    const res = await api.get('/api/orders/checkout-quote').query(query).set(auth(token));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.data as Quote;
  }

  function submit(token: string, extra: Record<string, unknown> = {}, idempotencyKey?: string) {
    const req = api.post('/api/orders').set(auth(token));
    if (idempotencyKey) req.set('Idempotency-Key', idempotencyKey);
    return req.send({
      governorateId: catalog.governorateId,
      fullAddress: 'بغداد، الكرادة، قرب ساحة الواثق',
      phone: '07700000000',
      ...extra,
    });
  }

  async function orderCount(userId: string) {
    const { rows } = await db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1',
      [userId],
    );
    return rows[0]!.n;
  }

  async function cartLineCount(userId: string) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1`,
      [userId],
    );
    return rows[0]!.n;
  }

  it('المعاينة تُرجع الأسطر والبصمة، والإرسال بها يُنشئ الطلب بمبالغها حرفياً', async () => {
    const buyer = await registerAndLogin();
    const productId = await product(10, 2500);
    await addToCart(buyer.token, productId, 2);

    const shown = await quote(buyer.token, { governorateId: catalog.governorateId });
    expect(shown.fingerprint).toMatch(/^q1:[0-9a-f]{64}$/);
    expect(shown.issues).toEqual([]);
    expect(shown.lines).toEqual([
      { productId, optionValue: null, quantity: 2, unitPrice: 2500, lineTotal: 5000 },
    ]);
    // المعاينة لا تكتب: إعادتها تعطي البصمة نفسها.
    expect((await quote(buyer.token, { governorateId: catalog.governorateId })).fingerprint).toBe(
      shown.fingerprint,
    );

    const res = await submit(buyer.token, { expectedQuote: shown.fingerprint });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.total).toBe(shown.total);
  });

  it('سطرٌ أُضيف بعد المراجعة (جهاز آخر) ← 409 QUOTE_CHANGED ولا طلب، والعربة كما هي', async () => {
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, await product());
    const shown = await quote(buyer.token, { governorateId: catalog.governorateId });

    await addToCart(buyer.token, await product());

    const res = await submit(buyer.token, { expectedQuote: shown.fingerprint });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_CHANGED');
    expect(await orderCount(buyer.userId)).toBe(0);
    expect(await cartLineCount(buyer.userId)).toBe(2);

    // معاينةٌ جديدة تُرى ثم تُرسل — ينجح.
    const fresh = await quote(buyer.token, { governorateId: catalog.governorateId });
    expect(fresh.fingerprint).not.toBe(shown.fingerprint);
    expect((await submit(buyer.token, { expectedQuote: fresh.fingerprint })).status).toBe(201);
  });

  it('كميةٌ تغيّرت بعد المراجعة ← 409 QUOTE_CHANGED', async () => {
    const buyer = await registerAndLogin();
    const line = await addToCart(buyer.token, await product(), 1);
    const shown = await quote(buyer.token, { governorateId: catalog.governorateId });

    await api.patch(`/api/cart/${line.id}`).set(auth(buyer.token)).send({ quantity: 3 }).expect(200);

    const res = await submit(buyer.token, { expectedQuote: shown.fingerprint });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('QUOTE_CHANGED');
    expect(await orderCount(buyer.userId)).toBe(0);
  });

  it('رسوم المنطقة عُدّلت بعد المراجعة، أو أُرسل لمنطقةٍ غير التي سُعّرت ← 409', async () => {
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, await product());
    const zoned = { governorateId: zonedGovernorateId };

    // قبل اختيار المنطقة لا رسوم ولا بصمة — لا شيء قابلٌ للإرسال بعد.
    const noZone = await quote(buyer.token, zoned);
    expect(noZone.deliveryFee).toBeNull();
    expect(noZone.fingerprint).toBeNull();

    const shown = await quote(buyer.token, { ...zoned, zoneId: zoneA });
    expect(shown.deliveryFee).toBe(3000);

    const otherZone = await submit(buyer.token, { ...zoned, zoneId: zoneB, expectedQuote: shown.fingerprint });
    expect(otherZone.status, JSON.stringify(otherZone.body)).toBe(409);
    expect(otherZone.body.error.code).toBe('QUOTE_CHANGED');

    await db.query('UPDATE governorate_zones SET delivery_fee = 3500 WHERE id = $1', [zoneA]);
    try {
      const res = await submit(buyer.token, { ...zoned, zoneId: zoneA, expectedQuote: shown.fingerprint });
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error.code).toBe('QUOTE_CHANGED');
      expect(await orderCount(buyer.userId)).toBe(0);
    } finally {
      await db.query('UPDATE governorate_zones SET delivery_fee = 3000 WHERE id = $1', [zoneA]);
    }

    // الرسوم عادت كما رآها — البصمة القديمة تصحّ من جديد.
    const res = await submit(buyer.token, { ...zoned, zoneId: zoneA, expectedQuote: shown.fingerprint });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.deliveryFee).toBe(3000);
  });

  it('ما سيرفضه الإنشاء يظهر في المعاينة (`issues`) ولا بصمة معه', async () => {
    const buyer = await registerAndLogin();
    const scarce = await product(5);
    const retired = await product();
    await addToCart(buyer.token, scarce, 2);
    await addToCart(buyer.token, retired, 1);
    await db.query('UPDATE products SET stock = 1 WHERE id = $1', [scarce]);
    await db.query('UPDATE products SET is_active = FALSE WHERE id = $1', [retired]);

    const shown = await quote(buyer.token, { governorateId: catalog.governorateId });
    expect(shown.fingerprint).toBeNull();
    expect(shown.issues).toEqual(
      expect.arrayContaining([
        { code: 'PRODUCT_UNAVAILABLE', productId: retired },
        { code: 'INSUFFICIENT_STOCK', productId: scarce, available: 1 },
      ]),
    );
    expect(shown.issues).toHaveLength(2);
    expect(shown.lines.map((line) => line.productId)).toEqual([scarce]);
  });

  it('بلا expectedQuote (التطبيق اليوم) ← السلوك القائم حرفياً', async () => {
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, await product());
    await quote(buyer.token, { governorateId: catalog.governorateId });
    await addToCart(buyer.token, await product());

    const res = await submit(buyer.token);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.items).toHaveLength(2);
  });

  it('بصمةٌ بصيغةٍ غير صالحة ← 400 ولا طلب', async () => {
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, await product());

    for (const expectedQuote of ['', 'q1:abc', `q2:${'a'.repeat(64)}`, `q1:${'A'.repeat(64)}`, 42]) {
      const res = await submit(buyer.token, { expectedQuote });
      expect(res.status, `${String(expectedQuote)} → ${JSON.stringify(res.body)}`).toBe(400);
    }
    expect(await orderCount(buyer.userId)).toBe(0);
  });

  it('إعادةٌ بمفتاح عدم التكرار بعد الالتزام تُعيد الطلب لا QUOTE_CHANGED', async () => {
    const buyer = await registerAndLogin();
    await addToCart(buyer.token, await product());
    const shown = await quote(buyer.token, { governorateId: catalog.governorateId });
    const key = randomUUID();

    const first = await submit(buyer.token, { expectedQuote: shown.fingerprint }, key);
    expect(first.status, JSON.stringify(first.body)).toBe(201);

    // العربة فرغت فمعاينتها الآن غير التي رآها — لكن المحاولة نفسها أُنشئت.
    const retry = await submit(buyer.token, { expectedQuote: shown.fingerprint }, key);
    expect(retry.status, JSON.stringify(retry.body)).toBe(201);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(await orderCount(buyer.userId)).toBe(1);
  });
});
