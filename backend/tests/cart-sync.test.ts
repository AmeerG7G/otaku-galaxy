import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog, storeToday } from './helpers.js';

/**
 * CA-14 — مزامنة العربة النشطة (قرار المالك، STEP 59).
 *
 * الخادم مرجع الحقيقة، والعربة لا تُفاجئ الزبون عند الدفع:
 *   • `GET /cart` هي نقطة المزامنة: الأسعار تُقرأ حيّةً من المنتج، والسطر الذي
 *     لم يعد قابلاً للبيع (معطَّل أو مخزونه صفر) يُزال، والكمية التي تتجاوز
 *     المخزون تُخفَّض إليه — ويُعاد في الردّ ما عُدِّل (`adjustments`) ليُبلَّغ
 *     الزبون. زيادة المخزون لا ترفع كمية أحد.
 *   • الإرسال شبكة أمان: عربةٌ لم تعد صالحة كما زُومنت ⇒ `409` ولا طلب —
 *     لا إسقاطَ صامتاً لسطر ولا خفضَ صامتاً لكمية.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const PREFIX = 'CARTSYNC';

type Line = { id: string; productId: string; quantity: number; unitPrice: number; lineTotal: number; stock: number };
type Adjustment = {
  lineId: string;
  productId: string;
  productName: string;
  optionValue: string | null;
  reason: 'unavailable' | 'reduced';
  previousQuantity: number;
  quantity: number;
};

describe('CA-14 — active cart synchronization and the checkout safety net', () => {
  let adminToken: string;
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  const openBarriers = new Set<{ release(): Promise<void> }>();

  beforeAll(async () => {
    adminToken = await createAdminUser();
    catalog = await seedTestCatalog();
  });

  afterEach(async () => {
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE '${PREFIX} %')`);
    await db.query(`DELETE FROM products WHERE name LIKE '${PREFIX} %'
                      AND id NOT IN (SELECT product_id FROM order_items WHERE product_id IS NOT NULL)`);
  });

  // ── أدوات ────────────────────────────────────────────────────────────

  async function product(name: string, stock: number, price = 10_000) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', $2, $3, $4, TRUE) RETURNING id`,
      [`${PREFIX} ${name} ${Date.now()}`, price, catalog.categoryId, stock],
    );
    return rows[0]!.id;
  }

  const admin = (id: string, body: Record<string, unknown>) =>
    api.patch(`/api/admin/products/${id}`).set(bearer(adminToken)).send(body).expect(200);

  async function add(token: string, productId: string, quantity: number, optionValue?: string) {
    await api.post('/api/cart').set(bearer(token)).send({ productId, quantity, optionValue }).expect(200);
  }

  async function sync(token: string) {
    const res = await api.get('/api/cart').set(bearer(token)).expect(200);
    return res.body.data as { items: Line[]; adjustments: Adjustment[] };
  }

  const submit = (token: string, extra: Record<string, unknown> = {}) =>
    api.post('/api/orders').set(bearer(token))
      .send({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000', ...extra });

  const ordersOf = async (userId: string) =>
    Number((await db.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM orders WHERE user_id = $1', [userId])).rows[0]!.n);

  const cartRowsOf = async (userId: string) =>
    (await db.query<{ product_id: string; quantity: number }>(
      `SELECT ci.product_id, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id
        WHERE c.user_id = $1 ORDER BY ci.created_at`,
      [userId],
    )).rows;

  const lineOf = (cart: { items: Line[] }, productId: string) => cart.items.find((l) => l.productId === productId);

  // ═══ السعر ═══════════════════════════════════════════════════════════

  describe('price', () => {
    it('unchanged price → the cart is unchanged and nothing is reported', async () => {
      const c = await registerAndLogin();
      const p = await product('price-same', 5, 10_000);
      await add(c.token, p, 2);
      const first = await sync(c.token);
      const second = await sync(c.token);
      expect(second.items).toEqual(first.items);
      expect(second.adjustments).toEqual([]);
    });

    it('price increase → the line follows the server price and its total is recomputed; the other line is untouched', async () => {
      const c = await registerAndLogin();
      const bag = await product('price-up', 5, 10_000);
      const other = await product('price-other', 5, 7_000);
      await add(c.token, bag, 2);
      await add(c.token, other, 1);
      await sync(c.token);

      await admin(bag, { price: 12_000 });
      const cart = await sync(c.token);

      expect(lineOf(cart, bag)).toMatchObject({ quantity: 2, unitPrice: 12_000, lineTotal: 24_000 });
      expect(lineOf(cart, other)).toMatchObject({ quantity: 1, unitPrice: 7_000, lineTotal: 7_000 });
      expect(cart.adjustments).toEqual([]);
    });

    it('price decrease → the line follows the server price', async () => {
      const c = await registerAndLogin();
      const p = await product('price-down', 5, 10_000);
      await add(c.token, p, 3);
      await admin(p, { price: 8_000 });
      expect(lineOf(await sync(c.token), p)).toMatchObject({ quantity: 3, unitPrice: 8_000, lineTotal: 24_000 });
    });
  });

  // ═══ المخزون ═════════════════════════════════════════════════════════

  describe('stock', () => {
    it('stock drops to zero → the line is removed and reported unavailable; the other line is untouched', async () => {
      const c = await registerAndLogin();
      const gone = await product('stock-zero', 3);
      const kept = await product('stock-kept', 3);
      await add(c.token, gone, 2);
      await add(c.token, kept, 1);

      await admin(gone, { stock: 0 });
      const cart = await sync(c.token);

      expect(lineOf(cart, gone)).toBeUndefined();
      expect(lineOf(cart, kept)).toMatchObject({ quantity: 1 });
      expect(cart.adjustments).toEqual([
        expect.objectContaining({ productId: gone, reason: 'unavailable', previousQuantity: 2, quantity: 0 }),
      ]);
      expect((await cartRowsOf(c.userId)).map((r) => r.product_id)).toEqual([kept]);
    });

    it('a deactivated product is unavailable too → removed and reported, not hidden', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-inactive', 3);
      await add(c.token, p, 1);
      await api.delete(`/api/admin/products/${p}`).set(bearer(adminToken)).expect(200);

      const cart = await sync(c.token);
      expect(cart.items).toEqual([]);
      expect(cart.adjustments).toEqual([
        expect.objectContaining({ productId: p, reason: 'unavailable', previousQuantity: 1, quantity: 0 }),
      ]);
      expect(await cartRowsOf(c.userId)).toEqual([]);
    });

    it('stock below the cart quantity → the quantity is reduced to the stock and the total recomputed', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-reduce', 5, 10_000);
      await add(c.token, p, 2);
      await admin(p, { stock: 1 });

      const cart = await sync(c.token);
      expect(lineOf(cart, p)).toMatchObject({ quantity: 1, lineTotal: 10_000 });
      expect(cart.adjustments).toEqual([
        expect.objectContaining({ productId: p, reason: 'reduced', previousQuantity: 2, quantity: 1 }),
      ]);
      expect(await cartRowsOf(c.userId)).toEqual([{ product_id: p, quantity: 1 }]);
    });

    it('stock still covers the quantity → nothing changes', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-enough', 5);
      await add(c.token, p, 2);
      await admin(p, { stock: 2 });
      const cart = await sync(c.token);
      expect(lineOf(cart, p)).toMatchObject({ quantity: 2 });
      expect(cart.adjustments).toEqual([]);
    });

    it('stock increases → the cart quantity is never raised', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-up', 3);
      await add(c.token, p, 2);
      await admin(p, { stock: 1 });
      await sync(c.token);
      await admin(p, { stock: 50 });
      const cart = await sync(c.token);
      expect(lineOf(cart, p)).toMatchObject({ quantity: 1 });
      expect(cart.adjustments).toEqual([]);
    });

    it('two option lines of one product are measured together; the older line keeps its units', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-options', 5);
      await add(c.token, p, 2, 'أحمر');
      await add(c.token, p, 2, 'أزرق');
      await admin(p, { stock: 3 });

      const cart = await sync(c.token);
      const byOption = Object.fromEntries(
        (await db.query<{ option_value: string; quantity: number }>(
          `SELECT ci.option_value, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1`,
          [c.userId],
        )).rows.map((r) => [r.option_value, r.quantity]),
      );
      expect(byOption).toEqual({ 'أحمر': 2, 'أزرق': 1 });
      expect(cart.adjustments).toEqual([
        expect.objectContaining({ optionValue: 'أزرق', reason: 'reduced', previousQuantity: 2, quantity: 1 }),
      ]);
    });

    it('a synchronization is reported once — the next one finds nothing to adjust', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-once', 5);
      await add(c.token, p, 3);
      await admin(p, { stock: 1 });
      expect((await sync(c.token)).adjustments).toHaveLength(1);
      expect((await sync(c.token)).adjustments).toEqual([]);
    });

    it('[CRITICAL] synchronization takes the cart lock — it cannot interleave with an in-flight checkout', async () => {
      const c = await registerAndLogin();
      const p = await product('stock-lock', 5);
      await add(c.token, p, 1);
      const { rows: [cart] } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [c.userId]);

      const client: pg.PoolClient = await db.connect();
      await client.query('BEGIN');
      await client.query('SELECT id FROM carts WHERE id = $1 FOR UPDATE', [cart!.id]);
      const barrier = {
        async release() {
          if (!openBarriers.has(barrier)) return;
          openBarriers.delete(barrier);
          await client.query('ROLLBACK');
          client.release();
        },
      };
      openBarriers.add(barrier);

      let settled = false;
      const pending = sync(c.token).then((r) => { settled = true; return r; });
      let blocked = false;
      for (let attempt = 0; attempt < 400 && !settled && !blocked; attempt += 1) {
        const { rows } = await db.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        blocked = rows[0]!.n > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      await barrier.release();
      expect((await pending).items).toHaveLength(1);
    });
  });

  // ═══ الإرسال: شبكة الأمان ════════════════════════════════════════════

  describe('checkout safety net', () => {
    it('a synchronized, still-valid cart is ordered normally', async () => {
      const c = await registerAndLogin();
      const p = await product('checkout-ok', 5, 10_000);
      await add(c.token, p, 2);
      await admin(p, { price: 11_000 });
      await sync(c.token);
      const res = await submit(c.token);
      expect(res.status).toBe(201);
      expect(res.body.data.items[0]).toMatchObject({ price: 11_000, quantity: 2, lineTotal: 22_000 });
    });

    it('stock drops below the synchronized quantity → 409, no order, the cart is left for the next synchronization', async () => {
      const c = await registerAndLogin();
      const p = await product('checkout-stock', 5);
      await add(c.token, p, 3);
      await sync(c.token);
      await admin(p, { stock: 2 });

      const res = await submit(c.token);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await ordersOf(c.userId)).toBe(0);
      expect(await cartRowsOf(c.userId)).toEqual([{ product_id: p, quantity: 3 }]);
    });

    it('stock reaches zero after the synchronization → 409 and no order', async () => {
      const c = await registerAndLogin();
      const p = await product('checkout-zero', 2);
      await add(c.token, p, 1);
      await sync(c.token);
      await admin(p, { stock: 0 });

      const res = await submit(c.token);
      expect(res.status).toBe(409);
      expect(await ordersOf(c.userId)).toBe(0);
    });

    it('[CRITICAL] a product deactivated after the synchronization → 409 PRODUCT_UNAVAILABLE, never silently dropped from the order', async () => {
      const c = await registerAndLogin();
      const gone = await product('checkout-inactive', 5);
      const kept = await product('checkout-kept', 5);
      await add(c.token, gone, 1);
      await add(c.token, kept, 1);
      await sync(c.token);
      await api.delete(`/api/admin/products/${gone}`).set(bearer(adminToken)).expect(200);

      const res = await submit(c.token);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_UNAVAILABLE');
      expect(await ordersOf(c.userId)).toBe(0);

      // المزامنة التالية تُزيله وتبلّغ به، ثم يمرّ الإرسال بما بقي.
      expect((await sync(c.token)).adjustments).toEqual([
        expect.objectContaining({ productId: gone, reason: 'unavailable' }),
      ]);
      const retry = await submit(c.token);
      expect(retry.status).toBe(201);
      expect(retry.body.data.items.map((i: { productId: string }) => i.productId)).toEqual([kept]);
    });

    it('another order approved in the meantime consumes the stock → the second checkout is refused, no invalid order', async () => {
      const first = await registerAndLogin();
      const second = await registerAndLogin();
      const p = await product('checkout-race', 1);
      await add(first.token, p, 1);
      await add(second.token, p, 1);
      await sync(second.token);

      const created = await submit(first.token);
      expect(created.status).toBe(201);
      await api.patch(`/api/admin/orders/${created.body.data.id}/status`).set(bearer(adminToken))
        .send({ status: 'OUT_FOR_DELIVERY' }).expect(200);

      const res = await submit(second.token);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await ordersOf(second.userId)).toBe(0);
    });
  });

  // ═══ سلطة الخادم ═════════════════════════════════════════════════════

  describe('server authority', () => {
    it('a stale price, total or line list sent by the client is ignored — the order carries the database values', async () => {
      const c = await registerAndLogin();
      const p = await product('authority-price', 5, 10_000);
      await add(c.token, p, 2);
      await admin(p, { price: 12_000 });

      const res = await submit(c.token, {
        items: [{ productId: p, quantity: 2, price: 10_000 }],
        total: 20_000,
        productsTotal: 20_000,
        unitPrice: 10_000,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.items[0]).toMatchObject({ productId: p, price: 12_000, quantity: 2, lineTotal: 24_000 });
      expect(Number(res.body.data.productsTotal)).toBe(24_000);
    });

    it('a stale quantity cannot bypass the stock — neither a client field nor a cart line above the stock', async () => {
      const c = await registerAndLogin();
      const p = await product('authority-qty', 2);
      await add(c.token, p, 2);
      // سطرٌ أعلى من المخزون كما يتركه مخزونٌ هبط بعد الإضافة (بلا مزامنة).
      await db.query(
        `UPDATE cart_items SET quantity = 5 WHERE cart_id = (SELECT id FROM carts WHERE user_id = $1)`,
        [c.userId],
      );
      const res = await submit(c.token, { items: [{ productId: p, quantity: 1 }], quantity: 1 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await ordersOf(c.userId)).toBe(0);
    });
  });

  // ═══ اتّساق السعر عند الإرسال — الخيار (أ): الأسعار المتوقَّعة من العربة المُزامَنة ═══

  /**
   * التطبيق يرسل مع الإرسال سعر الوحدة الذي تعرضه عربته المُزامَنة لكل منتج
   * (`expectedPrices: [{ productId, unitPrice }]` — حقلا سطر `GET /cart` نفسيهما).
   * الخادم يقارنه بالسعر الحالي **داخل معاملة الإنشاء، بالقراءة نفسها التي تُبنى
   * منها اللقطة**. أي اختلاف ⇒ `409 PRODUCT_PRICE_CHANGED`، ولا طلب ولا استهلاك
   * خصم. السعر المتوقَّع فحصٌ لا مصدر: اللقطة تحمل سعر القاعدة دائماً.
   */
  describe('checkout price consistency — expected prices from the synchronized cart (option A)', () => {
    const expectedFrom = (cart: { items: Line[] }) =>
      cart.items.map((l) => ({ productId: l.productId, unitPrice: l.unitPrice }));

    const redemptionOpen = async (userId: string) =>
      Number((await db.query<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM loyalty_reward_redemptions
          WHERE user_id = $1 AND level_key = 'explorer' AND consumed_at IS NULL`,
        [userId],
      )).rows[0]!.n);
    const birthdayUsages = async (userId: string) =>
      Number((await db.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM birthday_discount_usage WHERE user_id = $1',
        [userId],
      )).rows[0]!.n);
    const stockOf = async (id: string) =>
      Number((await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0]!.stock);

    it('A · matching prices → the order is created at the authoritative price', async () => {
      const c = await registerAndLogin();
      const p = await product('price-match', 5, 10_000);
      await add(c.token, p, 2);
      const cart = await sync(c.token);
      const res = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(201);
      expect(res.body.data.items[0]).toMatchObject({ productId: p, price: 10_000, quantity: 2, lineTotal: 20_000 });
    });

    it('[CRITICAL] B · customer saw 10,000, admin set 12,000 → 409 PRODUCT_PRICE_CHANGED: no order, no stock change, cart intact', async () => {
      const c = await registerAndLogin();
      const p = await product('price-up', 5, 10_000);
      await add(c.token, p, 2);
      const cart = await sync(c.token);
      await admin(p, { price: 12_000 });

      const res = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
      expect(await ordersOf(c.userId)).toBe(0);
      expect(await stockOf(p)).toBe(5);
      expect(await cartRowsOf(c.userId)).toEqual([{ product_id: p, quantity: 2 }]);
    });

    it('C · a price decrease is a mismatch too → 409, no order', async () => {
      const c = await registerAndLogin();
      const p = await product('price-down', 5, 12_000);
      await add(c.token, p, 1);
      const cart = await sync(c.token);
      await admin(p, { price: 10_000 });

      const res = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
      expect(await ordersOf(c.userId)).toBe(0);
    });

    it('D · one mismatching line among several rejects the whole checkout — no partial order', async () => {
      const c = await registerAndLogin();
      const same = await product('price-multi-same', 5, 7_000);
      const changed = await product('price-multi-changed', 5, 10_000);
      await add(c.token, same, 1);
      await add(c.token, changed, 1);
      const cart = await sync(c.token);
      await admin(changed, { price: 11_000 });

      const res = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
      expect(await ordersOf(c.userId)).toBe(0);
      expect((await cartRowsOf(c.userId)).map((r) => r.product_id).sort()).toEqual([same, changed].sort());
    });

    it('E1 · a matching price never bypasses the stock gate', async () => {
      const first = await registerAndLogin();
      const second = await registerAndLogin();
      const p = await product('price-stock', 1, 10_000);
      await add(first.token, p, 1);
      await add(second.token, p, 1);
      const cart = await sync(second.token);
      const created = await submit(first.token);
      expect(created.status).toBe(201);
      await api.patch(`/api/admin/orders/${created.body.data.id}/status`).set(bearer(adminToken))
        .send({ status: 'OUT_FOR_DELIVERY' }).expect(200);

      const res = await submit(second.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await ordersOf(second.userId)).toBe(0);
    });

    it('[CRITICAL] E2 · the check runs inside the checkout transaction: a price committed while the checkout waits on the cart lock is caught', async () => {
      const c = await registerAndLogin();
      const p = await product('price-race', 5, 10_000);
      await add(c.token, p, 1);
      const cart = await sync(c.token);
      const { rows: [cartRow] } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [c.userId]);

      // حاجز: معاملة تحكّم تمسك صفّ العربة، فيقف الإرسال عند قفل العربة.
      const client: pg.PoolClient = await db.connect();
      await client.query('BEGIN');
      await client.query('SELECT id FROM carts WHERE id = $1 FOR UPDATE', [cartRow!.id]);
      const barrier = {
        async release() {
          if (!openBarriers.has(barrier)) return;
          openBarriers.delete(barrier);
          await client.query('ROLLBACK');
          client.release();
        },
      };
      openBarriers.add(barrier);

      const pending = submit(c.token, { expectedPrices: expectedFrom(cart) }).then((r) => r);
      let blocked = false;
      for (let attempt = 0; attempt < 400 && !blocked; attempt += 1) {
        const { rows } = await db.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'`,
        );
        blocked = rows[0]!.n > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(blocked).toBe(true);
      // المسؤول يغيّر السعر ويلتزم بينما الإرسال واقف.
      await admin(p, { price: 12_000 });
      await barrier.release();

      const res = await pending;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
      expect(await ordersOf(c.userId)).toBe(0);
    });

    it('[CRITICAL] F · a price mismatch consumes no discount — the level reward and the birthday discount stay available for the retry', async () => {
      const c = await registerAndLogin();
      const big = await product('price-points', 5, 200_000);
      await add(c.token, big, 1);
      const first = await submit(c.token);
      expect(first.status).toBe(201);
      await api.patch(`/api/admin/orders/${first.body.data.id}/status`).set(bearer(adminToken))
        .send({ status: 'OUT_FOR_DELIVERY' }).expect(200);
      await api.post(`/api/orders/${first.body.data.id}/confirm-receipt`).set(bearer(c.token)).expect(200);
      await api.post('/api/points/rewards/explorer/claim').set(bearer(c.token)).expect(200);
      await api.post('/api/birthday').set(bearer(c.token)).send(await storeToday()).expect(200);

      const p = await product('price-discounts', 5, 20_000);
      await add(c.token, p, 1);
      const cart = await sync(c.token);
      await admin(p, { price: 25_000 });

      const refused = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('PRODUCT_PRICE_CHANGED');
      expect(await ordersOf(c.userId)).toBe(1); // طلب الأهلية وحده
      expect(await redemptionOpen(c.userId)).toBe(1);
      expect(await birthdayUsages(c.userId)).toBe(0);

      // يعيد المزامنة فيرى 25,000 ويعيد الإرسال: الخصمان يُطبَّقان الآن.
      const retried = await submit(c.token, { expectedPrices: expectedFrom(await sync(c.token)) });
      expect(retried.status).toBe(201);
      // ميلاد 5% = 1 250، مستكشف 3% = 750.
      expect(retried.body.data).toMatchObject({ discount: 2_000, loyaltyDiscount: 750 });
      expect(await redemptionOpen(c.userId)).toBe(0);
      expect(await birthdayUsages(c.userId)).toBe(1);
    });

    it('G · the order snapshot carries the database price — an expected price is a check, never a price source', async () => {
      const c = await registerAndLogin();
      const p = await product('price-snapshot', 5, 9_500);
      await add(c.token, p, 3);
      const cart = await sync(c.token);
      const res = await submit(c.token, { expectedPrices: expectedFrom(cart) });
      expect(res.status).toBe(201);
      const { rows: [item] } = await db.query<{ price: string; line_total: string }>(
        'SELECT price, line_total FROM order_items WHERE order_id = $1',
        [res.body.data.id],
      );
      expect({ price: Number(item!.price), lineTotal: Number(item!.line_total) }).toEqual({ price: 9_500, lineTotal: 28_500 });
    });

    it('after the 409 the customer re-synchronizes, sees 12,000, and the retry succeeds at 12,000', async () => {
      const c = await registerAndLogin();
      const p = await product('price-retry', 5, 10_000);
      await add(c.token, p, 1);
      const seen = await sync(c.token);
      expect(seen.items[0]!.unitPrice).toBe(10_000);
      await admin(p, { price: 12_000 });
      expect((await submit(c.token, { expectedPrices: expectedFrom(seen) })).status).toBe(409);

      const resynced = await sync(c.token);
      expect(resynced.items[0]).toMatchObject({ unitPrice: 12_000, lineTotal: 12_000 });
      const retry = await submit(c.token, { expectedPrices: expectedFrom(resynced) });
      expect(retry.status).toBe(201);
      expect(retry.body.data.items[0]).toMatchObject({ price: 12_000 });
    });

    it('a malformed expected price is refused as bad input (400), not silently ignored', async () => {
      const c = await registerAndLogin();
      const p = await product('price-bad-input', 5, 10_000);
      await add(c.token, p, 1);
      const res = await submit(c.token, { expectedPrices: [{ productId: p, unitPrice: 'عشرة آلاف' }] });
      expect(res.status).toBe(400);
      expect(await ordersOf(c.userId)).toBe(0);
    });
  });
});
