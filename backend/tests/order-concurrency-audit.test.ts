import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { notificationRepo } from '../src/repositories/notificationsRepo.js';
import { orderRepo } from '../src/repositories/orderRepo.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin, seedTestCatalog } from './helpers.js';

/**
 * تدقيق تزامن الطلبات والمخزون (2026-09-21) — سباقاتٌ **حتمية** لا احتمالية.
 *
 * ═══ الحاجز ═══ معاملةُ تحكّمٍ تمسك قفل الصفّ الحرج (`FOR UPDATE` على المنتج أو
 * على الطلب)، فيتوقّف كلُّ طلبٍ متنافس عند نقطة القفل نفسها في PostgreSQL.
 * الاختبار لا يفترض توقيتاً: يراقب `pg_stat_activity` حتى يرى الطلبَ
 * **منتظراً قفلاً** فعلاً، ثم يطلق التالي، ثم يحرّر الحاجز. PostgreSQL يمنح
 * القفل للمنتظرين بترتيب الطابور، فترتيبُ الإطلاق هو ترتيبُ التنفيذ — وهكذا
 * يُختبر «أ ثم ب» و«ب ثم أ» بالحرف لا بالحظّ.
 *
 * ═══ العقد المُختبَر ═══ (`orderService`، قرار 2026-09-14)
 *   الإرسال لا يمسّ المخزون → القبول (الانتظار → قيد التوصيل) يقفل الطلب ثم
 *   المنتجات بترتيب المعرّف ويُنزّل كاملاً أو لا شيء → رفضُ المنتظر لا يمسّ
 *   المخزون → رفضُ ما قُبل يُرجعه مرةً واحدة → المكتمل والمرفوض نهائيان.
 */

// ── حاجز التزامن ──

/** الحواجز المفتوحة — تُحرَّر في `afterEach` حتماً كي لا يُبقي اختبارٌ فاشل قفلاً معلَّقاً. */
const openBarriers = new Set<{ release(): Promise<void> }>();

/** يمسك قفل صفٍّ في معاملة تحكّم مستقلّة حتى يُطلَق. */
async function holdRowLock(table: 'products' | 'orders', id: string) {
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
 * ينتظر حتى يكون عدد جلسات هذه القاعدة المنتظرة قفلاً = `n` بالضبط.
 *
 * انتظارُ شرطٍ لا انتظارُ وقت: يفحص الحالة الفعلية في PostgreSQL ويفشل صراحةً
 * إن لم تتحقّق خلال السقف (لا يمرّ بصمت).
 */
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

// ── مساعدات الطلب ──

describe('Orders + stock concurrency audit', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    await db.query(`DELETE FROM order_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'CONC %')`);
    await db.query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE name LIKE 'CONC %')`);
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE 'CONC %'`);
  });

  async function product(name: string, stock: number, price = 1000) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active)
       VALUES ($1, 'وصف', $4, $2, $3, TRUE) RETURNING id`,
      [`CONC ${name}`, catalog.categoryId, stock, price],
    );
    return rows[0]!.id;
  }

  async function stockOf(id: string) {
    const { rows } = await db.query<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id]);
    return Number(rows[0]!.stock);
  }

  async function orderRow(orderId: string) {
    const { rows } = await db.query<{ status: string; total: string; products_total: string; dispatched_at: Date | null; delivered_at: Date | null }>(
      'SELECT status, total, products_total, dispatched_at, delivered_at FROM orders WHERE id = $1',
      [orderId],
    );
    return rows[0]!;
  }

  async function historyCount(orderId: string, status?: string) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM order_status_history WHERE order_id = $1 ${status ? 'AND status = $2' : ''}`,
      status ? [orderId, status] : [orderId],
    );
    return rows[0]!.n;
  }

  async function notificationCount(orderId: string, type?: string) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE order_id = $1 ${type ? 'AND type = $2' : ''}`,
      type ? [orderId, type] : [orderId],
    );
    return rows[0]!.n;
  }

  const ORDER_BODY = () => ({ governorateId: catalog.governorateId, fullAddress: 'بغداد، الكرادة', phone: '07700000000' });

  async function submitOrder(lines: Array<{ productId: string; quantity: number; optionValue?: string }>) {
    const buyer = await registerAndLogin();
    for (const line of lines) {
      await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`).send(line).expect(200);
    }
    const res = await api.post('/api/orders').set('Authorization', `Bearer ${buyer.token}`).send(ORDER_BODY()).expect(201);
    return { orderId: res.body.data.id as string, buyer };
  }

  /**
   * [CRITICAL] `supertest` كسول: الطلب لا يُرسل قبل `.then()`/`.end()`. الحاجز
   * يحتاج طلباً **قد انطلق** فعلاً ليقف عند القفل، فتُحوَّل هنا إلى وعودٍ حقيقية
   * تبدأ فور الاستدعاء.
   */
  const transition = (orderId: string, body: Record<string, unknown>) =>
    api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send(body)
      .then((res) => res);
  const approve = (orderId: string) => transition(orderId, { status: 'OUT_FOR_DELIVERY' });
  const reject = (orderId: string, note = 'سبب الرفض') => transition(orderId, { status: 'REJECTED', note });
  const complete = (orderId: string) => transition(orderId, { status: 'COMPLETED' });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٣ — القبول المفرد
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 3 — single approval', () => {
    it('approval deducts every line exactly once and the financial snapshot is untouched', async () => {
      const a = await product('single-a', 10, 1000);
      const b = await product('single-b', 10, 2500);
      const { orderId } = await submitOrder([
        { productId: a, quantity: 2 },
        { productId: b, quantity: 3 },
      ]);
      const before = await orderRow(orderId);
      expect(Number(before.products_total)).toBe(2 * 1000 + 3 * 2500);
      expect(Number(before.total)).toBe(2 * 1000 + 3 * 2500 + 4000);

      expect((await approve(orderId)).status).toBe(200);

      expect(await stockOf(a)).toBe(8);
      expect(await stockOf(b)).toBe(7);
      const after = await orderRow(orderId);
      expect(after.status).toBe('OUT_FOR_DELIVERY');
      expect(after.total).toBe(before.total);
      expect(after.products_total).toBe(before.products_total);
      expect(after.dispatched_at).not.toBeNull();
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(1);
      expect(await notificationCount(orderId, 'orderAccepted')).toBe(1);
    });

    it('a price change while pending does not re-price the order and does not affect the deduction', async () => {
      const p = await product('reprice', 5, 1000);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      await db.query('UPDATE products SET price = 99999 WHERE id = $1', [p]);
      expect((await approve(orderId)).status).toBe(200);
      const row = await orderRow(orderId);
      expect(Number(row.products_total)).toBe(2000);
      expect(await stockOf(p)).toBe(3);
    });

    it('a product deactivated while pending: approval still consumes its stock (documented observation)', async () => {
      // لا فحصَ `is_active` عند القبول — الصفّ موجود والكمية محجوزة للزبون.
      // يُوثَّق هنا كسلوكٍ قائم لا كحكم؛ القرار تجاري (انظر التقرير).
      const p = await product('inactive', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 1 }]);
      await db.query('UPDATE products SET is_active = FALSE WHERE id = $1', [p]);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
    });

    it('stock set to zero while pending → approval fails, nothing deducted, order stays pending', async () => {
      const p = await product('zeroed', 3);
      const { orderId } = await submitOrder([{ productId: p, quantity: 1 }]);
      await db.query('UPDATE products SET stock = 0 WHERE id = $1', [p]);
      const res = await approve(orderId);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await stockOf(p)).toBe(0);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(0);
      expect(await notificationCount(orderId)).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٤ — طلبان يتنافسان على آخر قطعة (حتمي، بالترتيبين)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 4 — two orders competing for the last unit (deterministic barrier)', () => {
    it.each([['A then B'], ['B then A']])(
      '[CRITICAL] stock=1, two pending orders of 1 — %s: exactly one approval consumes, the other fails safely',
      async (ordering) => {
        const p = await product(`last-unit ${ordering}`, 1);
        const A = await submitOrder([{ productId: p, quantity: 1 }]);
        const B = await submitOrder([{ productId: p, quantity: 1 }]);
        const [first, second] = ordering === 'A then B' ? [A, B] : [B, A];

        // الحاجز: صفّ المنتج مقفول، فكلا القبولين يقف عند `SELECT … FOR UPDATE`.
        const barrier = await holdRowLock('products', p);
        const firstReq = approve(first.orderId);
        await waitForBlocked(1);
        const secondReq = approve(second.orderId);
        await waitForBlocked(2);
        await barrier.release();

        const [r1, r2] = await Promise.all([firstReq, secondReq]);
        // الطابور: الأول يفوز، والثاني يقرأ المخزون المحدَّث فيفشل.
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(409);
        expect(r2.body.error.code).toBe('INSUFFICIENT_STOCK');

        expect(await stockOf(p)).toBe(0);
        expect((await orderRow(first.orderId)).status).toBe('OUT_FOR_DELIVERY');
        expect((await orderRow(second.orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
        expect(await historyCount(second.orderId, 'OUT_FOR_DELIVERY')).toBe(0);
        expect(await notificationCount(second.orderId)).toBe(0);
      },
    );

    it('stock=5, two orders of 3 — the loser fails with the post-commit availability (2), not the stale one', async () => {
      const p = await product('five-three', 5);
      const A = await submitOrder([{ productId: p, quantity: 3 }]);
      const B = await submitOrder([{ productId: p, quantity: 3 }]);
      const barrier = await holdRowLock('products', p);
      const ra = approve(A.orderId);
      await waitForBlocked(1);
      const rb = approve(B.orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [a, b] = await Promise.all([ra, rb]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(409);
      expect(b.body.message).toContain('2');
      expect(await stockOf(p)).toBe(2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٥ — الطلب نفسه يُقبل مرتين
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 5 — same order approved twice', () => {
    it('sequential retry: one deduction, one accepted-notification, dispatched once', async () => {
      const p = await product('retry-seq', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      expect((await approve(orderId)).status).toBe(200);
      const firstDispatch = (await orderRow(orderId)).dispatched_at;
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(2);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
      expect((await orderRow(orderId)).dispatched_at).toEqual(firstDispatch);
      expect(await notificationCount(orderId)).toBe(1);
    });

    it('[CRITICAL] concurrent duplicate approval (deterministic): both 200, one deduction, one notification', async () => {
      const p = await product('retry-conc', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      // الحاجز على صفّ **الطلب**: كلاهما يقف عند `lockForUpdate`.
      const barrier = await holdRowLock('orders', orderId);
      const r1 = approve(orderId);
      await waitForBlocked(1);
      const r2 = approve(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [a, b] = await Promise.all([r1, r2]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await stockOf(p)).toBe(2);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
      expect(await notificationCount(orderId)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٦ — قبول ضدّ رفض على الطلب نفسه (بالترتيبين)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 6 — approve vs reject race on one pending order', () => {
    it('approve wins the lock: it deducts; the queued reject then releases (post-approval rejection is a legal transition) — net zero, one release', async () => {
      const p = await product('race-approve-first', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      const barrier = await holdRowLock('orders', orderId);
      const ra = approve(orderId);
      await waitForBlocked(1);
      const rr = reject(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [a, r] = await Promise.all([ra, rr]);
      expect(a.status).toBe(200);
      expect(r.status).toBe(200);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await stockOf(p)).toBe(5);
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(1);
      expect(await historyCount(orderId, 'REJECTED')).toBe(1);
      expect(await notificationCount(orderId, 'orderAccepted')).toBe(1);
      expect(await notificationCount(orderId, 'orderRejected')).toBe(1);
    });

    it('reject wins the lock: the queued approve is refused (REJECTED is terminal) — stock never moved', async () => {
      const p = await product('race-reject-first', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      const barrier = await holdRowLock('orders', orderId);
      const rr = reject(orderId);
      await waitForBlocked(1);
      const ra = approve(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [r, a] = await Promise.all([rr, ra]);
      expect(r.status).toBe(200);
      expect(a.status).toBe(409);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await stockOf(p)).toBe(5);
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(0);
      expect(await notificationCount(orderId)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٧ — الرفض قبل القبول
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 7 — reject before approval never touches stock', () => {
    it('single, duplicate (sequential) and concurrent (deterministic) rejection: stock_before === stock_after', async () => {
      const p = await product('reject-pending', 4);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await notificationCount(orderId, 'orderRejected')).toBe(1);

      const p2 = await product('reject-pending-conc', 4);
      const second = await submitOrder([{ productId: p2, quantity: 2 }]);
      const barrier = await holdRowLock('orders', second.orderId);
      const r1 = reject(second.orderId);
      await waitForBlocked(1);
      const r2 = reject(second.orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [x, y] = await Promise.all([r1, r2]);
      expect([x.status, y.status]).toEqual([200, 200]);
      expect(await stockOf(p2)).toBe(4);
      expect((await orderRow(second.orderId)).status).toBe('REJECTED');
      expect(await notificationCount(second.orderId, 'orderRejected')).toBe(1);
    });

    it('a rejected order cannot be approved afterwards (terminal), stock untouched', async () => {
      const p = await product('reject-then-approve', 4);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      expect((await reject(orderId)).status).toBe(200);
      expect((await approve(orderId)).status).toBe(409);
      expect((await complete(orderId)).status).toBe(409);
      expect(await stockOf(p)).toBe(4);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٨ — إرجاع المخزون بعد القبول: مرةً واحدة مهما تكرّر
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 8 — post-approval restoration happens exactly once', () => {
    it('10 → approve 3 → 7 → reject → 10; a second reject restores nothing', async () => {
      const p = await product('restore', 10);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(7);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(10);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(10);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await notificationCount(orderId, 'orderRejected')).toBe(1);
    });

    it('[CRITICAL] concurrent duplicate rejection of an approved order (deterministic): restored exactly once', async () => {
      const p = await product('restore-conc', 10);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(7);
      const barrier = await holdRowLock('orders', orderId);
      const r1 = reject(orderId);
      await waitForBlocked(1);
      const r2 = reject(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [a, b] = await Promise.all([r1, r2]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await stockOf(p)).toBe(10);
      expect((await orderRow(orderId)).status).toBe('REJECTED');
      expect(await notificationCount(orderId, 'orderRejected')).toBe(1);
    });

    it.each([['COMPLETED first'], ['REJECTED first']])(
      'reject vs complete on an out-for-delivery order — %s: exactly one terminal state, stock matches the winner',
      async (ordering) => {
        const p = await product(`terminal-race ${ordering}`, 10);
        const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
        expect((await approve(orderId)).status).toBe(200);
        expect(await stockOf(p)).toBe(7);

        const barrier = await holdRowLock('orders', orderId);
        const first = ordering === 'COMPLETED first' ? complete(orderId) : reject(orderId);
        await waitForBlocked(1);
        const second = ordering === 'COMPLETED first' ? reject(orderId) : complete(orderId);
        await waitForBlocked(2);
        await barrier.release();
        const [r1, r2] = await Promise.all([first, second]);
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(409);
        const row = await orderRow(orderId);
        if (ordering === 'COMPLETED first') {
          expect(row.status).toBe('COMPLETED');
          expect(await stockOf(p)).toBe(7);
          expect(row.delivered_at).not.toBeNull();
        } else {
          expect(row.status).toBe('REJECTED');
          expect(await stockOf(p)).toBe(10);
          expect(row.delivered_at).toBeNull();
        }
        expect(await historyCount(orderId, 'COMPLETED') + await historyCount(orderId, 'REJECTED')).toBe(1);
      },
    );

    it('a completed order cannot be rejected afterwards — no restoration of sold stock', async () => {
      const p = await product('completed-terminal', 10);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      expect((await approve(orderId)).status).toBe(200);
      expect((await complete(orderId)).status).toBe(200);
      expect((await reject(orderId)).status).toBe(409);
      expect(await stockOf(p)).toBe(7);
      expect((await orderRow(orderId)).status).toBe('COMPLETED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٩ — ذرّية الطلب متعدّد الأسطر
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 9 — multi-item atomicity', () => {
    it.each([['first in lock order'], ['last in lock order']])(
      '[CRITICAL] A×2, B×3, C×1 with one short product (%s): nothing is deducted, order stays pending',
      async (position) => {
        const ids = await Promise.all([product(`atomic-1 ${position}`, 10), product(`atomic-2 ${position}`, 10), product(`atomic-3 ${position}`, 10)]);
        const sorted = [...ids].sort();
        const short = position === 'first in lock order' ? sorted[0]! : sorted[2]!;
        const others = sorted.filter((id) => id !== short);
        const { orderId } = await submitOrder([
          { productId: others[0]!, quantity: 2 },
          { productId: others[1]!, quantity: 3 },
          { productId: short, quantity: 1 },
        ]);
        await db.query('UPDATE products SET stock = 0 WHERE id = $1', [short]);

        const res = await approve(orderId);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
        expect(await stockOf(others[0]!)).toBe(10);
        expect(await stockOf(others[1]!)).toBe(10);
        expect(await stockOf(short)).toBe(0);
        expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
        expect(await historyCount(orderId)).toBe(1); // سطر الإنشاء فقط
        expect(await notificationCount(orderId)).toBe(0);

        // ويُقبل بعد تعويض النقص — التنزيل الكامل لكل الأسطر.
        await db.query('UPDATE products SET stock = 1 WHERE id = $1', [short]);
        expect((await approve(orderId)).status).toBe(200);
        expect(await stockOf(others[0]!)).toBe(8);
        expect(await stockOf(others[1]!)).toBe(7);
        expect(await stockOf(short)).toBe(0);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٠ — أسطر مكرّرة لمنتج واحد
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 10 — duplicate product lines', () => {
    it('cart merges the same product+option (UNIQUE NULLS NOT DISTINCT) — one line, summed quantity', async () => {
      const p = await product('dup-merge', 10);
      const buyer = await registerAndLogin();
      await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`).send({ productId: p, quantity: 2 }).expect(200);
      await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`).send({ productId: p, quantity: 3 }).expect(200);
      const cart = await api.get('/api/cart').set('Authorization', `Bearer ${buyer.token}`).expect(200);
      expect(cart.body.data.items).toHaveLength(1);
      expect(cart.body.data.items[0].quantity).toBe(5);
      const order = await api.post('/api/orders').set('Authorization', `Bearer ${buyer.token}`).send(ORDER_BODY()).expect(201);
      expect((await approve(order.body.data.id)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
    });

    it('two option lines of one product are summed at approval; the sum is what must fit', async () => {
      // بوّابة العربة تجمع على المنتج أيضاً، فالسطران يُقبلان بمخزون ٥ ثم
      // يُخفَّض إلى ٤ قبل القبول: ٥ > ٤ عند القبول.
      const p = await product('dup-options', 5);
      const { orderId } = await submitOrder([
        { productId: p, quantity: 2, optionValue: 'أحمر' },
        { productId: p, quantity: 3, optionValue: 'أزرق' },
      ]);
      await db.query('UPDATE products SET stock = 4 WHERE id = $1', [p]);
      const res = await approve(orderId);
      expect(res.status).toBe(409);
      expect(await stockOf(p)).toBe(4);
      await db.query('UPDATE products SET stock = 5 WHERE id = $1', [p]);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(0);
    });

    it('literal duplicate order_items rows (seeded directly) are aggregated per product, never double-locked', async () => {
      const p = await product('dup-rows', 10);
      const { orderId } = await submitOrder([{ productId: p, quantity: 2 }]);
      await db.query(
        `INSERT INTO order_items (order_id, product_id, product_name, price, quantity, line_total)
         SELECT order_id, product_id, product_name, price, 3, price * 3 FROM order_items WHERE order_id = $1`,
        [orderId],
      );
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١١ — لا حقل مالي أو كمّي من العميل
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 11 — client-controlled fields on approval', () => {
    it('the status body cannot carry stock, items, totals, or a different order/user', async () => {
      const p = await product('approval-body', 10, 1000);
      const { orderId, buyer } = await submitOrder([{ productId: p, quantity: 2 }]);
      const other = await submitOrder([{ productId: p, quantity: 1 }]);
      const before = await orderRow(orderId);
      const res = await api
        .patch(`/api/admin/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'OUT_FOR_DELIVERY',
          stock: 999,
          quantity: 100,
          items: [{ productId: p, quantity: 100, price: 1 }],
          total: 1,
          productsTotal: 1,
          discount: 5000,
          userId: other.buyer.userId,
          orderId: other.orderId,
          id: other.orderId,
        })
        .expect(200);
      expect(res.body.data.id).toBe(orderId);
      expect(await stockOf(p)).toBe(8);
      const after = await orderRow(orderId);
      expect(after.total).toBe(before.total);
      expect(after.products_total).toBe(before.products_total);
      expect((await orderRow(other.orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      const owner = await db.query<{ user_id: string }>('SELECT user_id FROM orders WHERE id = $1', [orderId]);
      expect(owner.rows[0]!.user_id).toBe(buyer.userId);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٢ — القاعدة نفسها ترفض المخزون السالب
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 12 — stock >= 0 is enforced by the database', () => {
    it('a direct write below zero is rejected by the CHECK constraint', async () => {
      const p = await product('negative', 1);
      await expect(db.query('UPDATE products SET stock = -1 WHERE id = $1', [p])).rejects.toMatchObject({ code: '23514' });
      await expect(db.query('UPDATE products SET stock = stock - 2 WHERE id = $1', [p])).rejects.toMatchObject({ code: '23514' });
      expect(await stockOf(p)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٣/١٤ — ترتيب الأقفال والجمود
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 13/14 — lock ordering and deadlock analysis', () => {
    it('the product lock query locks in id order at the plan level (LockRows above Sort)', async () => {
      const { rows } = await db.query<{ 'QUERY PLAN': string }>(
        `EXPLAIN (COSTS OFF) SELECT id, name, stock FROM products WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
        [[catalog.productIds[0], catalog.productIds[1]]],
      );
      const plan = rows.map((r) => r['QUERY PLAN']);
      expect(plan[0]).toBe('LockRows');
      expect(plan[1]).toMatch(/^\s+->\s+Sort$/);
    });

    it('[CRITICAL] two orders holding the same two products in opposite cart order serialize — no deadlock (40P01), both consistent', async () => {
      const ids = await Promise.all([product('deadlock-x', 10), product('deadlock-y', 10)]);
      const [lo, hi] = [...ids].sort() as [string, string];
      const A = await submitOrder([{ productId: lo, quantity: 1 }, { productId: hi, quantity: 1 }]);
      const B = await submitOrder([{ productId: hi, quantity: 1 }, { productId: lo, quantity: 1 }]);
      // الحاجز على المعرّف الأعلى: كلاهما يقفل الأدنى أولاً؛ الأول ينتظر الأعلى
      // عند الحاجز، والثاني ينتظر الأدنى عند الأول. لا دورة.
      const barrier = await holdRowLock('products', hi);
      const ra = approve(A.orderId);
      await waitForBlocked(1);
      const rb = approve(B.orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [a, b] = await Promise.all([ra, rb]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await stockOf(lo)).toBe(8);
      expect(await stockOf(hi)).toBe(8);
    });

    it('approval and post-approval rejection of different orders on shared products serialize without deadlock', async () => {
      const ids = await Promise.all([product('mixed-x', 10), product('mixed-y', 10)]);
      const [lo, hi] = [...ids].sort() as [string, string];
      const A = await submitOrder([{ productId: lo, quantity: 2 }, { productId: hi, quantity: 2 }]);
      const B = await submitOrder([{ productId: hi, quantity: 1 }, { productId: lo, quantity: 1 }]);
      expect((await approve(A.orderId)).status).toBe(200);
      const barrier = await holdRowLock('products', lo);
      const rr = reject(A.orderId);
      await waitForBlocked(1);
      const rb = approve(B.orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [r, b] = await Promise.all([rr, rb]);
      expect([r.status, b.status]).toEqual([200, 200]);
      expect(await stockOf(lo)).toBe(9);
      expect(await stockOf(hi)).toBe(9);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٥ — إعادة الإرسال (ضغطة مزدوجة / إعادة محاولة الشبكة)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 15 — duplicate submit of one cart (deterministic barrier on the cart row)', () => {
    it('[CRITICAL] two concurrent POST /orders from one cart → one order; the second sees an empty cart', async () => {
      const p = await product('double-submit', 10);
      const buyer = await registerAndLogin();
      await api.post('/api/cart').set('Authorization', `Bearer ${buyer.token}`).send({ productId: p, quantity: 2 }).expect(200);
      const { rows } = await db.query<{ id: string }>('SELECT id FROM carts WHERE user_id = $1', [buyer.userId]);
      const cartId = rows[0]!.id;

      const client = await db.connect();
      await client.query('BEGIN');
      await client.query('SELECT id FROM carts WHERE id = $1 FOR UPDATE', [cartId]);
      const submit = () =>
        api.post('/api/orders').set('Authorization', `Bearer ${buyer.token}`).send(ORDER_BODY()).then((r) => r);
      const first = submit();
      await waitForBlocked(1);
      const second = submit();
      await waitForBlocked(2);
      await client.query('ROLLBACK');
      client.release();

      const [a, b] = await Promise.all([first, second]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      const loser = a.status === 400 ? a : b;
      expect(loser.body.error.code).toBe('EMPTY_CART');
      const orders = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1', [buyer.userId]);
      expect(orders.rows[0]!.n).toBe(1);
      expect(await stockOf(p)).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٧ — تعديل المسؤول للمخزون ضدّ القبول
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 17 — manual admin stock edit vs approval (serialized; absolute-set semantics documented)', () => {
    const setStock = (id: string, stock: number) =>
      api.patch(`/api/admin/products/${id}`).set('Authorization', `Bearer ${adminToken}`).send({ stock }).then((res) => res);

    it('edit first, then approval: approval deducts from the edited value', async () => {
      const p = await product('admin-edit-first', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      const barrier = await holdRowLock('products', p);
      const edit = setStock(p, 10);
      await waitForBlocked(1);
      const appr = approve(orderId);
      await waitForBlocked(2);
      await barrier.release();
      const [e, a] = await Promise.all([edit, appr]);
      expect([e.status, a.status]).toEqual([200, 200]);
      expect(await stockOf(p)).toBe(7);
    });

    it('approval first, then edit: the admin\'s absolute value wins (last-write-wins, no negative, no torn state) — see CA-5', async () => {
      const p = await product('admin-edit-second', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      const barrier = await holdRowLock('products', p);
      const appr = approve(orderId);
      await waitForBlocked(1);
      const edit = setStock(p, 10);
      await waitForBlocked(2);
      await barrier.release();
      const [a, e] = await Promise.all([appr, edit]);
      expect([a.status, e.status]).toEqual([200, 200]);
      // القيمة المطلقة التي كتبها المسؤول هي النافذة — التنزيل (٣) لم يُطبَّق
      // فوقها. سلوكٌ قائم يُوثَّق لا يُصحَّح هنا (قرار: انظر التقرير CA-5).
      expect(await stockOf(p)).toBe(10);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٨ — فشلٌ داخل المعاملة ⇒ تراجعٌ كامل
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 18 — failure injection inside the approval transaction', () => {
    it('[CRITICAL] failure after stock deduction, before the status write → full rollback', async () => {
      const p = await product('fail-before-status', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      vi.spyOn(orderRepo, 'updateStatus').mockRejectedValueOnce(new Error('injected: status write failed'));
      const res = await approve(orderId);
      expect(res.status).toBe(500);
      expect(await stockOf(p)).toBe(5);
      expect((await orderRow(orderId)).status).toBe('PENDING_ADMIN_CONFIRMATION');
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(0);
      expect(await notificationCount(orderId)).toBe(0);
      // وبلا الحقن يمرّ عادياً.
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(2);
    });

    it('[CRITICAL] failure after the status write, before commit (notification insert) → stock and status both roll back', async () => {
      const p = await product('fail-after-status', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      vi.spyOn(notificationRepo, 'create').mockRejectedValueOnce(new Error('injected: notification failed'));
      const res = await approve(orderId);
      expect(res.status).toBe(500);
      expect(await stockOf(p)).toBe(5);
      const row = await orderRow(orderId);
      expect(row.status).toBe('PENDING_ADMIN_CONFIRMATION');
      expect(row.dispatched_at).toBeNull();
      expect(await historyCount(orderId, 'OUT_FOR_DELIVERY')).toBe(0);
      expect(await notificationCount(orderId)).toBe(0);
    });

    it('failure during post-approval rejection (after restoration, before status) → restoration rolls back', async () => {
      const p = await product('fail-restore', 5);
      const { orderId } = await submitOrder([{ productId: p, quantity: 3 }]);
      expect((await approve(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(2);
      vi.spyOn(orderRepo, 'updateStatus').mockRejectedValueOnce(new Error('injected'));
      expect((await reject(orderId)).status).toBe(500);
      expect(await stockOf(p)).toBe(2);
      expect((await orderRow(orderId)).status).toBe('OUT_FOR_DELIVERY');
      expect((await reject(orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(5);
    });

    it('the failed approval releases its locks — a competing approval proceeds normally afterwards', async () => {
      const p = await product('fail-releases-lock', 1);
      const A = await submitOrder([{ productId: p, quantity: 1 }]);
      const B = await submitOrder([{ productId: p, quantity: 1 }]);
      vi.spyOn(orderRepo, 'updateStatus').mockRejectedValueOnce(new Error('injected'));
      expect((await approve(A.orderId)).status).toBe(500);
      expect((await approve(B.orderId)).status).toBe(200);
      expect(await stockOf(p)).toBe(0);
      expect((await approve(A.orderId)).status).toBe(409);
    });
  });
});
