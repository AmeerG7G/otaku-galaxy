import type pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { dispatchDueRatingReminders } from '../src/jobs/ratingReminderJob.js';
import { accountRequestRepo } from '../src/repositories/accountRequestRepo.js';
import { PushDeliveryError, pushProvider, resetPushProvider } from '../src/services/push/index.js';
import type { OrderStatus } from '../src/types/index.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  registerUploadedPhoto,
  storeToday,
  TEST_PASSWORD,
} from './helpers.js';

/**
 * إغلاق غموض العقود قبل Staging (STEP 57 — 2026-09-26).
 *
 * لكل CA مفتوح بعد التدقيقات #1–#6 واحدٌ من اثنين هنا:
 *   • عيبٌ مثبَت (RED ثم GREEN): CA-9، CA-16، CA-17a — و CA-6 في
 *     `failure-retry-audit.test.ts` حيث حاجزه.
 *   • قرارٌ تجاري: كان مثبَّتاً بانتظار القرار (CA-12، CA-14، CA-15، CA-18)؛ حسمه
 *     المالك في STEP 59 فصارت اختباراته عقداً (شقّ السعر في CA-14: الخيار أ)؛
 *     أو عقدٌ موثَّق يُحرس (CA-7، CA-13).
 *
 * كل حكم حالةُ قاعدةٍ بعد الحدث مباشرةً. التزامن بحواجز `pg_locks` تُراقَب
 * في `pg_stat_activity` — لا مُهل ولا احتمالات.
 */

const PREFIX = 'CLOSURE57';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// ── حواجز الأقفال (نمط تدقيقَي #2 و#4) ─────────────────────────────────

const openBarriers = new Set<{ release(): Promise<void> }>();

/** معاملة تحكّم تمسك `FOR UPDATE` على صفّ حتى تُطلَق. */
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

async function blockedSessions() {
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  );
  return rows[0]!.n;
}

/** ينتظر حتى تكون `n` جلسات بالضبط منتظرةً قفلاً في هذه القاعدة. */
async function waitForBlocked(n: number) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if ((await blockedSessions()) === n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`لم تُحجب ${n} جلسات على القفل خلال المهلة`);
}

/**
 * ينتظر أيّهما أسبق: أن ينتهي الطلب، أو أن يقف على قفل (`n` جلسات محجوبة).
 * لطلبٍ يقف في الشيفرة الصحيحة ويمرّ بلا انتظار في المعيبة — فيكون الحكم
 * على نتيجته لا على مهلةٍ تنقضي.
 */
async function settledOrBlocked(pending: Promise<unknown>, n: number) {
  let settled = false;
  void pending.then(
    () => { settled = true; },
    () => { settled = true; },
  );
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if (settled) return 'settled';
    if ((await blockedSessions()) >= n) return 'blocked';
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('الطلب لم ينتهِ ولم يقف على قفل خلال المهلة');
}

/** فشل الالتزام مرةً واحدة للعميل التالي الذي يطلبه `withTransaction`. */
function failNextCommit() {
  const original = db.connect.bind(db) as (cb?: unknown) => Promise<pg.PoolClient>;
  let armed = true;
  return vi.spyOn(db, 'connect').mockImplementation((async (cb?: unknown) => {
    // `pool.query` يستدعي `connect(callback)` — يمرّ كما هو.
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
}

describe('Pre-staging contract closure (STEP 57)', () => {
  let adminToken: string;
  let categoryId: string;
  let governorateId: string;
  const createdCategories: string[] = [];

  beforeAll(async () => {
    adminToken = await createAdminUser();
    const { rows: [category] } = await db.query<{ id: string }>(
      `INSERT INTO categories (name, image_url) VALUES ($1, '') RETURNING id`,
      [`${PREFIX} قسم ${Date.now()}`],
    );
    categoryId = category!.id;
    createdCategories.push(categoryId);
    const { rows: [governorate] } = await db.query<{ id: string }>(
      `INSERT INTO governorates (name, delivery_fee) VALUES ($1, 5000) RETURNING id`,
      [`${PREFIX} محافظة ${Date.now()}`],
    );
    governorateId = governorate!.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const barrier of [...openBarriers]) await barrier.release();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query(`DELETE FROM products WHERE name LIKE '${PREFIX} %'`);
    await db.query('DELETE FROM subcategories WHERE category_id = ANY($1)', [createdCategories]);
    await db.query('DELETE FROM categories WHERE id = ANY($1)', [createdCategories]);
    await db.query('DELETE FROM governorates WHERE id = $1', [governorateId]);
  });

  // ── أدوات ────────────────────────────────────────────────────────────

  const customer = () => registerAndLogin();

  async function product(
    name: string,
    stock: number,
    price = 10_000,
    placement: { categoryId?: string; subcategoryId?: string | null } = {},
  ) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_active)
       VALUES ($1, 'وصف', $2, $3, $4, $5, TRUE) RETURNING id`,
      [`${PREFIX} ${name}`, price, placement.categoryId ?? categoryId, placement.subcategoryId ?? null, stock],
    );
    return rows[0]!.id;
  }

  async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    const { rows } = await db.query(sql, params);
    return rows[0] as T;
  }

  const count = async (from: string, params: unknown[]) =>
    Number((await one<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${from}`, params)).n);

  const stockOf = async (id: string) =>
    Number((await one<{ stock: number }>('SELECT stock FROM products WHERE id = $1', [id])).stock);

  async function placeOrder(token: string, lines: Array<{ productId: string; quantity: number }>) {
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
      .send(status === 'REJECTED' ? { status, note: note ?? 'contract closure' } : { status });
  }

  async function completedOrder(
    c: Awaited<ReturnType<typeof customer>>,
    lines: Array<{ productId: string; quantity: number }>,
  ) {
    const orderId = await placeOrder(c.token, lines);
    expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
    await api.post(`/api/orders/${orderId}/confirm-receipt`).set(bearer(c.token)).expect(200);
    return orderId;
  }

  async function review(token: string, orderId: string, productId: string, extra: Record<string, unknown> = {}) {
    const res = await api
      .post('/api/reviews')
      .set(bearer(token))
      .send({ orderId, productId, rating: 5, comment: 'منتج ممتاز جداً', ...extra });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.data.id as string;
  }

  function moderate(reviewId: string, status: 'approved' | 'rejected') {
    return api
      .patch(`/api/admin/reviews/${reviewId}/moderate`)
      .set(bearer(adminToken))
      .send(status === 'rejected' ? { status, rejectionReason: 'صورة غير مناسبة' } : { status });
  }

  // ═══════════════════════════════════════════════════════════════════
  // CA-9 — التسجيل: صفّ المستخدم المعلَّق وطلبه يُكتبان معاً أو لا يُكتبان
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-9 — the pending user and its registration request are one unit', () => {
    const freshPhone = () => `077${Math.floor(10000000 + Math.random() * 89999999)}`;
    const stored = (phone: string) => `+964${phone.slice(1)}`;
    const register = (phone: string, password: string, username = 'مختبر') =>
      api.post('/api/auth/register').send({ username, phone, password, gender: 'male' });

    /**
     * بلا ذرّية كان الفشل بين الكتابتين يترك صفّاً غير مفعَّل بلا طلب: اللوحة
     * لا تراه، والدخول يقول للزبون «حسابك بانتظار موافقة الإدارة — سنتواصل
     * معك» عن طلبٍ لا يراه أحد (ثابت I26).
     */
    it('[CA-9] a failure writing the request leaves no unverified user that no admin can see', async () => {
      const phone = freshPhone();
      vi.spyOn(accountRequestRepo, 'upsertPending')
        .mockRejectedValueOnce(new Error('injected: account request write failure'));

      expect((await register(phone, TEST_PASSWORD)).status).toBe(500);

      expect(await count('users WHERE phone = $1', [stored(phone)])).toBe(0);
      expect(await count('account_requests WHERE submitted_phone = $1', [stored(phone)])).toBe(0);
      // لا «بانتظار الموافقة» عن طلبٍ غير موجود.
      const login = await api.post('/api/auth/login').send({ phone, password: TEST_PASSWORD });
      expect(login.status).toBe(401);

      // إعادة المحاولة تنشئ الاثنين معاً.
      expect((await register(phone, TEST_PASSWORD)).status).toBe(202);
      expect(await count('users WHERE phone = $1 AND phone_verified_at IS NULL', [stored(phone)])).toBe(1);
      expect(await count(
        `account_requests WHERE submitted_phone = $1 AND kind = 'registration' AND status = 'pending'`,
        [stored(phone)],
      )).toBe(1);
    });

    it('[CA-9] a COMMIT failure rolls both writes back', async () => {
      const phone = freshPhone();
      failNextCommit();

      expect((await register(phone, TEST_PASSWORD)).status).toBe(500);

      expect(await count('users WHERE phone = $1', [stored(phone)])).toBe(0);
      expect(await count('account_requests WHERE submitted_phone = $1', [stored(phone)])).toBe(0);
    });

    it('[CA-9] a failure on the resume path leaves the pending account exactly as it was', async () => {
      const phone = freshPhone();
      expect((await register(phone, 'first-password-1')).status).toBe(202);
      const before = await one<{ username: string; token_version: number; password_hash: string }>(
        'SELECT username, token_version, password_hash FROM users WHERE phone = $1',
        [stored(phone)],
      );

      vi.spyOn(accountRequestRepo, 'upsertPending')
        .mockRejectedValueOnce(new Error('injected: account request write failure'));
      expect((await register(phone, 'second-password-2', 'اسم جديد')).status).toBe(500);

      const after = await one<{ username: string; token_version: number; password_hash: string }>(
        'SELECT username, token_version, password_hash FROM users WHERE phone = $1',
        [stored(phone)],
      );
      expect(after).toEqual(before);
      // كلمة المرور الأولى ما زالت كلمة المرور؛ الثانية لم تُكتب.
      expect((await api.post('/api/auth/login').send({ phone, password: 'first-password-1' })).body.error.code)
        .toBe('ACCOUNT_PENDING_APPROVAL');
      expect((await api.post('/api/auth/login').send({ phone, password: 'second-password-2' })).status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-16 — تذكير التقييم لمن بقي له ما يقيّمه فقط
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-16 — the rating reminder goes only to an order with something left to review', () => {
    /** تذكيرات التقييم لهذا الطلب — نوع `receiptReminder` يحمل أيضاً إشعار الاستلام، فالعدّ فرقٌ لا مطلق. */
    const receiptReminders = (orderId: string) =>
      count(`notifications WHERE order_id = $1 AND type = 'receiptReminder'`, [orderId]);

    const makeDue = (orderId: string) =>
      db.query(
        `UPDATE orders SET dispatched_at = now() - interval '2 days',
                           rating_reminder_at = now() - interval '1 day'
          WHERE id = $1`,
        [orderId],
      );

    const reminderState = (orderId: string) =>
      one<{ rating_reminder_at: Date | null; rating_reminder_sent_at: Date | null }>(
        'SELECT rating_reminder_at, rating_reminder_sent_at FROM orders WHERE id = $1',
        [orderId],
      );

    const dispatch = () => dispatchDueRatingReminders(db, 10_000);

    /**
     * النصّ يعد بنقاط («شاركنا رأيك واكسب نقاط المجرّة») ومهلته موثَّقة «لمن
     * استلم ولم يقيّم بعد». طلبٌ قُيّمت منتجاته كلها لا يبقى فيه ما يُكسب
     * (§40.5 تقييمٌ واحد لكل منتج)، والتطبيق نفسه يُخفي كل دعوة تقييم عنه
     * (`hasReviewableProducts`).
     */
    it('[CA-16] a reminder falling due after every product was reviewed is withdrawn, not sent', async () => {
      const c = await customer();
      const a = await product('ca16-all-a', 5);
      const b = await product('ca16-all-b', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]);
      await review(c.token, orderId, a);
      await review(c.token, orderId, b);
      await makeDue(orderId);

      const before = await receiptReminders(orderId);
      await dispatch();

      expect(await receiptReminders(orderId)).toBe(before);
      // لا يُدّعى «أُرسل التذكير» في اللوحة، ولا يبقى موعدٌ مستحقّ يُعاد فحصه في كل دورة.
      expect(await reminderState(orderId)).toEqual({ rating_reminder_at: null, rating_reminder_sent_at: null });
      const adminView = await api.get(`/api/admin/orders/${orderId}`).set(bearer(adminToken)).expect(200);
      expect(adminView.body.data).toMatchObject({ ratingReminderSentAt: null, reviewableProductCount: 0 });
    });

    it('[CA-16] a withdrawn reminder stays withdrawn — a later review rejection does not revive it', async () => {
      const c = await customer();
      const a = await product('ca16-revive', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }]);
      const reviewId = await review(c.token, orderId, a);
      await makeDue(orderId);
      const before = await receiptReminders(orderId);
      await dispatch();
      expect(await receiptReminders(orderId)).toBe(before);

      // الرفض يُبلغ الزبون بنفسه (`reviewRejected`)؛ تذكيرٌ «مرّ يوم على استلامك» بعد أيام ليس ما جُدول.
      expect((await moderate(reviewId, 'rejected')).status).toBe(200);
      await dispatch();
      expect(await receiptReminders(orderId)).toBe(before);
      expect(await reminderState(orderId)).toEqual({ rating_reminder_at: null, rating_reminder_sent_at: null });
    });

    it('[CA-16] the reminder is still sent, once, while at least one product is unreviewed', async () => {
      const c = await customer();
      const a = await product('ca16-partial-a', 5);
      const b = await product('ca16-partial-b', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }, { productId: b, quantity: 1 }]);
      await review(c.token, orderId, a);
      await makeDue(orderId);

      const before = await receiptReminders(orderId);
      await dispatch();
      await dispatch();

      expect(await receiptReminders(orderId)).toBe(before + 1);
      expect((await reminderState(orderId)).rating_reminder_sent_at).not.toBeNull();
    });

    it('[CA-16] a product whose review was rejected is still reviewable — the reminder is sent', async () => {
      const c = await customer();
      const a = await product('ca16-rejected', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }]);
      const reviewId = await review(c.token, orderId, a);
      expect((await moderate(reviewId, 'rejected')).status).toBe(200);
      await makeDue(orderId);

      const before = await receiptReminders(orderId);
      await dispatch();

      expect(await receiptReminders(orderId)).toBe(before + 1);
    });

    it('[CA-16] «send now» refuses an order with nothing left to review, and sends nothing', async () => {
      const c = await customer();
      const a = await product('ca16-send-now', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }]);
      await review(c.token, orderId, a);
      const before = await receiptReminders(orderId);

      const res = await api
        .post(`/api/admin/orders/${orderId}/reminder/send-now`)
        .set(bearer(adminToken));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('NOTHING_TO_REVIEW');
      expect(await receiptReminders(orderId)).toBe(before);
      expect((await reminderState(orderId)).rating_reminder_sent_at).toBeNull();
    });

    it('[CA-16] «send now» after the reminder went out still answers REMINDER_ALREADY_SENT', async () => {
      const c = await customer();
      const a = await product('ca16-already', 5);
      const orderId = await completedOrder(c, [{ productId: a, quantity: 1 }]);
      await api.post(`/api/admin/orders/${orderId}/reminder/send-now`).set(bearer(adminToken)).expect(200);
      await review(c.token, orderId, a);

      const res = await api
        .post(`/api/admin/orders/${orderId}/reminder/send-now`)
        .set(bearer(adminToken));

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('REMINDER_ALREADY_SENT');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-17a — «أعلمني عند توفره» يسابق عودة المخزون
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-17a — a restock subscription racing the stock return (§42.5)', () => {
    const subscribe = (token: string, productId: string) =>
      api.post('/api/restock-subscriptions').set(bearer(token)).send({ productId });

    /**
     * فحص «المنتج متوفر؟» كان قراءةً بلا قفل: اشتراكٌ قرأ صفراً قبل التزام حفظ
     * المسؤول ثم أُدرج بعده يبقى على منتجٍ متوفر — لا إشعار ولا استهلاك (I23).
     */
    it('[CA-17a] racing the admin restock: the late «notify me» waits and is refused — no subscription lingers', async () => {
      const waiting = await customer();
      const late = await customer();
      const id = await product('ca17-admin-save', 0);
      expect((await subscribe(waiting.token, id)).status).toBe(200);

      // حفظ المسؤول يقف عند إشعار `waiting` (مفتاح أجنبي على صفّه) — بعد كتابة المخزون وقبل الالتزام.
      const barrier = await holdRowLock('users', waiting.userId);
      const save = api.patch(`/api/admin/products/${id}`).set(bearer(adminToken)).send({ stock: 5 }).then((r) => r);
      await waitForBlocked(1);
      const racing = subscribe(late.token, id).then((r) => r);
      await waitForBlocked(2);
      await barrier.release();
      const [saved, subscribed] = await Promise.all([save, racing]);

      expect(saved.status).toBe(200);
      expect(subscribed.status).toBe(409);
      expect(subscribed.body.error.code).toBe('PRODUCT_IN_STOCK');
      expect(await count('restock_subscriptions WHERE product_id = $1', [id])).toBe(0);
      expect(await count(`notifications WHERE product_id = $1 AND type = 'backInStock'`, [id])).toBe(1);
    });

    /**
     * رفضُ طلبٍ مقبول يُرجع القطعة بـ`UPDATE` (قفل NO KEY UPDATE) — لا يحجب
     * المفتاح الأجنبي للاشتراك. كان الاشتراك المتسابق يُلتزم فوراً ثم يمسحه
     * `clearForProduct` بلا إشعار: الزبون قيل له «سننبّهك» ولم يُنبَّه.
     */
    it('[CA-17a] racing a rejection that returns the last unit: the late «notify me» is refused, never silently consumed', async () => {
      const buyer = await customer();
      const waiting = await customer();
      const late = await customer();
      const id = await product('ca17-rejection', 1);
      const orderId = await placeOrder(buyer.token, [{ productId: id, quantity: 1 }]);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(id)).toBe(0);
      expect((await subscribe(waiting.token, id)).status).toBe(200);

      const barrier = await holdRowLock('users', waiting.userId);
      const rejection = setStatus(orderId, 'REJECTED', 'رفض الاستلام').then((r) => r);
      await waitForBlocked(1);
      const racing = subscribe(late.token, id).then((r) => r);
      await settledOrBlocked(racing, 2);
      await barrier.release();
      const [rejected, subscribed] = await Promise.all([rejection, racing]);

      expect(rejected.status).toBe(200);
      expect(await stockOf(id)).toBe(1);
      expect(subscribed.status).toBe(409);
      expect(subscribed.body.error.code).toBe('PRODUCT_IN_STOCK');
      expect(await count('restock_subscriptions WHERE product_id = $1', [id])).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-7 — إشعارات الإدارة: at-least-once، والدفع لا يعمل بعد
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-7 — admin notifications are at-least-once; push delivery is not wired', () => {
    const saved = { ...config.push };
    afterEach(() => {
      Object.assign(config.push, saved);
      resetPushProvider();
    });

    /**
     * سلك تنبيه لا اختبار سلوك: CA-7 كامنٌ **لأن** FCM لا يُرسل شيئاً بعد
     * (`obtainAccessToken` يرمي فوراً، فلا يطول بثٌّ حتى تنقضي مهلة اللوحة).
     * يوم يُكمَل الإرسال الحقيقي يسقط هذا الاختبار — وقبل تعديله يجب حسم CA-7
     * (مفتاح عدم تكرار على البثّ، أو الدفع بعد الردّ). انظر STEP 57.
     */
    it('[CA-7 tripwire] the FCM provider still refuses to send — completing it requires resolving CA-7 first', async () => {
      Object.assign(config.push, {
        provider: 'fcm',
        projectId: 'tripwire-project',
        clientEmail: 'tripwire@example.invalid',
        privateKey: 'tripwire-key',
        timeoutMs: 10,
      });
      resetPushProvider();

      await expect(
        pushProvider().send({ tokens: ['tripwire-token'], title: 't', body: 'b' }),
      ).rejects.toBeInstanceOf(PushDeliveryError);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-12 — خصم المستوى وخصم الميلاد على طلبٍ مرفوض (قرار مطلوب)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * CA-12 — قرار المالك (STEP 59): الخصم الذي استعمله طلبٌ **أُنشئ** يبقى مستهلَكاً ولو رُفض
   * الطلب لاحقاً، في كل حالات الرفض. وحده إرسالٌ فشل فلم يُنشئ طلباً يُبقي الخصمين متاحين
   * (§40.8). كانت هذه الاختبارات «مثبَّتة بانتظار قرار» — صارت العقد نفسه.
   */
  describe('CA-12 — a created order consumes its discounts for good; only a submit that creates no order leaves them available (decided)', () => {
    /** زبونٌ حجز خصم «مستكشف» (١٠٠ نقطة) وسجّل ميلاده اليوم. */
    async function discountReadyCustomer() {
      const c = await customer();
      const big = await product('ca12-points', 5, 200_000);
      await completedOrder(c, [{ productId: big, quantity: 1 }]);
      await api.post('/api/points/rewards/explorer/claim').set(bearer(c.token)).expect(200);
      await api.post('/api/birthday').set(bearer(c.token)).send(await storeToday()).expect(200);
      return c;
    }

    async function discountsOf(userId: string, orderId: string) {
      const redemption = await one<{ consumed_at: Date | null; consumed_order_id: string | null }>(
        `SELECT consumed_at, consumed_order_id FROM loyalty_reward_redemptions
          WHERE user_id = $1 AND level_key = 'explorer'`,
        [userId],
      );
      return {
        loyaltyConsumedBy: redemption.consumed_at ? redemption.consumed_order_id : null,
        birthdayUsages: await count('birthday_discount_usage WHERE order_id = $1', [orderId]),
      };
    }

    /**
     * الحالة التي يحسمها §40.8 نصاً (عقد لا قرار): نفاد المخزون **عند الإرسال**
     * — بوّابة الطلب في `create` — فلا يُنشأ طلب، ولا يُحرق خصم. البوّابة تسبق
     * الحجز داخل معاملة الإنشاء نفسها، والخصمان يُطبَّقان على الطلب التالي.
     * ما بعدها (نفادٌ عند القبول، رفضٌ بعد القبول) هو CA-12 المفتوح.
     */
    it('[CA-12 contract §40.8] stock ran out at submit → no order is created and neither discount is burned', async () => {
      const c = await discountReadyCustomer();
      const scarce = await product('ca12-submit-gate', 1, 20_000);
      await api.post('/api/cart').set(bearer(c.token)).send({ productId: scarce, quantity: 1 }).expect(200);
      // زبونٌ آخر يأخذ القطعة الأخيرة ويُقبل طلبه قبل أن يُرسل الأول.
      const other = await customer();
      const competing = await placeOrder(other.token, [{ productId: scarce, quantity: 1 }]);
      expect((await setStatus(competing, 'OUT_FOR_DELIVERY')).status).toBe(200);

      const submit = () => api.post('/api/orders').set(bearer(c.token))
        .send({ governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000' });
      const refused = await submit();
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect(await count('orders WHERE user_id = $1', [c.userId])).toBe(1); // طلب الأهلية وحده
      expect(await count(
        `loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'explorer' AND consumed_at IS NULL`,
        [c.userId],
      )).toBe(1);
      expect(await count('birthday_discount_usage WHERE user_id = $1', [c.userId])).toBe(0);

      await api.patch(`/api/admin/products/${scarce}`).set(bearer(adminToken)).send({ stock: 1 }).expect(200);
      const placed = await submit();
      expect(placed.status).toBe(201);
      // ميلاد 5% = 1 000، مستكشف 3% = 600 ← 500 (أقرب ٢٥٠) — الخصمان سليمان للطلب التالي.
      expect(placed.body.data).toMatchObject({ discount: 1_500, loyaltyDiscount: 500 });
    });

    it('[CA-12 contract] a pending order rejected by the admin keeps both discounts consumed; the next order gets neither', async () => {
      const c = await discountReadyCustomer();
      const item = await product('ca12-pending', 5, 20_000);
      const discounted = await placeOrder(c.token, [{ productId: item, quantity: 1 }]);
      expect((await setStatus(discounted, 'REJECTED', 'تعذّر التواصل')).status).toBe(200);

      expect(await discountsOf(c.userId, discounted)).toEqual({ loyaltyConsumedBy: discounted, birthdayUsages: 1 });
      expect(await stockOf(item)).toBe(5); // المنتظر لم يحجز شيئاً (§47.1)
      const next = await placeOrder(c.token, [{ productId: item, quantity: 1 }]);
      expect((await one<{ discount: string }>('SELECT discount FROM orders WHERE id = $1', [next])).discount).toBe('0.00');
    });

    /**
     * سيناريو §40.8 بعينه منذ 2026-09-14: المخزون ينفد **عند القبول**، والطلب
     * يبقى منتظراً بـ`INSUFFICIENT_STOCK`، ومخرجه الوحيد الرفض.
     */
    it('[CA-12 contract] stock ran out at approval → the pending order is rejected → both discounts stay consumed', async () => {
      const c = await discountReadyCustomer();
      const scarce = await product('ca12-scarce', 1, 20_000);
      const discounted = await placeOrder(c.token, [{ productId: scarce, quantity: 1 }]);
      const other = await customer();
      const competing = await placeOrder(other.token, [{ productId: scarce, quantity: 1 }]);
      expect((await setStatus(competing, 'OUT_FOR_DELIVERY')).status).toBe(200);

      const approval = await setStatus(discounted, 'OUT_FOR_DELIVERY');
      expect(approval.status).toBe(409);
      expect(approval.body.error.code).toBe('INSUFFICIENT_STOCK');
      expect((await setStatus(discounted, 'REJECTED', 'نفد المخزون')).status).toBe(200);

      expect(await discountsOf(c.userId, discounted)).toEqual({ loyaltyConsumedBy: discounted, birthdayUsages: 1 });
    });

    it('[CA-12 contract] a rejection after approval (parcel refused) also keeps both discounts consumed', async () => {
      const c = await discountReadyCustomer();
      const item = await product('ca12-refused', 5, 20_000);
      const discounted = await placeOrder(c.token, [{ productId: item, quantity: 1 }]);
      expect((await setStatus(discounted, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect((await setStatus(discounted, 'REJECTED', 'رفض الاستلام')).status).toBe(200);

      expect(await discountsOf(c.userId, discounted)).toEqual({ loyaltyConsumedBy: discounted, birthdayUsages: 1 });
      // المخزون وحده يعود (§47.1) — الخصمان لا.
      expect(await stockOf(item)).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-13 — المزيّة المحجوزة بعد سحب النقاط (عقد §40.7 / §40.9)
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-13 — a claim is a reserved entitlement (§40.7 claimed → consumed/fulfilled; §40.9 no claim lapses)', () => {
    it('[CA-13 contract] a gift claimed on review points is still owed after those points are revoked, and is fulfilled normally', async () => {
      const c = await customer();
      const item = await product('ca13-gift', 5, 490_000);
      const orderId = await completedOrder(c, [{ productId: item, quantity: 1 }]);
      const photo = await registerUploadedPhoto(c.userId);
      const reviewId = await review(c.token, orderId, item, { photoUrls: [photo] });
      expect((await moderate(reviewId, 'approved')).status).toBe(200);
      const balance = async () => (await api.get('/api/points').set(bearer(c.token)).expect(200)).body.data;
      expect((await balance()).balance).toBe(251);

      await api.post('/api/points/rewards/voyager/claim').set(bearer(c.token)).expect(200);
      expect((await moderate(reviewId, 'rejected')).status).toBe(200);

      const after = await balance();
      expect(after.balance).toBe(245);
      expect(after.rewards.find((r: { levelKey: string }) => r.levelKey === 'voyager'))
        .toMatchObject({ unlocked: false, claimed: true });

      const { id } = await one<{ id: string }>(
        `SELECT id FROM loyalty_reward_redemptions WHERE user_id = $1 AND level_key = 'voyager'`,
        [c.userId],
      );
      await api.post(`/api/admin/loyalty-rewards/${id}/fulfil`).set(bearer(adminToken)).expect(200);
      expect(await count('loyalty_reward_redemptions WHERE id = $1 AND fulfilled_at IS NOT NULL', [id])).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-14 — الطلب يُبنى من العربة كما يراها الخادم لحظة الالتزام
  // ═══════════════════════════════════════════════════════════════════

  describe('CA-14 — a checkout without expected prices (older app build) keeps the price at submit (mixed deployment)', () => {
    /**
     * CA-14 حُسم في STEP 59: التطبيق يرسل أسعار عربته المُزامَنة (`expectedPrices`) والخادم
     * يرفض أي اختلاف بـ`409 PRODUCT_PRICE_CHANGED` (`cart-sync.test.ts`، الخيار أ).
     * تطبيقٌ أقدم لا يرسلها: لا توقّع يُقارَن، فيُطبَّق سعر لحظة الالتزام كما كان — مسار
     * النشر المختلط (نمط §47.4). فرضُ التطبيق الجديد قرارُ `minVersion` لا هذا المسار.
     */
    it('[CA-14 contract] without expected prices (older app) a price change before submit is applied at submit', async () => {
      const c = await customer();
      const item = await product('ca14-price', 5, 10_000);
      await api.post('/api/cart').set(bearer(c.token)).send({ productId: item, quantity: 1 }).expect(200);
      const seen = (await api.get('/api/cart').set(bearer(c.token)).expect(200)).body.data.items;
      expect(seen[0].unitPrice).toBe(10_000);

      await api.patch(`/api/admin/products/${item}`).set(bearer(adminToken)).send({ price: 12_000 }).expect(200);
      const res = await api.post('/api/orders').set(bearer(c.token))
        .send({ governorateId, fullAddress: 'بغداد، الكرادة، شارع ٦٢', phone: '07700000000' });

      expect(res.status).toBe(201);
      expect(res.body.data.items[0]).toMatchObject({ price: 12_000, lineTotal: 12_000 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-15 — لوحةٌ قديمة على انتقالٍ مشروع: الأخير يفوز (قرار المالك، STEP 59)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * CA-15 — قرار المالك (STEP 59): **الأخير يفوز**. ما أرسله المسؤول الأخير يُكتب، ولا
   * تزامنٌ متفائل (لا ETag ولا رقم نسخة ولا 409 لنموذجٍ قديم). الانتقال **غير المشروع**
   * يبقى مرفوضاً تحت القفل. و«الأخير يفوز» لا يبرّر فقدَ حقلٍ لم يُرسَل: الحقل الغائب
   * عن `PATCH` لا يُمسّ (انظر `ProductEditPage.restock.test.tsx` لجهة اللوحة).
   */
  describe('CA-15 — last write wins on legal admin actions; an unsent field is never nulled (decided)', () => {
    it('[CA-15 contract] a «reject» sent from a view that still showed PENDING rejects an order another admin already dispatched', async () => {
      const c = await customer();
      const item = await product('ca15-order', 3);
      const orderId = await placeOrder(c.token, [{ productId: item, quantity: 1 }]);

      // المسؤول (أ) يرى «بانتظار التأكيد»؛ المسؤول (ب) يقبل ويُخرج الطلب.
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(item)).toBe(2);
      // «رفض» (أ) لا يحمل الحالة التي رآها — الانتقال مشروع من التوصيل فيُنفَّذ.
      const stale = await setStatus(orderId, 'REJECTED', 'نفد المخزون');

      expect(stale.status).toBe(200);
      expect(stale.body.data.status).toBe('REJECTED');
      expect(await stockOf(item)).toBe(3);
      const types = (await api.get('/api/notifications').set(bearer(c.token)).expect(200)).body.data.items
        .filter((n: { orderId: string | null }) => n.orderId === orderId)
        .map((n: { type: string }) => n.type);
      expect(types).toEqual(expect.arrayContaining(['orderAccepted', 'orderRejected']));
    });

    it('[CA-15 contract] an «approve» sent from a view of the rejected review approves the content the customer resubmitted since', async () => {
      const c = await customer();
      const item = await product('ca15-review', 5);
      const orderId = await completedOrder(c, [{ productId: item, quantity: 1 }]);
      const reviewId = await review(c.token, orderId, item, { comment: 'النص الأول الذي رآه المسؤول' });
      expect((await moderate(reviewId, 'rejected')).status).toBe(200);

      await api.patch(`/api/reviews/${reviewId}`).set(bearer(c.token))
        .send({ rating: 1, comment: 'نص جديد لم يره أي مسؤول' }).expect(200);
      const stale = await moderate(reviewId, 'approved');

      expect(stale.status).toBe(200);
      const row = await one<{ status: string; comment: string; rating: number }>(
        'SELECT status, comment, rating FROM reviews WHERE id = $1',
        [reviewId],
      );
      expect(row).toEqual({ status: 'approved', comment: 'نص جديد لم يره أي مسؤول', rating: 1 });
    });

    /**
     * الفرع نفسه على المنتج: صفحة «تعديل منتج» ترسل **كل** حقول النموذج كما
     * حُمِّلت (`ProductEditPage.handleSubmit` — مثبَّت في `ProductEditPage.test.tsx`:
     * «بقية الحقول تُرسَل كالمعتاد»)، والخادم يكتب المخزون قيمةً مطلقة (CA-5).
     * نموذجٌ فُتح قبل قبول طلبٍ وحُفظ بعده لتصحيح الوصف وحده يُعيد المخزون
     * الذي استهلكه القبول. `isActive` و`restockAt` يُرسَلان بالطريقة نفسها.
     */
    it('[CA-15 contract] admin A saves a form opened before admin B changed the product → the values admin A submitted win, stock included', async () => {
      const c = await customer();
      const item = await product('ca15-product-form', 5);
      const loaded = (await api.get(`/api/catalog/products/${item}`).expect(200)).body.data;
      // ما تبنيه `ProductEditPage.handleSubmit` من النموذج المحمَّل.
      const form = {
        // المحتوى بلغتيه صريحاً (066) — كما يبنيه النموذج من `nameAr`… لا من
        // `name` المحسوم بلغة الطلب.
        nameAr: loaded.nameAr,
        descriptionAr: loaded.descriptionAr,
        ...(loaded.nameCkb !== null ? { nameCkb: loaded.nameCkb } : {}),
        ...(loaded.descriptionCkb !== null ? { descriptionCkb: loaded.descriptionCkb } : {}),
        price: loaded.price,
        categoryId: loaded.categoryId,
        subcategoryId: loaded.subcategoryId ?? null,
        stock: loaded.stock,
        restockAt: loaded.restockAt ?? null,
        images: loaded.images,
        options: loaded.options.map((o: { name: string; values: string[] }) => ({ name: o.name, values: o.values })),
        isOffer: loaded.isOffer,
        isSelected: loaded.isSelected,
        isActive: true,
        previousPrice: loaded.previousPrice ?? null,
        hasDeliveryPromo: loaded.hasDeliveryPromo ?? false,
        deliveryPromoAmount: 0,
        franchiseIds: loaded.franchiseIds ?? [],
      };

      // المسؤول (ب) يقبل طلباً من قطعتين ويغيّر السعر بينما نموذج (أ) مفتوح.
      const orderId = await placeOrder(c.token, [{ productId: item, quantity: 2 }]);
      expect((await setStatus(orderId, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(item)).toBe(3);
      await api.patch(`/api/admin/products/${item}`).set(bearer(adminToken)).send({ price: 15_000 }).expect(200);

      // (أ) يصحّح الوصف ويحفظ النموذج كما حمّله — ما أرسله هو ما يُكتب.
      await api.patch(`/api/admin/products/${item}`).set(bearer(adminToken))
        .send({ ...form, descriptionAr: 'وصف مصحَّح' }).expect(200);

      expect(await stockOf(item)).toBe(5);
      expect(Number((await one<{ price: string }>('SELECT price FROM products WHERE id = $1', [item])).price))
        .toBe(10_000);
      expect((await one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId])).status)
        .toBe('OUT_FOR_DELIVERY');
    });

    it('[CA-15 contract] a save writes only what it sends — the restock date, options, images and activity it omits are never nulled', async () => {
      const item = await product('ca15-partial', 0);
      const restockAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
      await api.patch(`/api/admin/products/${item}`).set(bearer(adminToken)).send({
        restockAt,
        images: ['https://cdn.example.com/ca15.png'],
        options: [{ name: 'اللون', values: ['أحمر', 'أزرق'] }],
      }).expect(200);
      await api.delete(`/api/admin/products/${item}`).set(bearer(adminToken)).expect(200);

      // حفظٌ لاحق لا يعرف إلا الوصف.
      await api.patch(`/api/admin/products/${item}`).set(bearer(adminToken))
        .send({ descriptionAr: 'وصف فقط' }).expect(200);

      const row = await one<{ restock_at: Date | null; is_active: boolean; description: string }>(
        'SELECT restock_at, is_active, description FROM products WHERE id = $1',
        [item],
      );
      expect(row.restock_at?.toISOString()).toBe(restockAt);
      expect(row.is_active).toBe(false);
      expect(row.description).toBe('وصف فقط');
      expect(await count('product_images WHERE product_id = $1', [item])).toBe(1);
      expect(await count('product_options WHERE product_id = $1', [item])).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CA-18 — تعطيل القسم أو القسم الفرعي لا يمسّ منتجاته (قرار المالك، STEP 59)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * CA-18 — قرار المالك (STEP 59، الخيار A): تعطيل القسم أو القسم الفرعي **يُخفي القسم وحده**.
   * حالة المنتج مستقلّة: لا تعطيل ولا حذف ولا مساس بالمخزون، ولا مساس بأسطر العربات، ولا
   * رفض للإرسال بسبب القسم، ولا مساس بالطلبات القائمة. لا تتالي من القسم إلى المنتج.
   */
  describe('CA-18 — deactivating a category or subcategory hides the section only; products are independent (decided)', () => {
    async function assertStillSellable(productId: string, filter: string) {
      const c = await customer();
      const listed = (await api.get(`/api/catalog/products?${filter}`).expect(200)).body.data.items
        .map((p: { id: string }) => p.id);
      expect(listed).toContain(productId);
      await api.get(`/api/catalog/products/${productId}`).expect(200);
      const orderId = await placeOrder(c.token, [{ productId, quantity: 1 }]);
      expect(orderId).toBeTruthy();
    }

    it('[CA-18 contract] an inactive category disappears from the category list, its products stay listed, cartable and orderable', async () => {
      const { rows: [category] } = await db.query<{ id: string }>(
        `INSERT INTO categories (name, image_url) VALUES ($1, '') RETURNING id`,
        [`${PREFIX} قسم معطّل ${Date.now()}`],
      );
      createdCategories.push(category!.id);
      const item = await product('ca18-category', 5, 10_000, { categoryId: category!.id });

      await api.patch(`/api/admin/categories/${category!.id}`).set(bearer(adminToken))
        .send({ isActive: false }).expect(200);

      const visible = (await api.get('/api/catalog/categories').expect(200)).body.data.items
        .map((cat: { id: string }) => cat.id);
      expect(visible).not.toContain(category!.id);
      await assertStillSellable(item, `categoryId=${category!.id}`);
    });

    it('[CA-18 contract] an inactive subcategory («ظاهر للعملاء» off) leaves its products listed, cartable and orderable', async () => {
      const { rows: [sub] } = await db.query<{ id: string }>(
        `INSERT INTO subcategories (category_id, name) VALUES ($1, $2) RETURNING id`,
        [categoryId, `${PREFIX} فرعي معطّل ${Date.now()}`],
      );
      const item = await product('ca18-subcategory', 5, 10_000, { subcategoryId: sub!.id });

      await api.patch(`/api/admin/subcategories/${sub!.id}`).set(bearer(adminToken))
        .send({ isActive: false }).expect(200);

      await assertStillSellable(item, `subcategoryId=${sub!.id}`);
    });

    it('[CA-18 contract] no cascade: the product row, its stock, a cart holding it and a pending order are untouched; the order is still approvable', async () => {
      const { rows: [category] } = await db.query<{ id: string }>(
        `INSERT INTO categories (name, image_url) VALUES ($1, '') RETURNING id`,
        [`${PREFIX} قسم بلا تتالٍ ${Date.now()}`],
      );
      createdCategories.push(category!.id);
      const { rows: [sub] } = await db.query<{ id: string }>(
        `INSERT INTO subcategories (category_id, name) VALUES ($1, $2) RETURNING id`,
        [category!.id, `${PREFIX} فرعي بلا تتالٍ ${Date.now()}`],
      );
      const item = await product('ca18-no-cascade', 5, 10_000, { categoryId: category!.id, subcategoryId: sub!.id });
      const buyer = await customer();
      const pending = await placeOrder(buyer.token, [{ productId: item, quantity: 2 }]);
      const holder = await customer();
      await api.post('/api/cart').set(bearer(holder.token)).send({ productId: item, quantity: 1 }).expect(200);
      const productBefore = await one('SELECT is_active, stock, category_id, subcategory_id FROM products WHERE id = $1', [item]);

      await api.patch(`/api/admin/subcategories/${sub!.id}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);
      await api.patch(`/api/admin/categories/${category!.id}`).set(bearer(adminToken)).send({ isActive: false }).expect(200);

      expect(await one('SELECT is_active, stock, category_id, subcategory_id FROM products WHERE id = $1', [item]))
        .toEqual(productBefore);
      const cart = (await api.get('/api/cart').set(bearer(holder.token)).expect(200)).body.data;
      expect(cart.items.map((l: { productId: string; quantity: number }) => [l.productId, l.quantity])).toEqual([[item, 1]]);
      expect(cart.adjustments).toEqual([]);
      expect((await one<{ status: string }>('SELECT status FROM orders WHERE id = $1', [pending])).status)
        .toBe('PENDING_ADMIN_CONFIRMATION');
      expect((await setStatus(pending, 'OUT_FOR_DELIVERY')).status).toBe(200);
      expect(await stockOf(item)).toBe(3);
    });
  });
});
