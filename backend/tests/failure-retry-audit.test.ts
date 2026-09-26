import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { birthdayRepo } from '../src/repositories/birthdayRepo.js';
import { cartRepo } from '../src/repositories/cartRepo.js';
import { productRepo } from '../src/repositories/catalogRepo.js';
import { deviceTokenRepo } from '../src/repositories/deviceTokenRepo.js';
import { mediaRepo } from '../src/repositories/mediaRepo.js';
import { notificationRepo } from '../src/repositories/notificationsRepo.js';
import { orderRepo } from '../src/repositories/orderRepo.js';
import { pointsRepo } from '../src/repositories/pointsRepo.js';
import { audienceRepo } from '../src/repositories/audienceRepo.js';
import { loyaltyRewardsService } from '../src/services/loyaltyRewardsService.js';
import { pushProvider } from '../src/services/push/index.js';
import { storage } from '../src/storage/index.js';
import {
  api,
  app,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  registerUploadedPhoto,
  registerUploadedSlotImage,
  seedTestCatalog,
  storeToday,
} from './helpers.js';

/**
 * تدقيق الفشل / إعادة المحاولة / التكرار (Audit #4 — 2026-09-21).
 *
 * السؤال الواحد: إذا انقطع طلبٌ أو أُعيد أو تكرّر أو فشل قبل الالتزام أو
 * بعده — هل يتكرّر أثرٌ تجاري، أو يضيع أثرٌ مقصود، أو تبقى حالةٌ متناقضة،
 * أو تصير إعادةُ المحاولة الآمنة مستحيلة؟
 *
 * ═══ الأدوات — كلها حتمية ═══
 *   • حقن الأعطال: `vi.spyOn` على دوال المستودعات/الخدمات نفسها التي تستدعيها
 *     المعاملة، فيقع الرمي **عند نقطة بعينها** داخل المعاملة الحقيقية
 *     (بعد إدراج الطلب، بعد استهلاك الخصم، قبل تفريغ السلة…).
 *   • فشل الالتزام: `db.connect` يُعيد عميلاً يرمي عند `COMMIT` وحده، فتمرّ
 *     المعاملة كاملةً ثم تسقط عند آخر خطوة — و`withTransaction` يتراجع.
 *   • فشل الاستجابة بعد الالتزام: `app.response.json` يُستبدل مرةً واحدة —
 *     إمّا يرمي (تسلسل فاشل → ٥٠٠ للعميل والقاعدة ملتزمة) أو يدمّر المقبس
 *     (لا ردّ إطلاقاً → مهلة عند العميل).
 *   • التزامن: حواجز `pg_locks` كما في تدقيق #2 — قفل صفّ، أو إدراجٌ غير
 *     ملتزَم على مفتاح فريد يُجمّد كل إدراجٍ متنافس عند الفهرس نفسه —
 *     والمراقبة على `pg_stat_activity` لا على المهل.
 *
 * لا `sleep` ولا احتمال: كل اختبار ينتظر **شرطاً** في القاعدة أو يتحقّق من
 * حالة القاعدة مباشرةً بعد الحدث.
 */

// ═══════════════════════════════════════════════════════════════════
// أدوات مشتركة
// ═══════════════════════════════════════════════════════════════════

const openBarriers = new Set<{ release(): Promise<void> }>();

/** معاملة تحكّم تمسك قفل صفّ حتى تُطلَق. */
async function holdRowLock(table: string, id: string) {
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

/**
 * معاملة تحكّم تنفّذ إدراجاً **غير ملتزَم** على مفتاح فريد: كل إدراجٍ متنافس
 * على المفتاح نفسه يقف عند الفهرس حتى يُعرف مصير هذه المعاملة. الإطلاق
 * بالتراجع يُحرّر المتنافسين ليتسابقوا على الصفّ الفعلي — وهو بالضبط شكل
 * الضغطة المزدوجة/إعادة الإرسال المتزامنة عند الفهرس الفريد.
 */
async function holdSpeculativeInsert(sql: string, params: unknown[]) {
  const client: pg.PoolClient = await db.connect();
  await client.query('BEGIN');
  await client.query(sql, params);
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

/** ينتظر حتى تكون `n` جلسات بالضبط منتظرةً قفلاً في هذه القاعدة. */
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

/**
 * أيّهما أسبق: أن ينتهي الطلب، أو أن يقف على قفل (`n` جلسات محجوبة) — لطلبٍ
 * ينتظر في الشيفرة الصحيحة ويمرّ بلا انتظار في المعيبة؛ الحكم على نتيجته.
 */
async function settledOrBlocked(pending: Promise<unknown>, n: number) {
  let settled = false;
  void pending.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if (settled) return 'settled';
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0]!.n >= n) return 'blocked';
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('الطلب لم ينتهِ ولم يقف على قفل خلال المهلة');
}

/**
 * فشل الالتزام: العميل التالي الذي يطلبه `withTransaction` يرمي عند `COMMIT`
 * مرةً واحدة. `ROLLBACK` بعده يمرّ عادياً، فتتراجع المعاملة كاملةً.
 */
function failNextCommit() {
  const original = db.connect.bind(db) as (cb?: unknown) => Promise<pg.PoolClient>;
  let armed = true;
  const spy = vi.spyOn(db, 'connect').mockImplementation((async (cb?: unknown) => {
    // `pool.query` يستدعي `connect(callback)` داخلياً — يُمرَّر كما هو؛ نعترض
    // النداء الوعديّ وحده (وهو ما يستعمله `withTransaction`).
    if (typeof cb === 'function') return original(cb);
    const client = await original();
    if (!armed) return client;
    const query = client.query.bind(client);
    (client as { query: unknown }).query = ((...args: unknown[]) => {
      if (armed && args[0] === 'COMMIT') {
        armed = false;
        return Promise.reject(new Error('injected: commit failure'));
      }
      return (query as (...a: unknown[]) => unknown)(...args);
    }) as typeof client.query;
    return client;
  }) as typeof db.connect);
  return spy;
}

/**
 * فشل الاستجابة بعد نجاح العملية.
 *   `throw` → `res.json` يرمي مرةً (تسلسلٌ فاشل) فيرى العميل ٥٠٠ بعد التزام
 *             القاعدة.
 *   `drop`  → المقبس يُدمَّر قبل أي بايت — لا ردّ؛ العميل يرى انقطاعاً.
 * يُطبَّق على أول استجابة يطابق مسارُها البادئة، ثم يُعاد الأصل.
 */
function failNextResponse(pathPrefix: string, mode: 'throw' | 'drop') {
  const proto = app.response as unknown as { json: (body: unknown) => unknown };
  const original = proto.json;
  let fired = false;
  proto.json = function patched(this: { req?: { originalUrl?: string }; socket?: { destroy(): void } }, body: unknown) {
    if (!fired && this.req?.originalUrl?.startsWith(pathPrefix)) {
      fired = true;
      proto.json = original;
      if (mode === 'drop') {
        this.socket?.destroy();
        return this;
      }
      throw new Error('injected: response serialization failure');
    }
    return original.call(this, body);
  };
  return {
    restore() {
      proto.json = original;
    },
    get fired() {
      return fired;
    },
  };
}

// ═══════════════════════════════════════════════════════════════════

describe('Failure / retry / idempotency audit', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let responsePatch: { restore(): void } | null = null;

  beforeAll(async () => {
    await purgeTestUsers();
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    responsePatch?.restore();
    responsePatch = null;
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'FRA %')`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'FRA %')`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'FRA %'`);
  });

  // ── مساعدات ──

  async function product(name: string, stock: number, price = 10_000) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_active)
       VALUES ($1, 'وصف', $4, $2, $5, $3, TRUE) RETURNING id`,
      [`FRA ${name} ${Math.random().toString(36).slice(2, 8)}`, catalog.categoryId, stock, price, catalog.subcategoryId],
    );
    return rows[0]!.id;
  }

  const stockOf = async (id: string) =>
    Number((await db.query<{ stock: string }>('SELECT stock FROM products WHERE id = $1', [id])).rows[0]!.stock);

  const orderRow = async (orderId: string) =>
    (
      await db.query<{
        status: string;
        discount: string;
        dispatched_at: Date | null;
        delivered_at: Date | null;
      }>('SELECT status, discount, dispatched_at, delivered_at FROM orders WHERE id = $1', [orderId])
    ).rows[0]!;

  const count = async (sql: string, params: unknown[] = []) =>
    (await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n ${sql}`, params)).rows[0]!.n;

  const ordersOf = (userId: string) => count('FROM orders WHERE user_id = $1', [userId]);
  const cartLinesOf = (userId: string) =>
    count('FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1', [userId]);
  const historyOf = (orderId: string, status?: string) =>
    count(`FROM order_status_history WHERE order_id = $1 ${status ? 'AND status = $2' : ''}`, status ? [orderId, status] : [orderId]);
  const notificationsOf = (orderId: string, type?: string) =>
    count(`FROM notifications WHERE order_id = $1 ${type ? 'AND type = $2' : ''}`, type ? [orderId, type] : [orderId]);
  const pointsOf = (userId: string, reason: string) =>
    count('FROM points_ledger WHERE user_id = $1 AND reason = $2', [userId, reason]);

  const ORDER_BODY = () => ({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07700000000',
  });

  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function fillCart(token: string, lines: Array<{ productId: string; quantity: number }>) {
    for (const line of lines) {
      await api.post('/api/cart').set(authed(token)).send(line).expect(200);
    }
  }

  /** طلب حقيقي بدأ فعلاً (supertest كسول — `.then` يطلقه). */
  const placeOrder = (token: string) =>
    api.post('/api/orders').set(authed(token)).send(ORDER_BODY()).then((r) => r);

  const transition = (orderId: string, body: Record<string, unknown>) =>
    api.patch(`/api/admin/orders/${orderId}/status`).set(authed(adminToken)).send(body).then((r) => r);
  const approve = (orderId: string) => transition(orderId, { status: 'OUT_FOR_DELIVERY' });
  const reject = (orderId: string, note = 'سبب الرفض') => transition(orderId, { status: 'REJECTED', note });
  const confirmReceipt = (token: string, orderId: string) =>
    api.post(`/api/orders/${orderId}/confirm-receipt`).set(authed(token)).then((r) => r);

  async function pendingOrder(lines: Array<{ productId: string; quantity: number }>) {
    const buyer = await registerAndLogin();
    await fillCart(buyer.token, lines);
    const res = await placeOrder(buyer.token);
    expect(res.status).toBe(201);
    return { buyer, orderId: res.body.data.id as string };
  }

  async function dispatchedOrder(lines: Array<{ productId: string; quantity: number }>) {
    const created = await pendingOrder(lines);
    expect((await approve(created.orderId)).status).toBe(200);
    return created;
  }

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٤ — إنشاء الطلب
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 4 — POST /orders retry semantics', () => {
    it('success then identical retry: the cart is the idempotency token → 400 EMPTY_CART, one order', async () => {
      const p = await product('retry-seq', 5);
      const { buyer, orderId } = await pendingOrder([{ productId: p, quantity: 2 }]);

      const retry = await placeOrder(buyer.token);
      expect(retry.status).toBe(400);
      expect(retry.body.error.code).toBe('EMPTY_CART');

      expect(await ordersOf(buyer.userId)).toBe(1);
      expect(await count('FROM order_items WHERE order_id = $1', [orderId])).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
      expect(await stockOf(p)).toBe(5); // لا تنزيل عند الإنشاء (عقد 2026-09-14)
    });

    it('[CRITICAL] two identical requests arrive concurrently → exactly one order (deterministic barrier on the cart line)', async () => {
      const p = await product('retry-conc', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const { rows } = await db.query<{ id: string }>(
        'SELECT ci.id FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1',
        [buyer.userId],
      );

      // الحاجز على سطر السلة: الطلب الأول يقفل السلة ويقرأ ثم يقف عند
      // `DELETE FROM cart_items`؛ الثاني يقف عند قفل السلة نفسها.
      const barrier = await holdRowLock('cart_items', rows[0]!.id);
      const first = placeOrder(buyer.token);
      await waitForBlocked(1);
      const second = placeOrder(buyer.token);
      await waitForBlocked(2);
      await barrier.release();

      const [a, b] = await Promise.all([first, second]);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([201, 400]);
      const failed = a.status === 400 ? a : b;
      expect(failed.body.error.code).toBe('EMPTY_CART');
      expect(await ordersOf(buyer.userId)).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
    });

    it('failure after the cart lock (product read throws) → nothing written, cart intact, retry succeeds', async () => {
      const p = await product('fail-after-lock', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      vi.spyOn(productRepo, 'findByIds').mockRejectedValueOnce(new Error('injected: after cart lock'));
      const failed = await placeOrder(buyer.token);
      expect(failed.status).toBe(500);

      expect(await ordersOf(buyer.userId)).toBe(0);
      expect(await cartLinesOf(buyer.userId)).toBe(1);
      vi.restoreAllMocks();
      expect((await placeOrder(buyer.token)).status).toBe(201);
      expect(await ordersOf(buyer.userId)).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
    });

    it('failure after order + items + history insert but before cart clearing → all rolled back, retry creates exactly one order', async () => {
      const p = await product('fail-before-clear', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 3 }]);

      vi.spyOn(cartRepo, 'clear').mockRejectedValueOnce(new Error('injected: before cart clear'));
      const failed = await placeOrder(buyer.token);
      expect(failed.status).toBe(500);

      expect(await ordersOf(buyer.userId)).toBe(0);
      expect(await count('FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id = $1', [buyer.userId])).toBe(0);
      expect(await count('FROM order_status_history h JOIN orders o ON o.id = h.order_id WHERE o.user_id = $1', [buyer.userId])).toBe(0);
      expect(await cartLinesOf(buyer.userId)).toBe(1);

      vi.restoreAllMocks();
      const retry = await placeOrder(buyer.token);
      expect(retry.status).toBe(201);
      expect(await ordersOf(buyer.userId)).toBe(1);
      expect(await count('FROM order_items WHERE order_id = $1', [retry.body.data.id])).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
    });

    it('failure immediately before COMMIT → fully rolled back, retry succeeds once', async () => {
      const p = await product('fail-commit', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      failNextCommit();
      const failed = await placeOrder(buyer.token);
      expect(failed.status).toBe(500);
      expect(await ordersOf(buyer.userId)).toBe(0);
      expect(await cartLinesOf(buyer.userId)).toBe(1);

      vi.restoreAllMocks();
      expect((await placeOrder(buyer.token)).status).toBe(201);
      expect(await ordersOf(buyer.userId)).toBe(1);
    });

    it('failure during response serialization (after COMMIT) → committed; client sees 500; retry is deterministic EMPTY_CART, no duplicate', async () => {
      const p = await product('fail-serialize', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      responsePatch = failNextResponse('/api/orders', 'throw');
      const lost = await placeOrder(buyer.token);
      expect(lost.status).toBe(500);
      responsePatch.restore();

      // الالتزام وقع: الطلب موجود والسلة فارغة رغم أن العميل رأى فشلاً.
      expect(await ordersOf(buyer.userId)).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);

      const retry = await placeOrder(buyer.token);
      expect(retry.status).toBe(400);
      expect(retry.body.error.code).toBe('EMPTY_CART');
      expect(await ordersOf(buyer.userId)).toBe(1);
    });

    it('response dropped on the wire (client timeout after COMMIT) → retry is EMPTY_CART, the order is visible in GET /orders', async () => {
      const p = await product('fail-drop', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      responsePatch = failNextResponse('/api/orders', 'drop');
      await expect(placeOrder(buyer.token)).rejects.toThrow();
      responsePatch.restore();

      expect(await ordersOf(buyer.userId)).toBe(1);
      const retry = await placeOrder(buyer.token);
      expect(retry.status).toBe(400);
      expect(retry.body.error.code).toBe('EMPTY_CART');
      const mine = await api.get('/api/orders').set(authed(buyer.token)).expect(200);
      expect(mine.body.data.items).toHaveLength(1);
    });

    it('a NEW cart line added while checkout is in flight waits for the checkout (FK KEY SHARE vs FOR UPDATE) and survives', async () => {
      const p1 = await product('inflight-new-a', 5);
      const p2 = await product('inflight-new-b', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p1, quantity: 1 }]);

      // الحاجز على صفّ الزبون: إدراج الطلب يحتاج `KEY SHARE` على `users`
      // (المفتاح الأجنبي) فيقف بعد قراءة السلة وقبل إدراج الطلب.
      const barrier = await holdRowLock('users', buyer.userId);
      const inflight = placeOrder(buyer.token);
      await waitForBlocked(1);

      // سطرٌ جديد من جهاز آخر: إدراجه يحتاج `KEY SHARE` على صفّ السلة الذي
      // يمسكه الطلب `FOR UPDATE` — فينتظر هو الآخر (جلستان محجوبتان).
      const adding = api.post('/api/cart').set(authed(buyer.token)).send({ productId: p2, quantity: 1 }).then((r) => r);
      await waitForBlocked(2);
      await barrier.release();

      const [res, added] = await Promise.all([inflight, adding]);
      expect(res.status).toBe(201);
      expect(added.status).toBe(200);
      expect(await count('FROM order_items WHERE order_id = $1', [res.body.data.id])).toBe(1);
      // السطر الجديد أُدرج بعد تفريغ السلة فبقي فيها — لا يضيع.
      expect(await cartLinesOf(buyer.userId)).toBe(1);
      const { rows: left } = await db.query<{ product_id: string }>(
        'SELECT ci.product_id FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1',
        [buyer.userId],
      );
      expect(left[0]!.product_id).toBe(p2);
    });

    it('[CA-6] an INCREMENT of an existing line while checkout is in flight waits for the checkout and survives in the cart', async () => {
      // كان `ON CONFLICT … DO UPDATE` على سطرٍ قائم لا يدرج صفّاً فلا يأخذ
      // `KEY SHARE` على صفّ السلة كما يأخذه السطر الجديد؛ يلتزم فوراً ثم يمحوه
      // تفريغ السلة: الوحدة المضافة (بردّ ٢٠٠) لا في الطلب ولا في السلة —
      // نتيجةٌ لا تساوي أيّ ترتيبٍ تسلسلي (STEP 57، CA-6). الزيادة تأخذ القفل
      // نفسه الآن فتنتظر كالسطر الجديد: الطلب ثم الإضافة.
      const p = await product('inflight-inc', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      const barrier = await holdRowLock('users', buyer.userId);
      const inflight = placeOrder(buyer.token);
      await waitForBlocked(1);

      const adding = api.post('/api/cart').set(authed(buyer.token)).send({ productId: p, quantity: 1 }).then((r) => r);
      await settledOrBlocked(adding, 2);
      await barrier.release();

      const [res, added] = await Promise.all([inflight, adding]);
      expect(res.status).toBe(201);
      expect(added.status).toBe(200);
      const { rows } = await db.query<{ quantity: number }>('SELECT quantity FROM order_items WHERE order_id = $1', [res.body.data.id]);
      expect(rows[0]!.quantity).toBe(1);
      // الزيادة وصلت بعد الطلب فصارت سلة الطلب التالي — بكميّتها هي لا بمجموعٍ مع ما طُلب.
      expect(added.body.data.item.quantity).toBe(1);
      const { rows: left } = await db.query<{ product_id: string; quantity: number }>(
        'SELECT ci.product_id, ci.quantity FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id = $1',
        [buyer.userId],
      );
      expect(left).toEqual([{ product_id: p, quantity: 1 }]);
    });

    it('[CA-6 pinned] a PATCH of a locked line during checkout: the order keeps the locked quantity and the cart ends empty — the checkout-then-edit state', async () => {
      // تعديل الكمية لا يُدرج صفّاً ولا يغيّر مفتاحاً فلا ينتظر، والحالة
      // النهائية = «الطلب ثم التعديل» (التعديل على سطرٍ استُهلك). ما يخالف
      // الترتيب التسلسلي هو ردّ الـ٢٠٠ وحده — يصف السلة قبل الطلب.
      const p = await product('inflight-patch', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const line = (await api.get('/api/cart').set(authed(buyer.token)).expect(200)).body.data.items[0];

      const barrier = await holdRowLock('users', buyer.userId);
      const inflight = placeOrder(buyer.token);
      await waitForBlocked(1);
      const patched = await api.patch(`/api/cart/${line.id}`).set(authed(buyer.token)).send({ quantity: 3 });
      await barrier.release();
      const res = await inflight;

      expect(patched.status).toBe(200);
      expect(res.status).toBe(201);
      const { rows } = await db.query<{ quantity: number }>('SELECT quantity FROM order_items WHERE order_id = $1', [res.body.data.id]);
      expect(rows[0]!.quantity).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
    });

    it('[CA-6 pinned] a DELETE of a locked line during checkout: the line is still ordered — the checkout-then-delete state', async () => {
      const p = await product('inflight-delete', 5);
      const buyer = await registerAndLogin();
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const line = (await api.get('/api/cart').set(authed(buyer.token)).expect(200)).body.data.items[0];

      const barrier = await holdRowLock('users', buyer.userId);
      const inflight = placeOrder(buyer.token);
      await waitForBlocked(1);
      const removed = await api.delete(`/api/cart/${line.id}`).set(authed(buyer.token));
      await barrier.release();
      const res = await inflight;

      expect(removed.status).toBe(200);
      expect(res.status).toBe(201);
      expect(await count('FROM order_items WHERE order_id = $1 AND product_id = $2', [res.body.data.id, p])).toBe(1);
      expect(await cartLinesOf(buyer.userId)).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٥ — قبول الإدارة
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 5 — PATCH /admin/orders/:id/status approval retries', () => {
    it('approval repeated sequentially → stock once, dispatched_at unchanged, one notification (history +1 = CA-4)', async () => {
      const p = await product('approve-repeat', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 2 }]);

      expect((await approve(orderId)).status).toBe(200);
      const first = await orderRow(orderId);
      expect((await approve(orderId)).status).toBe(200);
      const second = await orderRow(orderId);

      expect(await stockOf(p)).toBe(3);
      expect(second.status).toBe('OUT_FOR_DELIVERY');
      expect(second.dispatched_at?.toISOString()).toBe(first.dispatched_at?.toISOString());
      expect(await notificationsOf(orderId)).toBe(1);
      expect(await historyOf(orderId, 'OUT_FOR_DELIVERY')).toBe(2);
    });

    it('[CRITICAL] two approvals concurrently (barrier on the order row) → 200/200, stock once, one notification', async () => {
      const p = await product('approve-conc', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 2 }]);

      const barrier = await holdRowLock('orders', orderId);
      const a = approve(orderId);
      await waitForBlocked(1);
      const b = approve(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);

      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(await stockOf(p)).toBe(3);
      expect(await notificationsOf(orderId, 'orderAccepted')).toBe(1);
    });

    it('failure after stock deduction but before the status update → stock restored by rollback, order still pending, retry deducts once', async () => {
      const p = await product('approve-fail-status', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 2 }]);

      vi.spyOn(orderRepo, 'updateStatus').mockRejectedValueOnce(new Error('injected: after stock deduction'));
      expect((await approve(orderId)).status).toBe(500);

      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      expect(await historyOf(orderId, 'OUT_FOR_DELIVERY')).toBe(0);
      expect(await notificationsOf(orderId)).toBe(0);

      vi.restoreAllMocks();
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(3);
    });

    it('failure after the status update but before COMMIT (dispatch stamp throws) → rolled back, retry safe', async () => {
      const p = await product('approve-fail-dispatch', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 1 }]);

      vi.spyOn(orderRepo, 'markDispatched').mockRejectedValueOnce(new Error('injected: after status update'));
      expect((await approve(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');

      vi.restoreAllMocks();
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).dispatched_at).not.toBeNull();
    });

    it('notification creation failure → the whole approval rolls back (notification is transactional), retry approves once', async () => {
      const p = await product('approve-fail-notify', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 1 }]);

      vi.spyOn(notificationRepo, 'create').mockRejectedValueOnce(new Error('injected: notification insert'));
      expect((await approve(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      expect(await notificationsOf(orderId)).toBe(0);

      vi.restoreAllMocks();
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect(await notificationsOf(orderId, 'orderAccepted')).toBe(1);
    });

    it('COMMIT failure → rolled back; retry deducts once', async () => {
      const p = await product('approve-fail-commit', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 1 }]);

      failNextCommit();
      expect((await approve(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      // لا إشعار ولا سجلّ حالة يسبقان الالتزام — كلاهما داخل المعاملة.
      expect(await notificationsOf(orderId)).toBe(0);
      expect(await historyOf(orderId, 'OUT_FOR_DELIVERY')).toBe(0);

      vi.restoreAllMocks();
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect(await notificationsOf(orderId, 'orderAccepted')).toBe(1);
    });

    it('post-commit read failure → client sees 500 although committed; retry is a same-status no-op (stock once)', async () => {
      const p = await product('approve-fail-postread', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 1 }]);

      // القراءة الأخيرة تجري على المجمّع (`db`) بعد الالتزام — نُسقطها وحدها.
      const original = orderRepo.findById.bind(orderRepo);
      vi.spyOn(orderRepo, 'findById').mockImplementation(async (client, id) => {
        if (client === db) throw new Error('injected: post-commit read');
        return original(client, id);
      });
      expect((await approve(orderId)).status).toBe(500);
      vi.restoreAllMocks();

      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');

      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect(await notificationsOf(orderId)).toBe(1);
    });

    it('response dropped after COMMIT → admin retries → stock once, status correct', async () => {
      const p = await product('approve-drop', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 1 }]);

      responsePatch = failNextResponse('/api/admin/orders', 'drop');
      await expect(approve(orderId)).rejects.toThrow();
      responsePatch.restore();

      expect(await stockOf(p)).toBe(4);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٦ — الرفض والإرجاع
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 6 — rejection / restoration retries', () => {
    it('pending rejection never touches stock, even when repeated', async () => {
      const p = await product('reject-pending', 5);
      const { orderId } = await pendingOrder([{ productId: p, quantity: 2 }]);
      expect((await reject(orderId)).status).toBe(200);
      expect((await reject(orderId, 'سبب آخر')).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await notificationsOf(orderId, 'orderRejected')).toBe(1);
    });

    it('post-approval rejection restores once; duplicate rejection does not restore again', async () => {
      const p = await product('reject-approved', 5);
      const { orderId } = await dispatchedOrder([{ productId: p, quantity: 2 }]);
      expect(await stockOf(p)).toBe(3);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect(await notificationsOf(orderId, 'orderRejected')).toBe(1);
    });

    it('[CRITICAL] concurrent post-approval rejections (barrier on the order row) → restored exactly once', async () => {
      const p = await product('reject-conc', 5);
      const { orderId } = await dispatchedOrder([{ productId: p, quantity: 2 }]);

      const barrier = await holdRowLock('orders', orderId);
      const a = reject(orderId);
      await waitForBlocked(1);
      const b = reject(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect(await notificationsOf(orderId, 'orderRejected')).toBe(1);
    });

    it('failure after restoration but before the status update → restoration rolled back; retry restores once', async () => {
      const p = await product('reject-fail-after-restore', 5);
      const { orderId } = await dispatchedOrder([{ productId: p, quantity: 2 }]);
      expect(await stockOf(p)).toBe(3);

      vi.spyOn(orderRepo, 'updateStatus').mockRejectedValueOnce(new Error('injected: after restoration'));
      expect((await reject(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(3);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');

      vi.restoreAllMocks();
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
    });

    it('failure before restoration (lock acquisition throws) → nothing changes; retry restores once', async () => {
      const p = await product('reject-fail-before', 5);
      const { orderId } = await dispatchedOrder([{ productId: p, quantity: 2 }]);

      vi.spyOn(orderRepo, 'lockForUpdate').mockRejectedValueOnce(new Error('injected: before restoration'));
      expect((await reject(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(3);

      vi.restoreAllMocks();
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
    });

    it('rejection response dropped after COMMIT → retry after uncertainty → still restored exactly once', async () => {
      const p = await product('reject-drop', 5);
      const { orderId } = await dispatchedOrder([{ productId: p, quantity: 2 }]);

      responsePatch = failNextResponse('/api/admin/orders', 'drop');
      await expect(reject(orderId)).rejects.toThrow();
      responsePatch.restore();
      expect(await stockOf(p)).toBe(5);

      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٧ — تأكيد الاستلام
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 7 — POST /orders/:id/confirm-receipt retries', () => {
    it('repeated confirmation → 409 ALREADY_CONFIRMED; points and completion once; delivered_at unchanged', async () => {
      const p = await product('receipt-repeat', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      const first = await orderRow(orderId);
      const again = await confirmReceipt(buyer.token, orderId);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_CONFIRMED');

      const second = await orderRow(orderId);
      expect(second.status).toBe('COMPLETED');
      expect(second.delivered_at?.toISOString()).toBe(first.delivered_at?.toISOString());
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
      expect(await notificationsOf(orderId, 'receiptReminder')).toBe(1);
    });

    it('[CRITICAL] concurrent confirmations (barrier on the order row) → completion and points once', async () => {
      const p = await product('receipt-conc', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      const barrier = await holdRowLock('orders', orderId);
      const a = confirmReceipt(buyer.token, orderId);
      await waitForBlocked(1);
      const b = confirmReceipt(buyer.token, orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);

      // كلاهما اجتاز الفحص المسبق قبل القفل؛ الثاني يرى `COMPLETED` تحت القفل
      // فيصير «الحالة نفسها» بلا أثر — ٢٠٠ لا ٤٠٩ (موثَّق، لا مضاعفة).
      expect([ra.status, rb.status].every((s) => s === 200)).toBe(true);
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
      expect(await notificationsOf(orderId, 'receiptReminder')).toBe(1);
      expect((await orderRow(orderId)).status).toBe('COMPLETED');
    });

    it('failure around the points award → completion rolled back; retry completes and awards exactly once', async () => {
      const p = await product('receipt-fail-points', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      vi.spyOn(pointsRepo, 'award').mockRejectedValueOnce(new Error('injected: points award'));
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(500);
      const row = await orderRow(orderId);
      expect(row.status).toBe('OUT_FOR_DELIVERY');
      expect(row.delivered_at).toBeNull();
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(0);

      vi.restoreAllMocks();
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
      expect((await orderRow(orderId)).delivered_at).not.toBeNull();
    });

    it('failure around delivered_at → rolled back (status, points, notification all absent); retry once', async () => {
      const p = await product('receipt-fail-delivered', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      vi.spyOn(orderRepo, 'markDelivered').mockRejectedValueOnce(new Error('injected: delivered_at'));
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(500);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
      expect(await historyOf(orderId, 'COMPLETED')).toBe(0);
      expect(await notificationsOf(orderId, 'receiptReminder')).toBe(0);

      vi.restoreAllMocks();
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
    });

    it('notification failure → transactional rollback; retry succeeds once', async () => {
      const p = await product('receipt-fail-notify', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      vi.spyOn(notificationRepo, 'create').mockRejectedValueOnce(new Error('injected: notification'));
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(500);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(0);

      vi.restoreAllMocks();
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
      expect(await notificationsOf(orderId, 'receiptReminder')).toBe(1);
    });

    it('response dropped after COMMIT → retry → 409 ALREADY_CONFIRMED; points once', async () => {
      const p = await product('receipt-drop', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);

      responsePatch = failNextResponse('/api/orders', 'drop');
      await expect(confirmReceipt(buyer.token, orderId)).rejects.toThrow();
      responsePatch.restore();

      const retry = await confirmReceipt(buyer.token, orderId);
      expect(retry.status).toBe(409);
      expect(retry.body.error.code).toBe('ALREADY_CONFIRMED');
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
    });

    it('the unique index is the last guard: a direct duplicate award for the same order is absorbed', async () => {
      const p = await product('receipt-index', 5, 20_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: p, quantity: 1 }]);
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      const dup = await pointsRepo.award(db, {
        userId: buyer.userId,
        label: 'نقاط شراء',
        amount: 10,
        reason: 'order_received',
        orderId,
      });
      expect(dup).toBeNull();
      expect(await pointsOf(buyer.userId, 'order_received')).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٨ — مزايا المستويات
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 8 — POST /points/rewards/:levelKey/claim retries', () => {
    async function customerWith(points: number) {
      const user = await registerAndLogin();
      await db.query(
        `INSERT INTO points_ledger (user_id, label, amount, reason) VALUES ($1, 'رصيد اختبار', $2, 'manual')`,
        [user.userId, points],
      );
      return user;
    }
    const claim = (token: string, level = 'explorer') =>
      api.post(`/api/points/rewards/${level}/claim`).set(authed(token)).then((r) => r);
    /** «أُنشئ الآن» لا يصل الحمولةَ — الرسالة وحدها تفرّق (انظر `claimReward`). */
    const isCreated = (r: { body: { message: string } }) => r.body.message === 'سُجّلت مزيّتك';
    const redemptionsOf = (userId: string) => count('FROM loyalty_reward_redemptions WHERE user_id = $1', [userId]);
    const claimNotificationsOf = (userId: string) =>
      count(`FROM notifications WHERE user_id = $1 AND type = 'rewardClaimed'`, [userId]);

    it('sequential duplicate claim → same row, created=false, one notification', async () => {
      const user = await customerWith(100);
      const a = await claim(user.token);
      const b = await claim(user.token);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(isCreated(a)).toBe(true);
      expect(isCreated(b)).toBe(false);
      expect(b.body.data.claimedAt).toBe(a.body.data.claimedAt);
      expect(await redemptionsOf(user.userId)).toBe(1);
      expect(await claimNotificationsOf(user.userId)).toBe(1);
    });

    it('[CRITICAL] concurrent duplicate claims (speculative-insert barrier on the unique key) → one row, one notification', async () => {
      const user = await customerWith(100);
      // إدراجٌ غير ملتزَم على (الزبون، المستوى): كلا الطلبين يقف عند الفهرس.
      const barrier = await holdSpeculativeInsert(
        `INSERT INTO loyalty_reward_redemptions (user_id, level_key, kind, percent, cap_amount)
         VALUES ($1, 'explorer', 'discount', 3, 5000)`,
        [user.userId],
      );
      const a = claim(user.token);
      await waitForBlocked(1);
      const b = claim(user.token);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect([isCreated(ra), isCreated(rb)].filter(Boolean)).toHaveLength(1);
      expect(await redemptionsOf(user.userId)).toBe(1);
      expect(await claimNotificationsOf(user.userId)).toBe(1);
    });

    it('[RF-2] failure after the redemption insert but before the claim notification → retry must still yield exactly one notification', async () => {
      const user = await customerWith(100);
      vi.spyOn(notificationRepo, 'create').mockRejectedValueOnce(new Error('injected: claim notification'));
      const failed = await claim(user.token);
      expect(failed.status).toBe(500);
      vi.restoreAllMocks();

      const retry = await claim(user.token);
      expect(retry.status).toBe(200);
      expect(await redemptionsOf(user.userId)).toBe(1);
      // الأثر المقصود من المطالبة: صفّ واحد **وإشعار واحد** — لا صفر ولا اثنان.
      expect(await claimNotificationsOf(user.userId)).toBe(1);
    });

    it('response dropped after the claim committed → retry returns the same row without a second notification', async () => {
      const user = await customerWith(100);
      responsePatch = failNextResponse('/api/points/rewards', 'drop');
      await expect(claim(user.token)).rejects.toThrow();
      responsePatch.restore();
      expect(await redemptionsOf(user.userId)).toBe(1);

      const retry = await claim(user.token);
      expect(retry.status).toBe(200);
      expect(isCreated(retry)).toBe(false);
      expect(await redemptionsOf(user.userId)).toBe(1);
      expect(await claimNotificationsOf(user.userId)).toBe(1);
    });

    it('order creation failing after the discount consumption → consumption rolled back; retry consumes exactly once', async () => {
      const user = await customerWith(100);
      expect((await claim(user.token)).status).toBe(200);
      const p = await product('reward-consume', 5, 50_000);
      await fillCart(user.token, [{ productId: p, quantity: 1 }]);

      vi.spyOn(cartRepo, 'clear').mockRejectedValueOnce(new Error('injected: after reward consumption'));
      expect((await placeOrder(user.token)).status).toBe(500);
      const open = await db.query<{ consumed_at: Date | null }>(
        'SELECT consumed_at FROM loyalty_reward_redemptions WHERE user_id = $1',
        [user.userId],
      );
      expect(open.rows[0]!.consumed_at).toBeNull();

      vi.restoreAllMocks();
      const ok = await placeOrder(user.token);
      expect(ok.status).toBe(201);
      expect(Number(ok.body.data.discount)).toBe(1500); // ٣٪ من ٥٠٬٠٠٠
      const after = await db.query<{ consumed_at: Date | null; consumed_order_id: string }>(
        'SELECT consumed_at, consumed_order_id FROM loyalty_reward_redemptions WHERE user_id = $1',
        [user.userId],
      );
      expect(after.rows[0]!.consumed_at).not.toBeNull();
      expect(after.rows[0]!.consumed_order_id).toBe(ok.body.data.id);
    });

    it('a second consumption is refused inside the transaction and the order is dropped (REWARD_ALREADY_USED)', async () => {
      const user = await customerWith(100);
      expect((await claim(user.token)).status).toBe(200);
      const p = await product('reward-double', 5, 50_000);
      await fillCart(user.token, [{ productId: p, quantity: 1 }]);
      // الحجز يُقرأ ويُقفل، ثم يُستهلك خارج المعاملة بين الخطوتين (حقنٌ يمثّل
      // سباقاً لم يعد ممكناً بفضل القفل — يحرس أن الشرط الأخير ما زال قائماً).
      const original = loyaltyRewardsService.consumeReserved.bind(loyaltyRewardsService);
      vi.spyOn(loyaltyRewardsService, 'consumeReserved').mockImplementationOnce(async (client, redemptionId, orderId) => {
        await client.query('UPDATE loyalty_reward_redemptions SET consumed_at = now() WHERE id = $1', [redemptionId]);
        return original(client, redemptionId, orderId);
      });
      const res = await placeOrder(user.token);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REWARD_ALREADY_USED');
      expect(await ordersOf(user.userId)).toBe(0);
      expect(await cartLinesOf(user.userId)).toBe(1);
      const row = await db.query<{ consumed_at: Date | null }>(
        'SELECT consumed_at FROM loyalty_reward_redemptions WHERE user_id = $1',
        [user.userId],
      );
      expect(row.rows[0]!.consumed_at).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٩ — خصم عيد الميلاد
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 9 — birthday discount consumption retries', () => {
    async function birthdayCustomer() {
      const seed = await product('bday-seed', 50, 10_000);
      const { buyer, orderId } = await dispatchedOrder([{ productId: seed, quantity: 1 }]);
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      const today = await storeToday();
      await api.post('/api/birthday').set(authed(buyer.token)).send({ day: today.day, month: today.month }).expect(200);
      return buyer;
    }
    const usageOf = (userId: string) => count('FROM birthday_discount_usage WHERE user_id = $1', [userId]);

    it('failed order after the discount was consumed → usage rolled back; retry consumes exactly once with the discount', async () => {
      const buyer = await birthdayCustomer();
      const p = await product('bday-fail', 5, 100_000);
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);

      vi.spyOn(cartRepo, 'clear').mockRejectedValueOnce(new Error('injected: after birthday consumption'));
      expect((await placeOrder(buyer.token)).status).toBe(500);
      expect(await usageOf(buyer.userId)).toBe(0);

      vi.restoreAllMocks();
      const ok = await placeOrder(buyer.token);
      expect(ok.status).toBe(201);
      expect(Number(ok.body.data.discount)).toBe(5_000); // ٥٪ من ١٠٠٬٠٠٠
      expect(await usageOf(buyer.userId)).toBe(1);
    });

    it('a second order on the same birthday gets no discount (once per store year) and cannot consume twice', async () => {
      const buyer = await birthdayCustomer();
      const p = await product('bday-twice', 5, 100_000);
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const first = await placeOrder(buyer.token);
      expect(first.status).toBe(201);
      expect(Number(first.body.data.discount)).toBe(5_000);

      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const second = await placeOrder(buyer.token);
      expect(second.status).toBe(201);
      expect(Number(second.body.data.discount)).toBe(0);
      expect(await usageOf(buyer.userId)).toBe(1);
    });

    it('[CRITICAL] eligibility read before a concurrent consumption commits → the unique key refuses, the order is dropped, cart intact', async () => {
      const buyer = await birthdayCustomer();
      const p = await product('bday-race', 5, 100_000);
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      const { rows } = await db.query<{ id: string }>('SELECT id FROM orders WHERE user_id = $1 LIMIT 1', [buyer.userId]);

      // إدراجٌ غير ملتزَم لاستهلاك هذه السنة: الأهلية تُقرأ «متاحة» (الصفّ غير
      // مرئي)، ثم يقف `consume` عند الفهرس الفريد حتى يلتزم المنافس.
      const client = await db.connect();
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO birthday_discount_usage (user_id, order_id, used_year, amount)
         VALUES ($1, $2, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Baghdad'))::int, 1)`,
        [buyer.userId, rows[0]!.id],
      );
      const barrier = {
        async release() {
          if (!openBarriers.has(barrier)) return;
          openBarriers.delete(barrier);
          await client.query('COMMIT');
          client.release();
        },
      };
      openBarriers.add(barrier);

      const inflight = placeOrder(buyer.token);
      await waitForBlocked(1);
      await barrier.release();
      const res = await inflight;
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('BIRTHDAY_DISCOUNT_USED');
      expect(await ordersOf(buyer.userId)).toBe(1); // طلب الأهلية فقط
      expect(await cartLinesOf(buyer.userId)).toBe(1);
      expect(await usageOf(buyer.userId)).toBe(1);
      await db.query('DELETE FROM birthday_discount_usage WHERE user_id = $1', [buyer.userId]);
    });

    it('response dropped after a discounted order committed → retry is EMPTY_CART, usage stays one', async () => {
      const buyer = await birthdayCustomer();
      const p = await product('bday-drop', 5, 100_000);
      await fillCart(buyer.token, [{ productId: p, quantity: 1 }]);
      responsePatch = failNextResponse('/api/orders', 'drop');
      await expect(placeOrder(buyer.token)).rejects.toThrow();
      responsePatch.restore();
      expect(await usageOf(buyer.userId)).toBe(1);
      const retry = await placeOrder(buyer.token);
      expect(retry.status).toBe(400);
      expect(retry.body.error.code).toBe('EMPTY_CART');
      expect(await usageOf(buyer.userId)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٠ — التقييمات والوسائط
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 10 — review submit / resubmit / moderation retries', () => {
    async function completedOrder(productId: string) {
      const { buyer, orderId } = await dispatchedOrder([{ productId, quantity: 1 }]);
      expect((await confirmReceipt(buyer.token, orderId)).status).toBe(200);
      return { buyer, orderId };
    }
    const submit = (token: string, body: Record<string, unknown>) =>
      api.post('/api/reviews').set(authed(token)).send(body).then((r) => r);
    const moderate = (reviewId: string, body: Record<string, unknown>) =>
      api.patch(`/api/admin/reviews/${reviewId}/moderate`).set(authed(adminToken)).send(body).then((r) => r);
    const reviewsOf = (userId: string, productId: string) =>
      count('FROM reviews WHERE user_id = $1 AND product_id = $2', [userId, productId]);
    const reviewNotificationsOf = (reviewId: string, type: string) =>
      count('FROM notifications WHERE review_id = $1 AND type = $2', [reviewId, type]);
    const reviewStatus = async (reviewId: string) =>
      (await db.query<{ status: string }>('SELECT status FROM reviews WHERE id = $1', [reviewId])).rows[0]!.status;

    it('submit twice sequentially → 409 REVIEW_EXISTS, one review', async () => {
      const p = await product('review-seq', 5);
      const { buyer, orderId } = await completedOrder(p);
      const body = { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' };
      expect((await submit(buyer.token, body)).status).toBe(201);
      const dup = await submit(buyer.token, body);
      expect(dup.status).toBe(409);
      expect(dup.body.error.code).toBe('REVIEW_EXISTS');
      expect(await reviewsOf(buyer.userId, p)).toBe(1);
    });

    it('[CRITICAL] concurrent submits (speculative-insert barrier on uq_reviews_user_product) → one 201, one 409, one review', async () => {
      const p = await product('review-conc', 5);
      const { buyer, orderId } = await completedOrder(p);
      const body = { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' };
      const barrier = await holdSpeculativeInsert(
        `INSERT INTO reviews (user_id, order_id, product_id, product_name, rating, comment, photo_urls, customer_name)
         VALUES ($1, $2, $3, 'x', 5, 'x', '{}', 'x')`,
        [buyer.userId, orderId, p],
      );
      const a = submit(buyer.token, body);
      await waitForBlocked(1);
      const b = submit(buyer.token, body);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);
      expect([ra.status, rb.status].sort()).toEqual([201, 409]);
      expect((ra.status === 409 ? ra : rb).body.error.code).toBe('REVIEW_EXISTS');
      expect(await reviewsOf(buyer.userId, p)).toBe(1);
    });

    it('submit response dropped after commit → retry → 409 REVIEW_EXISTS; the photo association is not duplicated', async () => {
      const p = await product('review-drop', 5);
      const { buyer, orderId } = await completedOrder(p);
      const photo = await registerUploadedPhoto(buyer.userId);
      const body = { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط', photoUrls: [photo] };
      responsePatch = failNextResponse('/api/reviews', 'drop');
      await expect(submit(buyer.token, body)).rejects.toThrow();
      responsePatch.restore();
      expect(await reviewsOf(buyer.userId, p)).toBe(1);
      const retry = await submit(buyer.token, body);
      expect(retry.status).toBe(409);
      const { rows } = await db.query<{ photo_urls: string[] }>('SELECT photo_urls FROM reviews WHERE user_id = $1 AND product_id = $2', [buyer.userId, p]);
      expect(rows[0]!.photo_urls).toEqual([photo]);
    });

    it('approval repeated sequentially → points once, one reviewApproved notification', async () => {
      const p = await product('moderate-seq', 5);
      const { buyer, orderId } = await completedOrder(p);
      const created = await submit(buyer.token, { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' });
      const reviewId = created.body.data.id as string;
      expect((await moderate(reviewId, { status: 'approved' })).status).toBe(200);
      expect((await moderate(reviewId, { status: 'approved' })).status).toBe(200);
      expect(await pointsOf(buyer.userId, 'review_approved')).toBe(1);
      expect(await reviewNotificationsOf(reviewId, 'reviewApproved')).toBe(1);
    });

    it('[RF-3] two approvals concurrently (barrier on the order row) → points once AND one reviewApproved notification', async () => {
      const p = await product('moderate-conc', 5);
      const { buyer, orderId } = await completedOrder(p);
      const created = await submit(buyer.token, { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' });
      const reviewId = created.body.data.id as string;

      const barrier = await holdRowLock('orders', orderId);
      const a = moderate(reviewId, { status: 'approved' });
      await waitForBlocked(1);
      const b = moderate(reviewId, { status: 'approved' });
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.status).toBe(200);
      expect(rb.status).toBe(200);
      expect(await pointsOf(buyer.userId, 'review_approved')).toBe(1);
      expect(await reviewNotificationsOf(reviewId, 'reviewApproved')).toBe(1);
    });

    it('approval failing after the points award (notification throws) → rolled back; retry awards once', async () => {
      const p = await product('moderate-fail', 5);
      const { buyer, orderId } = await completedOrder(p);
      const created = await submit(buyer.token, { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' });
      const reviewId = created.body.data.id as string;

      vi.spyOn(notificationRepo, 'create').mockRejectedValueOnce(new Error('injected: review notification'));
      expect((await moderate(reviewId, { status: 'approved' })).status).toBe(500);
      expect(await reviewStatus(reviewId)).toBe('pending');
      expect(await pointsOf(buyer.userId, 'review_approved')).toBe(0);

      vi.restoreAllMocks();
      expect((await moderate(reviewId, { status: 'approved' })).status).toBe(200);
      expect(await pointsOf(buyer.userId, 'review_approved')).toBe(1);
      expect(await reviewNotificationsOf(reviewId, 'reviewApproved')).toBe(1);
    });

    it('[RF-4] a resubmit racing an approval must not leave an approved-and-awarded review back in pending', async () => {
      const p = await product('resubmit-race', 5);
      const { buyer, orderId } = await completedOrder(p);
      const created = await submit(buyer.token, { orderId, productId: p, rating: 5, comment: 'تعليق كافٍ للنقاط' });
      const reviewId = created.body.data.id as string;
      expect((await moderate(reviewId, { status: 'rejected', rejectionReason: 'أعد الصياغة' })).status).toBe(200);

      // الاعتماد يقفل الطلب ويحدّث صفّ التقييم ثم يقف عند إدراج النقاط: إدراج
      // الدفتر يحتاج `KEY SHARE` على صفّ الزبون (المفتاح الأجنبي) الذي يمسكه
      // الحاجز `FOR UPDATE`. إعادةُ الإرسال تقرأ «مرفوض» الملتزَم فتجتاز الفحص
      // ثم تقف عند صفّ التقييم المقفول — جلستان محجوبتان بالترتيب المطلوب.
      const barrier = await holdRowLock('users', buyer.userId);
      const approval = moderate(reviewId, { status: 'approved' });
      await waitForBlocked(1);
      const resubmit = api
        .patch(`/api/reviews/${reviewId}`)
        .set(authed(buyer.token))
        .send({ rating: 4, comment: 'صياغة جديدة كافية' })
        .then((r) => r);
      await waitForBlocked(2);
      await barrier.release();
      const [ra, rr] = await Promise.all([approval, resubmit]);
      expect(ra.status).toBe(200);

      const status = await reviewStatus(reviewId);
      const awarded = await pointsOf(buyer.userId, 'review_approved');
      // إمّا رُفضت إعادةُ الإرسال (التقييم لم يعد مرفوضاً) أو نجحت — لكن لا
      // يجوز أن يكون التقييم «معلَّقاً» وله نقاط اعتماد في الدفتر.
      if (rr.status === 200) {
        expect(status).toBe('pending');
        expect(awarded).toBe(0);
      } else {
        expect(rr.status).toBe(400);
        expect(rr.body.error.code).toBe('REVIEW_NOT_REJECTED');
        expect(status).toBe('approved');
        expect(awarded).toBe(1);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١١ — أجهزة الدفع والإشعارات
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 11 — POST /devices and push delivery retries', () => {
    const register = (token: string, deviceToken: string) =>
      api.post('/api/devices').set(authed(token)).send({ token: deviceToken, platform: 'android' }).then((r) => r);
    const rowsForToken = (deviceToken: string) => count('FROM device_tokens WHERE token = $1', [deviceToken]);

    it('same token repeated → one row; retry after a dropped response → same row, created=false', async () => {
      const user = await registerAndLogin();
      const token = `fra-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      expect((await register(user.token, token)).body.data.created).toBe(true);
      expect((await register(user.token, token)).body.data.created).toBe(false);
      expect(await rowsForToken(token)).toBe(1);

      responsePatch = failNextResponse('/api/devices', 'drop');
      await expect(register(user.token, token)).rejects.toThrow();
      responsePatch.restore();
      const retry = await register(user.token, token);
      expect(retry.status).toBe(200);
      expect(retry.body.data.created).toBe(false);
      expect(await rowsForToken(token)).toBe(1);
    });

    it('[CRITICAL] the same token registered concurrently by two accounts → one row, owned by exactly one', async () => {
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      const token = `fra-shared-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      const barrier = await holdSpeculativeInsert(
        `INSERT INTO device_tokens (user_id, token, platform) VALUES ($1, $2, 'android')`,
        [a.userId, token],
      );
      const ra = register(a.token, token);
      await waitForBlocked(1);
      const rb = register(b.token, token);
      await waitForBlocked(2);
      await barrier.release();
      const [resA, resB] = await Promise.all([ra, rb]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(await rowsForToken(token)).toBe(1);
      const { rows } = await db.query<{ user_id: string; is_active: boolean }>('SELECT user_id, is_active FROM device_tokens WHERE token = $1', [token]);
      expect([a.userId, b.userId]).toContain(rows[0]!.user_id);
      expect(rows[0]!.is_active).toBe(true);
    });

    it('failed registration (DB throws) → no row; retry creates it', async () => {
      const user = await registerAndLogin();
      const token = `fra-fail-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      vi.spyOn(deviceTokenRepo, 'register').mockRejectedValueOnce(new Error('injected: device insert'));
      expect((await register(user.token, token)).status).toBe(500);
      expect(await rowsForToken(token)).toBe(0);
      vi.restoreAllMocks();
      expect((await register(user.token, token)).body.data.created).toBe(true);
    });

    it('in-app record committed, push provider throws → 201, record kept, no throw surfaces (best-effort push)', async () => {
      const user = await registerAndLogin();
      await register(user.token, `fra-push-${Math.random().toString(36).slice(2)}-${Date.now()}`);
      const provider = pushProvider();
      const send = vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('injected: provider down'));
      const res = await api
        .post('/api/admin/notifications')
        .set(authed(adminToken))
        .send({ userId: user.userId, title: 'عرض', body: 'نص' });
      expect(res.status).toBe(201);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await count(`FROM notifications WHERE user_id = $1 AND type = 'promotion'`, [user.userId])).toBe(1);
    });

    it('push succeeded but the response was dropped → an admin retry creates a second record and a second push (at-least-once, no dedupe)', async () => {
      const user = await registerAndLogin();
      await register(user.token, `fra-push2-${Math.random().toString(36).slice(2)}-${Date.now()}`);
      const provider = pushProvider();
      const send = vi.spyOn(provider, 'send');
      responsePatch = failNextResponse('/api/admin/notifications', 'drop');
      await expect(
        api.post('/api/admin/notifications').set(authed(adminToken)).send({ userId: user.userId, title: 'عرض', body: 'نص' }).then((r) => r),
      ).rejects.toThrow();
      responsePatch.restore();
      expect(await count(`FROM notifications WHERE user_id = $1 AND type = 'promotion'`, [user.userId])).toBe(1);

      const retry = await api
        .post('/api/admin/notifications')
        .set(authed(adminToken))
        .send({ userId: user.userId, title: 'عرض', body: 'نص' });
      expect(retry.status).toBe(201);
      expect(send).toHaveBeenCalledTimes(2);
      // العقد الحالي: لا مفتاح تكرار — إعادةُ الإرسال إشعارٌ ثانٍ (موثَّق).
      expect(await count(`FROM notifications WHERE user_id = $1 AND type = 'promotion'`, [user.userId])).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٢ — إشعارات الإدارة
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 12 — POST /admin/notifications (single + broadcast) retries', () => {
    const promoCount = (userId: string) => count(`FROM notifications WHERE user_id = $1 AND type = 'promotion'`, [userId]);

    it('unknown user → 404, nothing written', async () => {
      const res = await api
        .post('/api/admin/notifications')
        .set(authed(adminToken))
        .send({ userId: '00000000-0000-4000-8000-000000000000', title: 'عرض', body: 'نص' });
      expect(res.status).toBe(404);
    });

    it('broadcast to explicit users writes all records in one statement; a partial target failure writes nothing', async () => {
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      // هدفٌ زائف يُحقن بين حسم الجمهور والكتابة: الإدراج الواحد (UNNEST) يسقط
      // بالمفتاح الأجنبي فلا يُكتب لأحد — كلٌّ أو لا شيء.
      const original = audienceRepo.ids.bind(audienceRepo);
      vi.spyOn(audienceRepo, 'ids').mockImplementationOnce(async (client, audience, tz) => [
        ...(await original(client, audience, tz)),
        '00000000-0000-4000-8000-000000000000',
      ]);
      const failed = await api
        .post('/api/admin/notifications/broadcast')
        .set(authed(adminToken))
        .send({ audience: 'users', userIds: [a.userId, b.userId], title: 'بثّ', body: 'نص' });
      expect(failed.status).toBe(404);
      expect(failed.body.error.code).toBe('RELATED_NOT_FOUND');
      expect(await promoCount(a.userId)).toBe(0);
      expect(await promoCount(b.userId)).toBe(0);

      vi.restoreAllMocks();
      const ok = await api
        .post('/api/admin/notifications/broadcast')
        .set(authed(adminToken))
        .send({ audience: 'users', userIds: [a.userId, b.userId], title: 'بثّ', body: 'نص' });
      expect(ok.status).toBe(201);
      expect(ok.body.data.recipients).toBe(2);
      expect(await promoCount(a.userId)).toBe(1);
      expect(await promoCount(b.userId)).toBe(1);
    });

    it('broadcast: records committed, push provider throws → 201 with push counts zero, records kept', async () => {
      const a = await registerAndLogin();
      const provider = pushProvider();
      vi.spyOn(provider, 'send').mockRejectedValueOnce(new Error('injected: provider down'));
      await api.post('/api/devices').set(authed(a.token)).send({ token: `fra-bc-${Date.now()}-${Math.random()}`, platform: 'android' }).expect(200);
      const res = await api
        .post('/api/admin/notifications/broadcast')
        .set(authed(adminToken))
        .send({ audience: 'users', userIds: [a.userId], title: 'بثّ', body: 'نص' });
      expect(res.status).toBe(201);
      expect(res.body.data.recipients).toBe(1);
      expect(res.body.data.push.delivered).toBe(0);
      expect(await promoCount(a.userId)).toBe(1);
    });

    it('broadcast retried after a dropped response → every recipient gets a second record (at-least-once — documented contract, CA-7)', async () => {
      const a = await registerAndLogin();
      const b = await registerAndLogin();
      const body = { audience: 'users', userIds: [a.userId, b.userId], title: 'بثّ', body: 'نص' };
      responsePatch = failNextResponse('/api/admin/notifications/broadcast', 'drop');
      await expect(api.post('/api/admin/notifications/broadcast').set(authed(adminToken)).send(body).then((r) => r)).rejects.toThrow();
      responsePatch.restore();
      expect(await promoCount(a.userId)).toBe(1);
      const retry = await api.post('/api/admin/notifications/broadcast').set(authed(adminToken)).send(body);
      expect(retry.status).toBe(201);
      expect(await promoCount(a.userId)).toBe(2);
      expect(await promoCount(b.userId)).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٣ — حدود فشل الرفع
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 13 — upload failure boundaries', () => {
    const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const upload = (token: string) =>
      api.post('/api/uploads').set(authed(token)).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }).field('purpose', 'review').then((r) => r);
    const mediaRowsOf = (userId: string) => count('FROM media_files WHERE uploaded_by = $1', [userId]);

    it('file saved, DB row insert fails → orphan blob on disk, no row (retained; no cleanup by contract), retry creates a second blob + row', async () => {
      const user = await registerAndLogin();
      const saved = vi.spyOn(storage, 'save');
      vi.spyOn(mediaRepo, 'create').mockRejectedValueOnce(new Error('injected: media row'));
      expect((await upload(user.token)).status).toBe(500);
      expect(saved).toHaveBeenCalledTimes(1);
      expect(await mediaRowsOf(user.userId)).toBe(0);
      // الملف الأول بقي على القرص بلا صفّ (احتفاظٌ موثَّق، لا تنظيف)، والثاني
      // ملفٌ آخر بمفتاحٍ آخر — لا يُعاد استعمال المفتاح اليتيم.
      const orphan = await (saved.mock.results[0]!.value as Promise<{ storageKey: string }>);

      vi.restoreAllMocks();
      const ok = await upload(user.token);
      expect(ok.status).toBe(201);
      expect(await mediaRowsOf(user.userId)).toBe(1);
      const { rows } = await db.query<{ storage_key: string }>('SELECT storage_key FROM media_files WHERE uploaded_by = $1', [user.userId]);
      expect(rows[0]!.storage_key).not.toBe(orphan.storageKey);
      expect(await count('FROM media_files WHERE storage_key = $1', [orphan.storageKey])).toBe(0);
    });

    it('storage write fails → no row, no orphan; retry succeeds', async () => {
      const user = await registerAndLogin();
      vi.spyOn(storage, 'save').mockRejectedValueOnce(new Error('injected: disk full'));
      expect((await upload(user.token)).status).toBe(500);
      expect(await mediaRowsOf(user.userId)).toBe(0);
      vi.restoreAllMocks();
      expect((await upload(user.token)).status).toBe(201);
      expect(await mediaRowsOf(user.userId)).toBe(1);
    });

    it('upload committed, response dropped → the client retries → two rows/blobs, both counted against the daily quota (documented)', async () => {
      const user = await registerAndLogin();
      responsePatch = failNextResponse('/api/uploads', 'drop');
      await expect(upload(user.token)).rejects.toThrow();
      responsePatch.restore();
      expect(await mediaRowsOf(user.userId)).toBe(1);
      expect((await upload(user.token)).status).toBe(201);
      expect(await mediaRowsOf(user.userId)).toBe(2);
      const used = await mediaRepo.bytesUploadedSince(db, user.userId, new Date(Date.now() - 60_000));
      expect(used).toBe(2 * PNG.byteLength);
    });

    it('visual-slot image set/clear are idempotent single statements: repeating them is a no-op, clearing twice → 200', async () => {
      const { rows } = await db.query<{ id: string }>(`SELECT id FROM visual_slots ORDER BY slot_key LIMIT 1`);
      const slotId = rows[0]!.id;
      const url = await registerUploadedSlotImage();
      const set = (u: string) => api.put(`/api/admin/visual-slots/${slotId}/image`).set(authed(adminToken)).send({ url: u });
      expect((await set(url)).status).toBe(200);
      expect((await set(url)).status).toBe(200);
      const after = await db.query<{ image_url: string | null }>('SELECT image_url FROM visual_slots WHERE id = $1', [slotId]);
      expect(after.rows[0]!.image_url).toBe(url);
      const clear = () => api.delete(`/api/admin/visual-slots/${slotId}/image`).set(authed(adminToken));
      expect((await clear()).status).toBe(200);
      expect((await clear()).status).toBe(200);
      const cleared = await db.query<{ image_url: string | null }>('SELECT image_url FROM visual_slots WHERE id = $1', [slotId]);
      expect(cleared.rows[0]!.image_url).toBeNull();
      // الملف يبقى في القاعدة (لا حذف للوسائط بالعقد).
      expect(await count('FROM media_files WHERE url = $1', [url])).toBe(1);
    });
  });
});
