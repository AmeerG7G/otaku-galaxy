import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * [CRITICAL] مفتاح عدم التكرار لإرسال الطلب (`Idempotency-Key`، هجرة 071).
 *
 * ═══ العطل ═══ العربة المقفولة هي مفتاح عدم التكرار **الضمني**: إعادة
 * المحاولة بعد التزامٍ ضاع ردّه تجد عربةً فارغة فتعود `400 EMPTY_CART` — لا
 * تكرار، لكنها نتيجة ملتبسة تقول للزبون «العربة فارغة» عن طلبٍ أُنشئ. ومسارٌ
 * يملأ العربة بين المحاولتين (واجهة الويب، أو زبونٌ يعيد إضافة ما ظنّه ضاع)
 * يُنشئ طلباً ثانياً.
 *
 * ═══ العقد ═══
 *   المفتاح نفسه + الطلب نفسه    ← الطلب الملتزَم نفسه (201 + `Idempotency-Replayed`)
 *   المفتاح نفسه + طلبٌ مختلف     ← 422 `IDEMPOTENCY_KEY_REUSED` ولا كتابة
 *   محاولةٌ أولى فشلت            ← لا أثر؛ الإعادة تُنفَّذ من جديد
 *   مفتاح زبونٍ آخر               ← لا يلمس طلبه
 *   بلا ترويسة                   ← السلوك القائم حرفياً (`failure-retry-audit` Phase 4)
 */

const openBarriers = new Set<{ release(): Promise<void> }>();

/** معاملة تحكّم تمسك صفّاً `FOR UPDATE` حتى يُطلَق — ترتيبٌ حتميّ لا توقيت. */
async function holdRowLock(table: 'carts' | 'products', id: string) {
  const client: pg.PoolClient = await db.connect();
  await client.query('BEGIN');
  await client.query(`SELECT id FROM ${table} WHERE id = $1 FOR UPDATE`, [id]);
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
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0]!.n === n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`لم تُحجب ${n} جلسات على القفل خلال المهلة`);
}

describe('[CRITICAL] إرسال الطلب بمفتاح عدم التكرار', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
  });

  afterEach(async () => {
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    const owned = `(SELECT id FROM products WHERE name LIKE 'IDEM %')`;
    await db.query(`DELETE FROM order_items WHERE product_id IN ${owned}`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN ${owned}`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'IDEM %'`);
  });

  async function product(name: string, stock = 10) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', 1000, $2, $3, TRUE) RETURNING id`,
      [`IDEM ${name} ${randomUUID().slice(0, 8)}`, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  const key = () => randomUUID();

  const body = (overrides: Record<string, unknown> = {}) => ({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة، قرب ساحة الواثق',
    phone: '07700000000',
    ...overrides,
  });

  async function buyerWith(productId: string, quantity = 1) {
    const buyer = await registerAndLogin();
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId, quantity })
      .expect(200);
    return buyer;
  }

  function submit(token: string, idempotencyKey: string | null, payload = body()) {
    const req = api.post('/api/orders').set('Authorization', `Bearer ${token}`);
    if (idempotencyKey !== null) req.set('Idempotency-Key', idempotencyKey);
    return req.send(payload);
  }

  async function ordersOf(userId: string) {
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at',
      [userId],
    );
    return rows.map((r) => r.id);
  }

  async function cartLines(userId: string) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1`,
      [userId],
    );
    return rows[0]!.n;
  }

  it('[CRITICAL] إعادة المحاولة بالمفتاح نفسه بعد التزامٍ ضاع ردّه ⇒ الطلب نفسه لا «العربة فارغة»', async () => {
    const p = await product('ضائع');
    const buyer = await buyerWith(p);
    const k = key();

    // المحاولة الأولى تلتزم — والعميل «لا يرى» ردّها.
    const first = await submit(buyer.token, k);
    expect(first.status).toBe(201);
    expect(first.headers['idempotency-replayed']).toBeUndefined();

    const retry = await submit(buyer.token, k);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.total).toBe(first.body.data.total);
    expect(retry.body.data.items).toEqual(first.body.data.items);

    expect(await ordersOf(buyer.userId)).toEqual([first.body.data.id]);
    const { rows } = await db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1',
      [first.body.data.id],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it('بلا ترويسة: السلوك القائم حرفياً — الإعادة `400 EMPTY_CART` وطلبٌ واحد', async () => {
    const p = await product('بلا مفتاح');
    const buyer = await buyerWith(p);
    expect((await submit(buyer.token, null)).status).toBe(201);
    const retry = await submit(buyer.token, null);
    expect(retry.status).toBe(400);
    expect(retry.body.error.code).toBe('EMPTY_CART');
    expect(await ordersOf(buyer.userId)).toHaveLength(1);
  });

  it('[CRITICAL] العربة امتلأت بين المحاولتين: المفتاح نفسه يعيد الطلب الأول ولا يُنشئ ثانياً', async () => {
    const p = await product('امتلاء');
    const buyer = await buyerWith(p);
    const k = key();
    const first = await submit(buyer.token, k);
    expect(first.status).toBe(201);

    // الزبون (أو الواجهة) يعيد إضافة ما ظنّه ضاع، ثم يعيد المحاولة نفسها.
    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: p, quantity: 1 })
      .expect(200);
    const retry = await submit(buyer.token, k);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);

    expect(await ordersOf(buyer.userId)).toEqual([first.body.data.id]);
    // العربة الجديدة لم تُستهلك — إعادةٌ بلا أي أثر جانبي.
    expect(await cartLines(buyer.userId)).toBe(1);
  });

  it('[CRITICAL] إرسالان متزامنان بالمفتاح نفسه ⇒ طلبٌ واحد يعود للاثنين', async () => {
    const p = await product('متزامن');
    const buyer = await buyerWith(p);
    const { rows } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [buyer.userId]);
    const k = key();

    const barrier = await holdRowLock('carts', rows[0]!.id);
    const a = submit(buyer.token, k).then((r) => r);
    const b = submit(buyer.token, k).then((r) => r);
    await waitForBlocked(2);
    await barrier.release();
    const [ra, rb] = await Promise.all([a, b]);

    expect([ra.status, rb.status]).toEqual([201, 201]);
    expect(ra.body.data.id).toBe(rb.body.data.id);
    expect(await ordersOf(buyer.userId)).toHaveLength(1);
    expect([ra.headers['idempotency-replayed'], rb.headers['idempotency-replayed']].filter(Boolean))
      .toEqual(['true']);
  });

  it('المفتاح نفسه لطلبٍ مختلف ⇒ 422 IDEMPOTENCY_KEY_REUSED ولا كتابة', async () => {
    const p = await product('اختلاف');
    const buyer = await buyerWith(p);
    const k = key();
    const first = await submit(buyer.token, k);
    expect(first.status).toBe(201);

    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: p, quantity: 1 })
      .expect(200);
    const reused = await submit(buyer.token, k, body({ fullAddress: 'البصرة، العشار، شارع الكورنيش' }));
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await ordersOf(buyer.userId)).toEqual([first.body.data.id]);
    expect(await cartLines(buyer.userId)).toBe(1);
  });

  it('الملخّص المراجَع جزءٌ من الطلب: المفتاح نفسه بملخّصٍ آخر ⇒ 422، وبالملخّص نفسه ⇒ إعادة', async () => {
    const p = await product('ملخّص');
    const buyer = await buyerWith(p);
    const quote = await api
      .get('/api/orders/checkout-quote')
      .query({ governorateId: catalog.governorateId })
      .set('Authorization', `Bearer ${buyer.token}`)
      .expect(200);
    const reviewed = quote.body.data.fingerprint as string;
    expect(reviewed).toMatch(/^q1:[0-9a-f]{64}$/);
    const k = key();
    const first = await submit(buyer.token, k, body({ expectedQuote: reviewed }));
    expect(first.status).toBe(201);

    await api
      .post('/api/cart')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ productId: p, quantity: 1 })
      .expect(200);
    const other = await submit(buyer.token, k, body({ expectedQuote: `q1:${'0'.repeat(64)}` }));
    expect(other.status).toBe(422);
    expect(other.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const replay = await submit(buyer.token, k, body({ expectedQuote: reviewed }));
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);
    expect(await ordersOf(buyer.userId)).toEqual([first.body.data.id]);
  });

  it('محاولةٌ أولى فشلت لا تُخزَّن: الإعادة بالمفتاح نفسه تُنفَّذ بعد زوال السبب', async () => {
    const p = await product('فشل أول', 5);
    const buyer = await buyerWith(p, 3);
    const k = key();
    await db.query('UPDATE products SET stock = 1 WHERE id = $1', [p]);

    const failed = await submit(buyer.token, k);
    expect(failed.status).toBe(409);
    expect(failed.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await ordersOf(buyer.userId)).toHaveLength(0);

    await db.query('UPDATE products SET stock = 5 WHERE id = $1', [p]);
    const retry = await submit(buyer.token, k);
    expect(retry.status).toBe(201);
    expect(retry.headers['idempotency-replayed']).toBeUndefined();
    expect(await ordersOf(buyer.userId)).toEqual([retry.body.data.id]);
  });

  it('[SECURITY] مفتاح زبونٍ آخر لا يكشف طلبه — يُنشئ لصاحب الجلسة طلبه هو', async () => {
    const p = await product('عزل');
    const alice = await buyerWith(p);
    const bob = await buyerWith(p);
    const k = key();

    const aliceOrder = await submit(alice.token, k);
    expect(aliceOrder.status).toBe(201);
    const bobOrder = await submit(bob.token, k);
    expect(bobOrder.status).toBe(201);
    expect(bobOrder.headers['idempotency-replayed']).toBeUndefined();
    expect(bobOrder.body.data.id).not.toBe(aliceOrder.body.data.id);
    expect(bobOrder.body.data.customer?.id ?? bob.userId).toBe(bob.userId);
    expect(await ordersOf(bob.userId)).toEqual([bobOrder.body.data.id]);
  });

  it('مفتاحٌ بصيغة غير صالحة ⇒ 400 INVALID_IDEMPOTENCY_KEY، لا طلب، والعربة كما هي', async () => {
    const p = await product('صيغة');
    const buyer = await buyerWith(p);
    for (const bad of ['', 'short', 'has spaces in the key!!', 'x'.repeat(129)]) {
      const res = await submit(buyer.token, bad);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_IDEMPOTENCY_KEY');
    }
    expect(await ordersOf(buyer.userId)).toHaveLength(0);
    expect(await cartLines(buyer.userId)).toBe(1);
  });

  it('الإعادة تسبق فحوص الإرسال: طلبٌ التزم يُعاد ولو عُطِّلت محافظته بعده', async () => {
    const p = await product('محافظة');
    const buyer = await buyerWith(p);
    const { rows: [gov] } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee) VALUES ($1, 2000) RETURNING id`,
      [`IDEM محافظة ${randomUUID().slice(0, 8)}`],
    );
    const k = key();
    const first = await submit(buyer.token, k, body({ governorateId: gov!.id }));
    expect(first.status).toBe(201);

    await db.query('UPDATE governorates SET is_active = FALSE WHERE id = $1', [gov!.id]);
    const retry = await submit(buyer.token, k, body({ governorateId: gov!.id }));
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);

    await db.query('DELETE FROM orders WHERE id = $1', [first.body.data.id]);
    await db.query('DELETE FROM governorates WHERE id = $1', [gov!.id]);
  });
});
