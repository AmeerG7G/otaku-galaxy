import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/database/pool.js';
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '../src/types/index.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  registerUploadedPhoto,
  seedTestCatalog,
  storeToday,
} from './helpers.js';

/**
 * تدقيق آلة الحالة وسلامة المجال (Audit #6 — 2026-09-26).
 *
 * السؤال الواحد: هل تنقل كل عمليةٍ تجارية النظامَ من حالةٍ صالحة إلى حالةٍ
 * صالحة — حتى حين تتقاطع أنظمةٌ فرعية (طلب × مخزون × «أعلمني عند توفره»،
 * طلب × نقاط × مزايا، حساب × إدارة) أو تصل الأحداث بترتيبٍ غير المعتاد؟
 *
 * ═══ ما في هذا الملف ═══
 *   • المرحلة ٢ — كل زوج (من، إلى) في آلة حالة الطلب (٣٦ حالة) مع آثاره:
 *     المخزون، النقاط، الإشعار، سجل الحالة. الجدول هنا منسوخ من العقد لا من
 *     الشيفرة، ثم يُقارن بالشيفرة — تغييرُ أحدهما وحده يُسقط الاختبار.
 *   • المرحلة ٤ — لقطة الطلب التاريخية بعد تعديل الكتالوج والتوصيل.
 *   • D1 — «حظر» العميل حالةٌ مقصودة لا قلبٌ للحالة الراهنة.
 *   • D2 — المخزون العائد برفض طلبٍ مقبول يخضع لعقد «أعلمني عند توفره».
 *   • ملاحظات مثبَّتة (CA-12 / CA-13 / CA-14) — سلوكٌ قائم ينتظر قراراً (CA-12 وCA-14
 *     حُسما في STEP 59 وصار اختبارهما عقداً)؛
 *     تُثبَّت كما هي حتى لا يتغيّر بلا قرار.
 *   • المرحلة ١٣ — ترتيبٌ غير معتاد للأحداث.
 *   • المرحلة ١٤ — مسحُ الثوابت على بيانات هذا الملف في القاعدة.
 *
 * كل حكم حالةُ قاعدةٍ بعد الحدث مباشرةً — لا مُهل ولا احتمالات.
 */

const PREFIX = 'DOMAIN6';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** العقد كما يكتبه §47 / order-status-flow — لا يُشتقّ من الشيفرة. */
const DOCUMENTED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_ADMIN_CONFIRMATION: ['OUT_FOR_DELIVERY', 'REJECTED'],
  CONFIRMED: ['PREPARING', 'REJECTED'],
  PREPARING: ['OUT_FOR_DELIVERY', 'REJECTED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'REJECTED'],
  COMPLETED: [],
  REJECTED: [],
};
const STATES = Object.keys(DOCUMENTED_TRANSITIONS) as OrderStatus[];
const PENDING: OrderStatus = 'PENDING_ADMIN_CONFIRMATION';

describe('Domain integrity audit (#6)', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;
  let governorateId: string;
  let shopper: Awaited<ReturnType<typeof registerAndLogin>>;
  const suiteUsers: string[] = [];

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee) VALUES ($1, 5000) RETURNING id`,
      [`${PREFIX} محافظة ${Date.now()}`],
    );
    governorateId = rows[0]!.id;
    shopper = await customer();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE '${PREFIX} %'`);
    await db.query('DELETE FROM governorates WHERE id = $1', [governorateId]);
  });

  // ── أدوات ────────────────────────────────────────────────────────────

  async function customer() {
    const c = await registerAndLogin();
    suiteUsers.push(c.userId);
    return c;
  }

  async function product(
    name: string,
    stock: number,
    price = 10_000,
    extra: { promo?: number } = {},
  ) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, stock, is_active,
                             has_delivery_promo, delivery_promo_amount)
       VALUES ($1, 'وصف', $2, $3, $4, TRUE, $5, $6) RETURNING id`,
      [`${PREFIX} ${name}`, price, catalog.categoryId, stock, Boolean(extra.promo), extra.promo ?? 0],
    );
    return rows[0]!.id;
  }

  async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const { rows } = await db.query(sql, params);
    return rows[0] as T;
  }

  const stockOf = async (id: string) =>
    Number((await one<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).stock);

  const count = async (sql: string, params: unknown[]) =>
    Number((await one<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${sql}`, params)).n);

  async function placeOrder(
    token: string,
    lines: Array<{ productId: string; quantity: number }>,
  ): Promise<string> {
    for (const line of lines) {
      await api.post('/api/cart').set(bearer(token)).send(line).expect(200);
    }
    const res = await api
      .post('/api/orders')
      .set(bearer(token))
      .send({ governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  function setStatus(orderId: string, status: OrderStatus, note?: string) {
    return api
      .patch(`/api/admin/orders/${orderId}/status`)
      .set(bearer(adminToken))
      .send(status === 'REJECTED' ? { status, note: note ?? 'domain audit' } : { status, ...(note ? { note } : {}) });
  }

  async function notificationsOf(token: string) {
    const res = await api.get('/api/notifications').set(bearer(token)).expect(200);
    return res.body.data.items as Array<{ type: string; productId: string | null; orderId: string | null }>;
  }

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٢ — آلة حالة الطلب: كل زوج (من، إلى)
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 2 — order state machine, every (from, to) pair', () => {
    let matrixProduct: string;

    beforeAll(async () => {
      matrixProduct = await product('matrix', 10_000);
    });

    it('the code transition map equals the documented contract', () => {
      expect(ORDER_STATUS_TRANSITIONS).toEqual(DOCUMENTED_TRANSITIONS);
    });

    /**
     * طلبٌ في الحالة المطلوبة عبر المسار الحقيقي حيث يوجد مسار. الحالتان
     * الموروثتان لا يُنتجهما أي مسار اليوم، فتُزرعان كما تركهما النموذج
     * القديم: المخزون نُزِّل عند الإنشاء ثم وقف الطلب في «تم تأكيده/التجهيز».
     */
    async function orderIn(state: OrderStatus): Promise<string> {
      const orderId = await placeOrder(shopper.token, [{ productId: matrixProduct, quantity: 1 }]);
      if (state === PENDING) return orderId;
      if (state === 'CONFIRMED' || state === 'PREPARING') {
        await db.query('UPDATE products SET stock = stock - 1 WHERE id = $1', [matrixProduct]);
        await db.query('UPDATE orders SET status = $2 WHERE id = $1', [orderId, state]);
        await db.query(
          'INSERT INTO order_status_history (order_id, status) VALUES ($1, $2)',
          [orderId, state],
        );
        return orderId;
      }
      if (state === 'REJECTED') {
        expect((await setStatus(orderId, 'REJECTED')).status).toBe(200);
        return orderId;
      }
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      if (state === 'COMPLETED') expect((await setStatus(orderId, 'COMPLETED')).status).toBe(200);
      return orderId;
    }

    async function effects(orderId: string) {
      return {
        status: (await one<{ status: OrderStatus }>('SELECT status FROM orders WHERE id = $1', [orderId])).status,
        stock: await stockOf(matrixProduct),
        points: await count('points_ledger WHERE order_id = $1', [orderId]),
        notifications: await count('notifications WHERE order_id = $1', [orderId]),
        history: await count('order_status_history WHERE order_id = $1', [orderId]),
      };
    }

    const allowed = (from: OrderStatus, to: OrderStatus) =>
      from === to || DOCUMENTED_TRANSITIONS[from].includes(to);
    // القبول = أول خروجٍ من الانتظار لغير الرفض؛ الرفضُ يُرجع ما استُهلك فقط.
    const stockDelta = (from: OrderStatus, to: OrderStatus) =>
      from === to ? 0 : from === PENDING && to !== 'REJECTED' ? -1 : to === 'REJECTED' && from !== PENDING ? 1 : 0;
    // «تم تأكيده ← التجهيز» مسارٌ موروث بلا إشعار (أُشعر القبول سابقاً).
    const notificationDelta = (from: OrderStatus, to: OrderStatus) =>
      from === to || (from === 'CONFIRMED' && to === 'PREPARING') ? 0 : 1;
    const pointsDelta = (from: OrderStatus, to: OrderStatus) =>
      to === 'COMPLETED' && from !== 'COMPLETED' ? 1 : 0;

    for (const from of STATES) {
      for (const to of STATES) {
        const verdict = allowed(from, to) ? (from === to ? 'no-op' : 'allowed') : 'refused';
        it(`[SM] ${from} → ${to}: ${verdict}`, async () => {
          const orderId = await orderIn(from);
          const before = await effects(orderId);
          const res = await setStatus(orderId, to);
          const after = await effects(orderId);

          if (!allowed(from, to)) {
            expect(res.status).toBe(409);
            expect(after).toEqual(before);
            return;
          }
          expect(res.status, JSON.stringify(res.body)).toBe(200);
          expect(after.status).toBe(to);
          // CA-4 (Audit #2): إعادة الحالة نفسها تُلحق سطراً في السجل.
          expect(after.history - before.history).toBe(1);
          expect(after.stock - before.stock).toBe(stockDelta(from, to));
          expect(after.points - before.points).toBe(pointsDelta(from, to));
          expect(after.notifications - before.notifications).toBe(notificationDelta(from, to));
        });
      }
    }

    it('[SM] a terminal order stays terminal under every customer and admin entry point', async () => {
      const completed = await orderIn('COMPLETED');
      const rejected = await orderIn('REJECTED');
      for (const orderId of [completed, rejected]) {
        const before = await effects(orderId);
        for (const to of STATES.filter((s) => s !== before.status)) {
          expect((await setStatus(orderId, to)).status).toBe(409);
        }
        const receipt = await api
          .post(`/api/orders/${orderId}/confirm-receipt`)
          .set(bearer(shopper.token));
        expect(receipt.status).toBe(409);
        expect(await effects(orderId)).toEqual(before);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ٤ / ١١ — اللقطة التاريخية: الكتالوج والتوصيل يتغيّران بعد الطلب
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 4/11 — the order is a snapshot of price, promo and delivery', () => {
    it('price, name, promo and governorate edits after checkout change neither the order nor its points', async () => {
      const buyer = await customer();
      const id = await product('snapshot', 10, 30_000, { promo: 1_000 });
      const orderId = await placeOrder(buyer.token, [{ productId: id, quantity: 2 }]);

      const created = (await api.get(`/api/orders/${orderId}`).set(bearer(buyer.token)).expect(200)).body.data;
      // 60 000 منتجات + 5 000 توصيل − 2 000 ترويج (٢ × ١ 000، دون سقف الرسوم).
      expect(created).toMatchObject({
        productsTotal: 60_000,
        deliveryFee: 5_000,
        deliveryDiscount: 2_000,
        discount: 0,
        total: 63_000,
      });

      await api.patch(`/api/admin/products/${id}`).set(bearer(adminToken))
        .send({ price: 50_000, nameAr: `${PREFIX} renamed`, hasDeliveryPromo: false }).expect(200);
      await api.patch(`/api/admin/governorates/${governorateId}`).set(bearer(adminToken))
        .send({ name: `${PREFIX} renamed gov ${Date.now()}`, deliveryFee: 9_000 }).expect(200);

      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect((await setStatus(orderId, 'COMPLETED')).status).toBe(200);

      const done = (await api.get(`/api/orders/${orderId}`).set(bearer(buyer.token)).expect(200)).body.data;
      expect(done).toMatchObject({
        productsTotal: created.productsTotal,
        deliveryFee: created.deliveryFee,
        deliveryDiscount: created.deliveryDiscount,
        discount: created.discount,
        total: created.total,
        province: created.province,
      });
      expect(done.items).toEqual(created.items);
      // النقاط من اللقطة: 60 000 ⇒ 30 (لا 100 000 ⇒ 50 بالسعر الجديد).
      const ledger = await one<{ amount: number }>(
        `SELECT amount FROM points_ledger WHERE order_id = $1 AND reason = 'order_received'`,
        [orderId],
      );
      expect(ledger.amount).toBe(30);

      await api.patch(`/api/admin/governorates/${governorateId}`).set(bearer(adminToken))
        .send({ deliveryFee: 5_000 }).expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // D2 — المخزون العائد برفض طلبٍ مقبول: عقد «أعلمني عند توفره»
  // ═══════════════════════════════════════════════════════════════════

  describe('D2 — stock returned by rejecting an approved order honours the restock contract (§42.5)', () => {
    const inTenDays = () => new Date(Date.now() + 10 * 86_400_000).toISOString();

    /** آخر قطعة تُباع وتُقبل، زبونٌ ينتظر، والإدارة تعلن موعداً متوقَّعاً. */
    async function soldOutWithWaiter(name: string, stock = 1) {
      const id = await product(name, stock);
      const buyers: string[] = [];
      for (let i = 0; i < stock; i += 1) {
        const orderId = await placeOrder(shopper.token, [{ productId: id, quantity: 1 }]);
        expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
        buyers.push(orderId);
      }
      expect(await stockOf(id)).toBe(0);

      const waiter = await customer();
      await api.post('/api/restock-subscriptions').set(bearer(waiter.token)).send({ productId: id }).expect(200);
      await api.patch(`/api/admin/products/${id}`).set(bearer(adminToken)).send({ restockAt: inTenDays() }).expect(200);
      expect((await notificationsOf(waiter.token)).filter((n) => n.productId === id).map((n) => n.type))
        .toEqual(['restockScheduled']);
      return { id, orders: buyers, waiter };
    }

    it('[D2] rejecting the approved order notifies the waiting customer, consumes the subscription and clears the expected date', async () => {
      const { id, orders, waiter } = await soldOutWithWaiter('restock-return');

      expect((await setStatus(orders[0]!, 'REJECTED', 'رفض الزبون الاستلام')).status).toBe(200);
      expect(await stockOf(id)).toBe(1);

      const notices = (await notificationsOf(waiter.token)).filter((n) => n.productId === id);
      expect(notices.map((n) => n.type).sort()).toEqual(['backInStock', 'restockScheduled']);
      expect(await count('restock_subscriptions WHERE product_id = $1', [id])).toBe(0);
      const row = await one<{ restock_at: Date | null }>('SELECT restock_at FROM products WHERE id = $1', [id]);
      expect(row.restock_at).toBeNull();
    });

    it('[D2] the stale date does not resurface when the returned unit sells out again', async () => {
      const { id, orders } = await soldOutWithWaiter('restock-resurface');
      expect((await setStatus(orders[0]!, 'REJECTED', 'رفض الزبون الاستلام')).status).toBe(200);

      const again = await placeOrder(shopper.token, [{ productId: id, quantity: 1 }]);
      expect((await setStatus(again, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(id)).toBe(0);

      const publicView = await api.get(`/api/catalog/products/${id}`).expect(200);
      expect(publicView.body.data.restockAt ?? null).toBeNull();
    });

    it('[D2] only the 0 → n transition notifies; a retried rejection and a second release notify nobody again', async () => {
      const { id, orders, waiter } = await soldOutWithWaiter('restock-once', 2);

      expect((await setStatus(orders[0]!, 'REJECTED', 'سبب')).status).toBe(200); // 0 → 1
      expect((await setStatus(orders[0]!, 'REJECTED', 'سبب')).status).toBe(200); // same status: no-op
      expect((await setStatus(orders[1]!, 'REJECTED', 'سبب')).status).toBe(200); // 1 → 2
      expect(await stockOf(id)).toBe(2);

      const backInStock = (await notificationsOf(waiter.token))
        .filter((n) => n.productId === id && n.type === 'backInStock');
      expect(backInStock).toHaveLength(1);
    });

    it('[D2] rejecting a PENDING order touches neither stock nor subscribers', async () => {
      const id = await product('restock-pending', 1);
      const orderId = await placeOrder(shopper.token, [{ productId: id, quantity: 1 }]);
      await db.query('UPDATE products SET stock = 0 WHERE id = $1', [id]);
      const waiter = await customer();
      await api.post('/api/restock-subscriptions').set(bearer(waiter.token)).send({ productId: id }).expect(200);

      expect((await setStatus(orderId, 'REJECTED', 'سبب')).status).toBe(200);
      expect(await stockOf(id)).toBe(0);
      expect(await count('restock_subscriptions WHERE product_id = $1', [id])).toBe(1);
      expect((await notificationsOf(waiter.token)).filter((n) => n.productId === id)).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // D1 — «حظر» حالةٌ مقصودة لا قلبٌ للحالة
  // ═══════════════════════════════════════════════════════════════════

  describe('D1 — suspending a customer is a target state, not a toggle', () => {
    const setActive = (userId: string, body?: { isActive: boolean }) => {
      const req = api.patch(`/api/admin/users/${userId}/active`).set(bearer(adminToken));
      return body ? req.send(body) : req;
    };
    const isActive = async (userId: string) =>
      (await one<{ is_active: boolean }>('SELECT is_active FROM users WHERE id = $1', [userId])).is_active;

    it('[D1] two «block» actions from stale dashboards (or a retry after a timeout) leave the customer blocked', async () => {
      const c = await customer();
      const first = await setActive(c.userId, { isActive: false });
      expect(first.status).toBe(200);
      expect(first.body.data.isActive).toBe(false);

      // المسؤول الثاني حمّل القائمة قبل الحظر فرأى «نشط» وضغط «حظر».
      const second = await setActive(c.userId, { isActive: false });
      expect(second.status).toBe(200);
      expect(second.body.data.isActive).toBe(false);
      expect(await isActive(c.userId)).toBe(false);
      expect((await api.get('/api/cart').set(bearer(c.token))).status).toBe(403);
    });

    it('[D1] a repeated «activate» keeps the customer active and does not revoke the session they opened in between', async () => {
      const c = await customer();
      await setActive(c.userId, { isActive: false }).expect(200);
      await setActive(c.userId, { isActive: true }).expect(200);
      const fresh = await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(200);

      const repeat = await setActive(c.userId, { isActive: true });
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.isActive).toBe(true);
      await api.get('/api/cart').set(bearer(fresh.body.data.token)).expect(200);
    });

    it('[D1] blocking revokes the session once; a repeated block changes nothing', async () => {
      const c = await customer();
      const version = async () =>
        (await one<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [c.userId])).token_version;
      const v0 = await version();
      await setActive(c.userId, { isActive: false }).expect(200);
      expect(await version()).toBe(v0 + 1);
      await setActive(c.userId, { isActive: false }).expect(200);
      expect(await version()).toBe(v0 + 1);
      expect(await isActive(c.userId)).toBe(false);
    });

    it('[D1] a non-boolean target is rejected, not coerced', async () => {
      const c = await customer();
      for (const isActiveValue of ['false', 0, null]) {
        const res = await api
          .patch(`/api/admin/users/${c.userId}/active`)
          .set(bearer(adminToken))
          .send({ isActive: isActiveValue });
        expect(res.status).toBe(400);
      }
      expect(await isActive(c.userId)).toBe(true);
    });

    it('[D1] mixed deployment: a request without a target still flips the state (older dashboard build)', async () => {
      const c = await customer();
      expect((await setActive(c.userId)).body.data.isActive).toBe(false);
      expect((await setActive(c.userId)).body.data.isActive).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ملاحظات مثبَّتة — تنتظر قراراً تجارياً (لا تغيير في الشيفرة)
  // ═══════════════════════════════════════════════════════════════════

  describe('Pinned observations — CA-12 and CA-14 decided in STEP 59 (now contracts)', () => {
    /**
     * CA-12 (قرار المالك، STEP 59): مزيّة الخصم وخصم الميلاد يُستهلكان عند **إنشاء**
     * الطلب، والرفض — أيّاً كان وقته — لا يُرجعهما. §40.8 يعد بألّا يُحرق خصمٌ على طلبٍ
     * **لم يُنشأ**: نفادُ المخزون عند الإرسال لا يُنشئ طلباً فلا يُحرق شيء
     * (`contract-closure.test.ts`). أمّا نفادُه بين الإنشاء والقبول فيقع على طلبٍ
     * موجود، ويبقى خصمه مستهلَكاً.
     */
    it('[CA-12 contract] a rejected order keeps the one-time loyalty discount and the yearly birthday discount consumed', async () => {
      const c = await customer();
      const big = await product('ca12-big', 5, 200_000);
      const first = await placeOrder(c.token, [{ productId: big, quantity: 1 }]);
      expect((await setStatus(first, 'OUT_FOR_DELIVERY')).status).toBe(200);
      await api.post(`/api/orders/${first}/confirm-receipt`).set(bearer(c.token)).expect(200);

      await api.post('/api/points/rewards/explorer/claim').set(bearer(c.token)).expect(200);
      const today = await storeToday();
      await api.post('/api/birthday').set(bearer(c.token)).send(today).expect(200);

      const small = await product('ca12-small', 5, 20_000);
      const discounted = await placeOrder(c.token, [{ productId: small, quantity: 1 }]);
      const order = (await api.get(`/api/orders/${discounted}`).set(bearer(c.token)).expect(200)).body.data;
      // ميلاد 5% = 1 000، مستكشف 3% = 600 ← 500 (أقرب ٢٥٠).
      expect(order).toMatchObject({ discount: 1_500, loyaltyDiscount: 500 });

      expect((await setStatus(discounted, 'REJECTED', 'نفد المخزون')).status).toBe(200);

      const redemption = await one<{ consumed_at: Date | null; consumed_order_id: string | null }>(
        `SELECT consumed_at, consumed_order_id FROM loyalty_reward_redemptions
          WHERE user_id = $1 AND level_key = 'explorer'`,
        [c.userId],
      );
      expect(redemption.consumed_at).not.toBeNull();
      expect(redemption.consumed_order_id).toBe(discounted);
      expect(await count('birthday_discount_usage WHERE order_id = $1', [discounted])).toBe(1);

      const retry = await placeOrder(c.token, [{ productId: small, quantity: 1 }]);
      const retried = (await api.get(`/api/orders/${retry}`).set(bearer(c.token)).expect(200)).body.data;
      expect(retried.discount).toBe(0);
    });

    /**
     * CA-13: المزيّة عتبةٌ لا عملة (§40.7). سحبُ نقاط تقييمٍ بعد المطالبة يُنزل
     * الرصيد تحت العتبة، والمطالبة تبقى محجوزة وتُستهلك في الطلب التالي.
     * STEP 57: لم يعد انتظاراً لقرار — هذا عقد §40.7/§40.9 الموثَّق (المحجوز
     * لا يسقط)؛ نظيره للهدية في `contract-closure.test.ts`.
     */
    it('[CA-13 observation] a reward claimed on review points survives the revocation of those points', async () => {
      const c = await customer();
      const id = await product('ca13', 5, 190_000);
      const orderId = await placeOrder(c.token, [{ productId: id, quantity: 1 }]);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      await api.post(`/api/orders/${orderId}/confirm-receipt`).set(bearer(c.token)).expect(200);

      const photo = await registerUploadedPhoto(c.userId);
      const review = await api.post('/api/reviews').set(bearer(c.token))
        .send({ orderId, productId: id, rating: 5, comment: 'منتج ممتاز جداً', photoUrls: [photo] })
        .expect(201);
      await api.patch(`/api/admin/reviews/${review.body.data.id}/moderate`).set(bearer(adminToken))
        .send({ status: 'approved' }).expect(200);
      const balance = async () => (await api.get('/api/points').set(bearer(c.token)).expect(200)).body.data;
      expect((await balance()).balance).toBe(101);

      await api.post('/api/points/rewards/explorer/claim').set(bearer(c.token)).expect(200);
      await api.patch(`/api/admin/reviews/${review.body.data.id}/moderate`).set(bearer(adminToken))
        .send({ status: 'rejected', rejectionReason: 'صورة غير مناسبة' }).expect(200);

      const after = await balance();
      expect(after.balance).toBe(95);
      const explorer = after.rewards.find((r: { levelKey: string }) => r.levelKey === 'explorer');
      expect(explorer).toMatchObject({ unlocked: false, claimed: true, consumed: false, claimable: false });

      const small = await product('ca13-next', 5, 20_000);
      const next = await placeOrder(c.token, [{ productId: small, quantity: 1 }]);
      const nextOrder = (await api.get(`/api/orders/${next}`).set(bearer(c.token)).expect(200)).body.data;
      expect(nextOrder.loyaltyDiscount).toBe(500); // ٣٪ من ٢٠٬٠٠٠ = ٦٠٠ ← ٥٠٠
    });

    /**
     * CA-14 (قرار المالك، STEP 59 — كان ملاحظةً مثبَّتة): منتجٌ عُطِّل بعد أن
     * راجع الزبون عربته لم يعد يسقط من الطلب بصمت. المزامنة التالية
     * (`GET /cart`) تُزيله **وتبلّغ به** (`adjustments`)، والطلب يحمل ما بقي.
     * والإرسال بلا مزامنة بعد التعطيل يُرفض بـ409 (`cart-sync.test.ts`).
     */
    it('[CA-14 contract] a line deactivated after the customer reviewed the cart is removed by the next synchronization and reported', async () => {
      const c = await customer();
      const kept = await product('ca14-kept', 5, 10_000);
      const dropped = await product('ca14-dropped', 5, 10_000);
      await api.post('/api/cart').set(bearer(c.token)).send({ productId: kept, quantity: 1 }).expect(200);
      await api.post('/api/cart').set(bearer(c.token)).send({ productId: dropped, quantity: 1 }).expect(200);
      const reviewed = (await api.get('/api/cart').set(bearer(c.token)).expect(200)).body.data.items;
      expect(reviewed.map((l: { productId: string }) => l.productId).sort()).toEqual([kept, dropped].sort());

      await api.patch(`/api/admin/products/${dropped}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
      // المزامنة تُزيل السطر وتقول لماذا — لا سطرَ مخفيّاً لا يملك الزبون إزالته.
      const synced = (await api.get('/api/cart').set(bearer(c.token)).expect(200)).body.data;
      expect(synced.items.map((l: { productId: string }) => l.productId)).toEqual([kept]);
      expect(synced.adjustments).toEqual([
        expect.objectContaining({ productId: dropped, reason: 'unavailable', previousQuantity: 1, quantity: 0 }),
      ]);
      const res = await api.post('/api/orders').set(bearer(c.token))
        .send({ governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000' });
      expect(res.status).toBe(201);
      expect(res.body.data.items.map((i: { productId: string }) => i.productId)).toEqual([kept]);
      expect(await count(
        'cart_items ci JOIN carts ca ON ca.id = ci.cart_id WHERE ca.user_id = $1',
        [c.userId],
      )).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٣ — ترتيبٌ غير معتاد للأحداث
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 13 — unusual event ordering', () => {
    it('receipt confirmation after the admin rejected the dispatched order is refused with no points', async () => {
      const id = await product('late-receipt', 5);
      const orderId = await placeOrder(shopper.token, [{ productId: id, quantity: 1 }]);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect((await setStatus(orderId, 'REJECTED', 'رفض الاستلام')).status).toBe(200);

      const res = await api.post(`/api/orders/${orderId}/confirm-receipt`).set(bearer(shopper.token));
      expect(res.status).toBe(409);
      expect(await count('points_ledger WHERE order_id = $1', [orderId])).toBe(0);
      expect(await stockOf(id)).toBe(5);
    });

    it('a customer suspended while the order is out for delivery: the admin completes it, points once, review opens after reactivation', async () => {
      const c = await customer();
      const id = await product('suspended-delivery', 5, 20_000);
      const orderId = await placeOrder(c.token, [{ productId: id, quantity: 1 }]);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);

      await api.patch(`/api/admin/users/${c.userId}/active`).set(bearer(adminToken))
        .send({ isActive: false }).expect(200);
      expect((await api.post(`/api/orders/${orderId}/confirm-receipt`).set(bearer(c.token))).status).toBe(403);
      expect((await setStatus(orderId, 'COMPLETED')).status).toBe(200);
      expect(await count(`points_ledger WHERE order_id = $1 AND reason = 'order_received'`, [orderId])).toBe(1);

      await api.patch(`/api/admin/users/${c.userId}/active`).set(bearer(adminToken))
        .send({ isActive: true }).expect(200);
      const login = await api.post('/api/auth/login').send({ phone: c.phone, password: c.password }).expect(200);
      const order = (await api.get(`/api/orders/${orderId}`).set(bearer(login.body.data.token)).expect(200)).body.data;
      expect(order).toMatchObject({ status: 'COMPLETED', canReview: true, reviewableProductCount: 1 });
    });

    it('an order approved after its product was deactivated still consumes stock (Audit #2 OBS) and completes normally', async () => {
      const id = await product('deactivated-before-approval', 3);
      const orderId = await placeOrder(shopper.token, [{ productId: id, quantity: 2 }]);
      await api.patch(`/api/admin/products/${id}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(id)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // المرحلة ١٤ — مسحُ الثوابت على كل ما كتبه هذا الملف
  // ═══════════════════════════════════════════════════════════════════

  describe('Phase 14 — invariant sweep over every row this suite produced', () => {
    const ORDERED_PRODUCTS = `SELECT oi.product_id FROM order_items oi JOIN orders o ON o.id = oi.order_id
                               WHERE o.user_id = ANY($1)`;
    const INVARIANTS: Array<[string, string]> = [
      ['I02 total identity', `SELECT o.id FROM orders o WHERE o.user_id = ANY($1)
         AND o.total <> GREATEST(0, o.products_total + o.delivery_fee - o.delivery_discount - o.discount)`],
      ['I03 products_total = Σ line_total', `SELECT o.id FROM orders o WHERE o.user_id = ANY($1)
         AND o.products_total <> (SELECT COALESCE(SUM(line_total), 0) FROM order_items WHERE order_id = o.id)`],
      ['I06/I07 COMPLETED ⇔ delivered_at', `SELECT id FROM orders WHERE user_id = ANY($1)
         AND (status = 'COMPLETED') <> (delivered_at IS NOT NULL)`],
      ['I08 last history row = status', `SELECT o.id FROM orders o WHERE o.user_id = ANY($1)
         AND o.status <> (SELECT h.status FROM order_status_history h WHERE h.order_id = o.id
                          ORDER BY h.created_at DESC, h.id DESC LIMIT 1)`],
      ['I10 order_received ⇒ own COMPLETED order', `SELECT l.id FROM points_ledger l LEFT JOIN orders o ON o.id = l.order_id
         WHERE l.user_id = ANY($1) AND l.reason = 'order_received'
           AND (o.id IS NULL OR o.status <> 'COMPLETED' OR o.user_id <> l.user_id)`],
      ['I12 review points ⇒ approved review', `SELECT l.id FROM points_ledger l LEFT JOIN reviews r ON r.id = l.review_id
         WHERE l.user_id = ANY($1) AND l.reason IN ('review_approved', 'review_with_photo')
           AND (r.id IS NULL OR r.status <> 'approved')`],
      ['I17 redemption consumed by own order', `SELECT r.id FROM loyalty_reward_redemptions r JOIN orders o ON o.id = r.consumed_order_id
         WHERE r.user_id = ANY($1) AND o.user_id <> r.user_id`],
      ['I18 loyalty_discount ⇔ consumed redemption', `SELECT o.id FROM orders o WHERE o.user_id = ANY($1)
         AND (o.loyalty_discount > 0) <> EXISTS (SELECT 1 FROM loyalty_reward_redemptions r WHERE r.consumed_order_id = o.id)`],
      ['I22 in-stock product carries no restock date', `SELECT p.id FROM products p
         WHERE p.id IN (${ORDERED_PRODUCTS}) AND p.stock > 0 AND p.restock_at IS NOT NULL`],
      ['I23 in-stock product has no waiting subscriber', `SELECT rs.id FROM restock_subscriptions rs
         JOIN products p ON p.id = rs.product_id
         WHERE p.id IN (${ORDERED_PRODUCTS}) AND p.stock > 0`],
    ];

    it.each(INVARIANTS)('%s', async (_name, sql) => {
      const { rows } = await db.query(sql, [suiteUsers]);
      expect(rows).toEqual([]);
    });
  });
});
