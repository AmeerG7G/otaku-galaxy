import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, withTransaction } from '../src/database/pool.js';
import { startRatingReminderScheduler } from '../src/jobs/ratingReminderJob.js';
import { productRepo } from '../src/repositories/catalogRepo.js';
import { notificationRepo } from '../src/repositories/notificationsRepo.js';
import { orderRepo } from '../src/repositories/orderRepo.js';
import { pointsRepo } from '../src/repositories/pointsRepo.js';
import { userRepo } from '../src/repositories/userRepo.js';
import {
  api,
  createAdminUser,
  purgeTestUsers,
  registerAndLogin,
  seedTestCatalog,
} from './helpers.js';

/**
 * تدقيق الأداء والموارد (#5).
 *
 * كل حكم هنا **عدديّ وحتميّ**: عدد الجمل التي وصلت القاعدة فعلاً، أو شكل
 * الخطة الذي يعطيه PostgreSQL لبياناتٍ بحجمٍ واقعي، أو حالة المجمّع بعد
 * الفشل. لا «يبدو أسرع».
 *
 * ═══ المرحلة أ — عدد الجمل (N+1 والعمل المكرَّر) ═══
 * ═══ المرحلة ب — الفهارس والخطط على بيانات بحجم المتجر بعد سنة ═══
 * ═══ المرحلة ج — سلامة المجمّع في مسارات الفشل ═══
 * ═══ المرحلة د — حدود الترقيم ═══
 * ═══ المرحلة هـ — دورة حياة المهمّة الدورية ═══
 */

// ── عدّاد الجمل ──────────────────────────────────────────────────────

/**
 * يلتقط كل جملة تُرسَل من أي عميل في المجمّع (بما فيها عملاء المعاملات).
 *
 * الاعتراض على `pg.Client.prototype.query` لا على `db.query`: جمل
 * `withTransaction` تمرّ من عميلٍ مخصَّص لا من المجمّع مباشرةً، وهي
 * بالضبط ما يهمّ في N+1 داخل معاملة الطلب.
 */
function captureStatements() {
  const statements: string[] = [];
  const captured: Array<{ text: string; values: unknown[] }> = [];
  const original = pg.Client.prototype.query as (...args: unknown[]) => unknown;
  const spy = vi
    .spyOn(pg.Client.prototype, 'query')
    .mockImplementation(function (this: pg.Client, ...args: unknown[]) {
      const first = args[0];
      const text =
        typeof first === 'string'
          ? first
          : ((first as { text?: string } | undefined)?.text ?? '');
      statements.push(text.replace(/\s+/g, ' ').trim());
      captured.push({ text, values: Array.isArray(args[1]) ? (args[1] as unknown[]) : [] });
      return original.apply(this, args);
    } as typeof pg.Client.prototype.query);
  return {
    statements,
    captured,
    matching: (pattern: RegExp) => statements.filter((s) => pattern.test(s)).length,
    stop: () => spy.mockRestore(),
  };
}

/**
 * الجمل التي أصدرها استدعاءٌ ما — نصّاً وقيماً — كي تُشرَح **هي نفسها**.
 *
 * فحصُ خطة نسخةٍ من الاستعلام في الاختبار لا يحرس شيئاً: تُعدَّل الجملة في
 * المستودع فتبقى النسخة كما هي. هنا تُشرَح الجملة التي وصلت القاعدة فعلاً.
 */
async function statementsOf(run: () => Promise<unknown>, pattern: RegExp) {
  const capture = captureStatements();
  try {
    await run();
  } finally {
    capture.stop();
  }
  return capture.captured.filter((s) => pattern.test(s.text.replace(/\s+/g, ' ')));
}

interface PlanNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  Plans?: PlanNode[];
}

/** خطة التنفيذ الفعلية (JSON) لجملةٍ بقيمها؛ `analyze=false` للجمل الكاتبة. */
async function explain(text: string, values: unknown[], analyze = true) {
  const { rows } = await db.query<{ 'QUERY PLAN': Array<Record<string, unknown>> }>(
    `EXPLAIN (${analyze ? 'ANALYZE, ' : ''}FORMAT JSON) ${text}`,
    values,
  );
  const root = rows[0]!['QUERY PLAN'][0]!;
  const nodes: PlanNode[] = [];
  const walk = (node: PlanNode) => {
    nodes.push(node);
    for (const child of node.Plans ?? []) walk(child);
  };
  walk(root.Plan as PlanNode);
  return {
    root,
    nodes,
    jit: 'JIT' in root,
    executionMs: Number(root['Execution Time'] ?? 0),
    scansOf: (relation: string) =>
      nodes.filter((n) => n['Relation Name'] === relation).map((n) => n['Node Type']),
    usesIndex: (name: string) => nodes.some((n) => n['Index Name'] === name),
  };
}

const FIXTURES = path.resolve(process.cwd(), 'tests/fixtures');
const loadSql = (file: string) => readFile(path.join(FIXTURES, file), 'utf8');

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Performance / resource audit', () => {
  let catalog: Awaited<ReturnType<typeof seedTestCatalog>>;
  let adminToken: string;

  beforeAll(async () => {
    catalog = await seedTestCatalog();
    adminToken = await createAdminUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await purgeTestUsers();
    await db.query("DELETE FROM products WHERE name LIKE 'PERF %'");
  });

  async function product(name: string, stock = 50, price = 10_000) {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_active)
       VALUES ($1, 'وصف', $4, $2, $5, $3, TRUE) RETURNING id`,
      [`PERF ${name} ${Math.random().toString(36).slice(2, 8)}`, catalog.categoryId, stock, price, catalog.subcategoryId],
    );
    return rows[0]!.id;
  }

  async function fillCart(token: string, productIds: string[]) {
    for (const productId of productIds) {
      await api.post('/api/cart').set(authed(token)).send({ productId, quantity: 1 }).expect(200);
    }
  }

  const ORDER_BODY = () => ({
    governorateId: catalog.governorateId,
    fullAddress: 'بغداد، الكرادة',
    phone: '07700000000',
  });

  // ═══════════════════════════════════════════════════════════════════
  describe('Phase A — statement counts (N+1 / duplicated work)', () => {
    /** جمل قراءة المنتج بمعرّفه — الشكل الذي يُصدره `productRepo`. */
    const PRODUCT_READ = /FROM products p WHERE p\.id (= \$\d|= ANY)/;

    async function productReadsDuringCheckout(lines: number) {
      const buyer = await registerAndLogin();
      const ids: string[] = [];
      for (let i = 0; i < lines; i += 1) ids.push(await product(`checkout-${lines}-${i}`));
      await fillCart(buyer.token, ids);

      const capture = captureStatements();
      try {
        const res = await api.post('/api/orders').set(authed(buyer.token)).send(ORDER_BODY());
        expect(res.status).toBe(201);
        expect(res.body.data.items).toHaveLength(lines);
        return capture.matching(PRODUCT_READ);
      } finally {
        capture.stop();
      }
    }

    it('[PERF-1] checkout reads the cart products in ONE statement — the count does not grow with cart lines', async () => {
      const three = await productReadsDuringCheckout(3);
      const twelve = await productReadsDuringCheckout(12);
      // N+1: كانت كل سطرٍ قراءةً مستقلة (٣ ثم ١٢). المطلوب: قراءة واحدة
      // مهما كان عدد الأسطر.
      expect(twelve).toBe(three);
      expect(three).toBe(1);
    });

    it('[PERF-2] an admin request authenticates once — one auth-state read, not two', async () => {
      const spy = vi.spyOn(userRepo, 'findAuthState');
      const res = await api.get('/api/admin/orders?limit=1').set(authed(adminToken));
      expect(res.status).toBe(200);
      // كانت `/api` ثم `/api/admin` تُشغّلان `authenticate` معاً على الطلب
      // نفسه: قراءتان متطابقتان من `users` لكل طلب إداري.
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('[PERF-3] listing account requests loads the linked accounts and balances in bulk — not two reads per row', async () => {
      // ٦ طلبات تسجيل منتظرة (كل واحد يسجّل حساباً ويُنشئ طلباً).
      for (let i = 0; i < 6; i += 1) {
        const phone = `0779${String(Math.floor(1000000 + Math.random() * 8999999))}`;
        await api
          .post('/api/auth/register')
          .send({ username: `مختبر ${i}`, phone, password: 'secret123', gender: 'male' })
          .expect(202);
      }

      const capture = captureStatements();
      try {
        const res = await api
          .get('/api/admin/account-requests?status=pending&limit=50')
          .set(authed(adminToken));
        expect(res.status).toBe(200);
        expect(res.body.data.items.length).toBeGreaterThanOrEqual(6);
        // كانت كل صفٍّ قراءتين (`findById` + `balance`) — ٢×N جملةً لصفحة
        // واحدة. المطلوب: قراءةٌ واحدة للحسابات وواحدة للأرصدة.
        expect(capture.matching(/SELECT \* FROM users WHERE id = \$1/)).toBe(0);
        expect(capture.matching(/FROM points_ledger WHERE user_id = \$1/)).toBe(0);
        expect(capture.matching(/FROM users WHERE id = ANY/)).toBe(1);
        expect(capture.matching(/FROM points_ledger WHERE user_id = ANY/)).toBe(1);
      } finally {
        capture.stop();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe('Phase B — query plans on a year-of-trading dataset', () => {
    // ١٠٬٠٠٠ منتج وطلب وإشعار وتقييم، ٣٬٠٠٠ زبون: الحجم الذي تتغيّر عنده
    // الخطط من «كل شيء صغير» إلى ما سيراه الإنتاج. تُزرع مرةً وتُمحى.
    beforeAll(async () => {
      await db.query(await loadSql('perf-dataset-purge.sql'));
      await db.query(await loadSql('perf-dataset.sql'));
      // [CRITICAL] VACUUM لا ANALYZE وحده: الحالة المستقرّة التي يبلغها الإنتاج
      // بالتفريغ التلقائي. الزرع الجماعي يترك إدخالات فهارس GIN (trigram) في
      // «قائمة الانتظار» (٣١٦ صفحة بعد هذا الزرع)، و`ANALYZE` لا يدمجها —
      // فيُسعّر المخطّط الفهرس غالياً عن حقّ ويمسح الجدول. كان PERF-4 يفشل
      // لذلك لا لعيبٍ في الاستعلام: بعد الدمج يُستعمل الفهرس (٢٧ → ١٫٩ مللي
      // ثانية). لا إجبار على خطةٍ هنا — المخطّط حرٌّ كما في الإنتاج.
      await db.query('VACUUM ANALYZE products, product_images, orders, order_items, notifications, reviews, points_ledger, users');
    }, 180_000);

    afterAll(async () => {
      await db.query(await loadSql('perf-dataset-purge.sql'));
    }, 120_000);

    const perfOrderId = async () =>
      (await db.query<{ id: string }>("SELECT id FROM orders WHERE number = 'perf-3'")).rows[0]!.id;

    it('[PERF-4] public search uses the trigram index and never trips JIT — for both the page and the count', async () => {
      const statements = await statementsOf(() => productRepo.search(db, 'product-12', 1, 12), /FROM products p/);
      expect(statements).toHaveLength(2);
      for (const { text, values } of statements) {
        const plan = await explain(text, values);
        // `name ILIKE … OR EXISTS(…)` كان يمنع فهرس trigram فيمسح الكتالوج كله
        // (وبتقديرٍ مبالغ يتجاوز عتبة JIT فيُترجَم كل بحثٍ من جديد: ~٨٠ مللي
        // ثانية إضافية لكل جملة).
        expect(plan.usesIndex('idx_products_name_trgm'), JSON.stringify(plan.nodes.map((n) => [n['Node Type'], n['Relation Name'], n['Index Name']]))).toBe(true);
        expect(plan.jit, `JIT compiled: ${text}`).toBe(false);
      }
    });

    it('[PERF-4] a one-character search (the validator minimum) still avoids JIT', async () => {
      const statements = await statementsOf(() => productRepo.search(db, '9', 1, 12), /FROM products p/);
      for (const { text, values } of statements) {
        expect((await explain(text, values)).jit).toBe(false);
      }
    });

    it('[PERF-5] the admin orders list reads page 1 through an index — no full scan + sort of every order', async () => {
      const [unfiltered] = await statementsOf(() => orderRepo.listAll(db, 1, 20), /FROM orders o .*ORDER BY/s);
      const [filtered] = await statementsOf(() => orderRepo.listAll(db, 1, 20, 'COMPLETED'), /FROM orders o .*ORDER BY/s);
      for (const statement of [unfiltered!, filtered!]) {
        const plan = await explain(statement.text, statement.values);
        expect(plan.scansOf('orders'), statement.text.slice(0, 80)).not.toContain('Seq Scan');
      }
    });

    it('[PERF-5] the admin notifications list reads page 1 through an index', async () => {
      const [plain] = await statementsOf(() => notificationRepo.listForAdmin(db, { page: 1, limit: 20 }), /FROM notifications n/);
      const [byType] = await statementsOf(
        () => notificationRepo.listForAdmin(db, { page: 1, limit: 20, type: 'promotion', read: false }),
        /FROM notifications n/,
      );
      for (const statement of [plain!, byType!]) {
        const plan = await explain(statement.text, statement.values);
        expect(plan.scansOf('notifications'), statement.text.slice(0, 80)).not.toContain('Seq Scan');
      }
    });

    it('[PERF-5] review-points lookups under the order lock are indexed — no ledger scan per moderation', async () => {
      const orderId = await perfOrderId();
      const [byOrder] = await statementsOf(() => pointsRepo.reviewPointsForOrder(db, orderId), /FROM points_ledger/);
      expect((await explain(byOrder!.text, byOrder!.values)).scansOf('points_ledger')).not.toContain('Seq Scan');

      // الحذف يُشرح بلا تنفيذ (لا ANALYZE) — الخطة وحدها هي المطلوب.
      const reviewId = (await db.query<{ id: string }>("SELECT id FROM reviews WHERE comment = 'perf comment 5'")).rows[0]!.id;
      const [byReview] = await statementsOf(() => pointsRepo.revokeForReview(db, reviewId), /DELETE FROM points_ledger/);
      expect((await explain(byReview!.text, byReview!.values, false)).scansOf('points_ledger')).not.toContain('Seq Scan');
    });

    it('customer-facing lists stay index-backed at this scale (regression guard for existing indexes)', async () => {
      const userId = (await db.query<{ id: string }>("SELECT id FROM users WHERE phone = '+9647900000001'")).rows[0]!.id;
      const [orders] = await statementsOf(() => orderRepo.listByUser(db, userId, 1, 20), /FROM orders o .*ORDER BY/s);
      expect((await explain(orders!.text, orders!.values)).usesIndex('idx_orders_user')).toBe(true);
      const [notifications] = await statementsOf(() => notificationRepo.listMine(db, userId), /FROM notifications/);
      expect((await explain(notifications!.text, notifications!.values)).usesIndex('idx_notifications_user')).toBe(true);
      const [offers] = await statementsOf(() => productRepo.list(db, { page: 1, limit: 8, isOffer: true }), /FROM products p .*ORDER BY/s);
      expect((await explain(offers!.text, offers!.values)).usesIndex('idx_products_offer')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe('Phase C — pool safety on every failure path', () => {
    const pool = db as pg.Pool;
    const poolState = () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount });

    async function idleInTransaction() {
      const { rows } = await db.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND state LIKE 'idle in transaction%'`,
      );
      return rows[0]!.n;
    }

    /** يفشل عند `COMMIT` مرةً واحدة؛ نداءات `connect(cb)` تمرّ كما هي (انظر تدقيق #4). */
    function failNextCommit() {
      const original = db.connect.bind(db) as (cb?: unknown) => Promise<pg.PoolClient>;
      vi.spyOn(db, 'connect').mockImplementation((async (cb?: unknown) => {
        if (typeof cb === 'function') return original(cb);
        const client = await original();
        const query = client.query.bind(client);
        let armed = true;
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

    const FAILURES: Record<string, () => Promise<unknown>> = {
      'throw before any query': () => withTransaction(async () => { throw new Error('injected: before'); }),
      'throw after a query': () =>
        withTransaction(async (tx) => {
          await tx.query('SELECT 1');
          throw new Error('injected: after');
        }),
      'SQL error inside the transaction': () => withTransaction((tx) => tx.query('SELECT 1/0')),
      'nested repository throws': () =>
        withTransaction(async (tx) => {
          vi.spyOn(productRepo, 'findById').mockRejectedValueOnce(new Error('injected: nested'));
          await productRepo.findById(tx, '00000000-0000-0000-0000-000000000000');
        }),
      'COMMIT fails': () => {
        failNextCommit();
        return withTransaction((tx) => tx.query('SELECT 1'));
      },
    };

    for (const [name, run] of Object.entries(FAILURES)) {
      it(`[POOL] ${name} ×15 → every client returned, none idle-in-transaction`, async () => {
        for (let i = 0; i < 15; i += 1) {
          await expect(run()).rejects.toThrow();
          vi.restoreAllMocks();
        }
        const state = poolState();
        expect(state.idle).toBe(state.total);
        expect(state.waiting).toBe(0);
        expect(await idleInTransaction()).toBe(0);
      });
    }

    it('[POOL] after the failure storm the pool still serves `max` concurrent transactions', async () => {
      const max = pool.options.max ?? 10;
      const started = Date.now();
      const results = await Promise.all(
        Array.from({ length: max }, () => withTransaction((tx) => tx.query('SELECT pg_sleep(0.05)'))),
      );
      expect(results).toHaveLength(max);
      // عملاء مسرَّبون كانوا سيُسلسلون هذه أو يُعلّقونها حتى المهلة.
      expect(Date.now() - started).toBeLessThan(5_000);
      expect(poolState().waiting).toBe(0);
    });

    it('[POOL-2] a connection killed mid-transaction rejects that transaction only — no uncaught error, no crash', async () => {
      // عمليةٌ مستقلّة: الاستثناء غير الملتقَط يُسقطها هي لا مشغّل الاختبارات.
      const { spawnSync } = await import('node:child_process');
      const child = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/tx-connection-killed.ts'], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(child.stderr).not.toMatch(/Connection terminated unexpectedly|Unhandled 'error' event/);
      expect(child.status).toBe(0);
      // الخطأ الأصلي هو ما يصعد — لا فشل `ROLLBACK` على اتصالٍ ميت يخفيه.
      expect(child.stdout).toMatch(/TX-REJECTED (Connection terminated unexpectedly|terminating connection due to administrator command)/);
      expect(child.stdout).not.toMatch(/not queryable/);
      expect(child.stdout).toContain('POOL-SERVING');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe('Phase D — every list endpoint has a hard upper bound', () => {
    let customerToken: string;
    beforeAll(async () => {
      customerToken = (await registerAndLogin()).token;
    });

    const PUBLIC = ['/api/catalog/products', '/api/catalog/products/search?q=a&'];
    const CUSTOMER = ['/api/orders', '/api/favorites'];
    const ADMIN = [
      '/api/admin/products',
      '/api/admin/orders',
      '/api/admin/users',
      '/api/admin/notifications',
      '/api/admin/reviews',
      '/api/admin/account-requests',
      '/api/admin/loyalty-rewards',
      '/api/admin/customers/birthdays',
    ];

    const withLimit = (url: string, limit: number) =>
      url.endsWith('&') ? `${url}limit=${limit}` : `${url}?limit=${limit}`;

    it('[BOUND] limit=10000 is rejected (400) on every paginated endpoint — no unbounded page', async () => {
      const offenders: string[] = [];
      for (const url of PUBLIC) {
        const res = await api.get(withLimit(url, 10_000));
        if (res.status !== 400) offenders.push(`${url} → ${res.status}`);
      }
      for (const url of CUSTOMER) {
        const res = await api.get(withLimit(url, 10_000)).set(authed(customerToken));
        if (res.status !== 400) offenders.push(`${url} → ${res.status}`);
      }
      for (const url of ADMIN) {
        const res = await api.get(withLimit(url, 10_000)).set(authed(adminToken));
        if (res.status !== 400) offenders.push(`${url} → ${res.status}`);
      }
      expect(offenders).toEqual([]);
    });

    it('[BOUND] the customer notifications feed is capped at 100 rows server-side', async () => {
      const { userId, token } = await registerAndLogin();
      await db.query(
        `INSERT INTO notifications (user_id, type, title)
         SELECT $1, 'promotion', 'perf cap ' || g FROM generate_series(1, 130) g`,
        [userId],
      );
      const res = await api.get('/api/notifications').set(authed(token)).expect(200);
      expect(res.body.data.items).toHaveLength(100);
      expect(res.body.data.unread).toBe(130);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  describe('Phase E — rating-reminder scheduler lifecycle', () => {
    const DISPATCH = /SET rating_reminder_sent_at = now\(\)/;

    afterEach(() => {
      vi.useRealTimers();
    });

    function controlledDispatch() {
      const pending: Array<() => void> = [];
      let calls = 0;
      const original = db.query.bind(db) as (...args: unknown[]) => unknown;
      vi.spyOn(db, 'query').mockImplementation(((...args: unknown[]) => {
        const text = typeof args[0] === 'string' ? args[0] : '';
        if (!DISPATCH.test(text)) return original(...args);
        calls += 1;
        return new Promise((resolve) => pending.push(() => resolve({ rows: [] })));
      }) as typeof db.query);
      return {
        get calls() {
          return calls;
        },
        finishAll: () => pending.splice(0).forEach((finish) => finish()),
      };
    }

    it('[JOB] ticks once at start, once per interval, never overlaps a slow tick, and stop() ends it', async () => {
      vi.useFakeTimers();
      const dispatch = controlledDispatch();
      const stop = startRatingReminderScheduler(1_000);

      expect(dispatch.calls).toBe(1); // الدورة الأولى فوراً

      // الدورة الأولى ما تزال معلّقة: ثلاث نبضات لا تُطلق دورةً ثانية.
      await vi.advanceTimersByTimeAsync(3_000);
      expect(dispatch.calls).toBe(1);

      dispatch.finishAll();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(dispatch.calls).toBe(2);
      dispatch.finishAll();

      stop();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(dispatch.calls).toBe(2);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('[JOB] a failing tick is logged and the next interval runs again', async () => {
      vi.useFakeTimers();
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      let calls = 0;
      const original = db.query.bind(db) as (...args: unknown[]) => unknown;
      vi.spyOn(db, 'query').mockImplementation(((...args: unknown[]) => {
        const text = typeof args[0] === 'string' ? args[0] : '';
        if (!DISPATCH.test(text)) return original(...args);
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('injected: tick failure')) : Promise.resolve({ rows: [] });
      }) as typeof db.query);

      const stop = startRatingReminderScheduler(1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(calls).toBe(2);
      expect(errors).toHaveBeenCalledTimes(1);
      stop();
    });
  });
});
