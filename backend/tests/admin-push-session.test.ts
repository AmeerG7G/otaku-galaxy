import jwt from 'jsonwebtoken';
import type pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { dispatchPushOutbox } from '../src/jobs/pushOutboxJob.js';
import { adminPushRepo } from '../src/repositories/adminPushRepo.js';
import { pushOutboxRepo } from '../src/repositories/pushOutboxRepo.js';
import type { PushMessage, PushProvider } from '../src/services/push/index.js';
import { api, createSubAdmin, purgeSubAdmins } from './helpers.js';

/**
 * أجهزة إشعار المسؤول مربوطةٌ بجلسته (Gate 2، هجرة ٠٨٢).
 *
 * [SECURITY] إشعارات المسؤول تحمل اسم الزبون وهاتفه ومبلغ طلبه. متصفّحٌ انتهت
 * جلسته — والّلوحة مغلقة، فلا ٤٠١ تصل الصفحة لتنظّف شيئاً — كان يبقى يستقبلها
 * سبعة أيامٍ وأكثر. الجهاز الآن يحمل موعد انتهاء الجلسة التي سجّلته، والخادم لا
 * يرسل ولا يُدرج حدثاً لجهازٍ جلستُه منتهية. إعادة التسجيل من جلسةٍ جديدة
 * (`syncWebPush` في اللوحة) تمدّده.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

let seq = 0;
const browserToken = (label: string) => `admin-session-${label}-${Date.now()}-${seq++}`.padEnd(48, 'x');

function recordingProvider() {
  const calls: PushMessage[] = [];
  const provider: PushProvider = {
    name: 'recording',
    async send(message) {
      calls.push(message);
      return { sent: message.tokens.length, invalidTokens: [], transientFailures: 0 };
    },
  };
  return { provider, calls };
}

const expireSession = (token: string) =>
  db.query("UPDATE admin_push_devices SET session_expires_at = now() - interval '1 second' WHERE token = $1", [token]);

async function deviceRow(token: string) {
  const { rows } = await db.query<{ is_active: boolean; session_expires_at: Date | null }>(
    'SELECT is_active, session_expires_at FROM admin_push_devices WHERE token = $1',
    [token],
  );
  return rows[0];
}

describe('أجهزة المسؤول مربوطة بجلسته', () => {
  let admin: Awaited<ReturnType<typeof createSubAdmin>>;
  const created: string[] = [];

  async function register(sessionToken: string, label: string) {
    const token = browserToken(label);
    created.push(token);
    await api.post('/api/admin/devices').set(bearer(sessionToken)).send({ token, platform: 'web' }).expect(200);
    return token;
  }

  /** حدثٌ إداري لقسم «الطلبات» — `enqueueAdminEvent` نفسه الذي يستدعيه إنشاء الطلب. */
  async function newOrderEvent() {
    const orderId = crypto.randomUUID();
    await pushOutboxRepo.enqueueAdminEvent(db, {
      event: 'new_order',
      title: 'طلب جديد',
      body: 'زبون — ١٠٠٠٠ د.ع',
      data: { url: `/orders/${orderId}`, orderId },
    });
    const { rows } = await db.query<{ id: string }>(
      "SELECT id::text FROM push_outbox WHERE audience = 'admin' AND user_id = $1 AND data->>'orderId' = $2",
      [admin.userId, orderId],
    );
    return rows;
  }

  beforeAll(async () => {
    admin = await createSubAdmin(['orders'], { suffix: 820 });
  });

  // كل حالةٍ تبدأ بلا أجهزة لهذا المسؤول — جهازُ حالةٍ سابقة لا يغيّر النتيجة.
  beforeEach(async () => {
    await db.query('DELETE FROM admin_push_devices WHERE user_id = $1', [admin.userId]);
  });

  afterAll(async () => {
    await db.query('DELETE FROM push_outbox WHERE user_id = $1', [admin.userId]);
    await db.query('DELETE FROM admin_push_devices WHERE token = ANY($1::text[])', [created]);
    await purgeSubAdmins();
  });

  it('[SECURITY] التسجيل يحفظ موعد انتهاء الجلسة التي سجّلت الجهاز — `exp` توكنها بالضبط', async () => {
    const token = await register(admin.token, 'exp');
    const { exp } = jwt.decode(admin.token) as { exp: number };
    expect((await deviceRow(token))!.session_expires_at!.getTime()).toBe(exp * 1000);
  });

  it('[SECURITY] جلسةٌ منتهية: لا صفّ في الصندوق، ولا رمز يُرسَل إليه ولو التُقط صفٌّ قبل الانتهاء', async () => {
    const token = await register(admin.token, 'expired');
    // صفٌّ أُدرج والجلسة صالحة…
    const [queued] = await newOrderEvent();
    expect(queued).toBeDefined();

    // …ثم انتهت الجلسة قبل الإرسال: لا يُرسل إلى هذا المتصفّح.
    await expireSession(token);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).not.toContain(token);
    const { provider, calls } = recordingProvider();
    await dispatchPushOutbox({ provider, batchSize: 100_000 });
    expect(calls.flatMap((call) => call.tokens)).not.toContain(token);
    const settled = await db.query<{ status: string; last_error: string | null }>(
      'SELECT status, last_error FROM push_outbox WHERE id = $1',
      [queued!.id],
    );
    expect(settled.rows[0]).toEqual({ status: 'skipped', last_error: 'no_devices' });

    // وحدثٌ جديد لا يُدرج أصلاً لمسؤولٍ كل أجهزته منتهية الجلسة.
    expect(await newOrderEvent()).toHaveLength(0);
    // ولا يُعدّ جهازاً مسجَّلاً في حالة اللوحة.
    const status = await api.get('/api/admin/push/status').set(bearer(admin.token)).expect(200);
    expect(status.body.data.devices).toBe(0);
  });

  it('جلسةٌ جديدة تعيد تسجيل الرمز نفسه فتمدّده (resync)، ويعود يستقبل', async () => {
    const token = await register(admin.token, 'renew');
    await expireSession(token);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).not.toContain(token);

    await api.post('/api/admin/devices').set(bearer(admin.token)).send({ token, platform: 'web' }).expect(200);
    const row = await deviceRow(token);
    expect(row!.is_active).toBe(true);
    expect(row!.session_expires_at!.getTime()).toBeGreaterThan(Date.now());
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).toContain(token);
  });

  it('[SECURITY] صفٌّ قديم بلا موعد جلسة (قبل ٠٨٢) لا يُرسل إليه حتى تعيد اللوحة تسجيله', async () => {
    const token = await register(admin.token, 'legacy');
    await db.query('UPDATE admin_push_devices SET session_expires_at = NULL WHERE token = $1', [token]);
    expect(await pushOutboxRepo.adminTokens(db, admin.userId)).not.toContain(token);
  });

  it('متصفّحان للمسؤول نفسه: كلٌّ بجلسته — انتهاء أحدهما أو إيقافه لا يمسّ الآخر', async () => {
    // الجلسة الثانية: توكنٌ موقَّع بالمفتاح نفسه وبنسخة الصف الحالية، أطول عمراً.
    const { rows } = await db.query<{ token_version: number }>('SELECT token_version FROM users WHERE id = $1', [
      admin.userId,
    ]);
    const secondSession = jwt.sign(
      { sub: admin.userId, role: 'admin', phone: admin.phone, tv: rows[0]!.token_version },
      config.jwtSecret,
      { expiresIn: '2d' },
    );
    const laptop = await register(admin.token, 'laptop');
    const phone = await register(secondSession, 'phone');

    await expireSession(laptop);
    let tokens = await pushOutboxRepo.adminTokens(db, admin.userId);
    expect(tokens).toContain(phone);
    expect(tokens).not.toContain(laptop);

    // إيقاف أحدهما من صاحبه لا يعطّل الآخر.
    await api.post('/api/admin/devices/unregister').set(bearer(secondSession)).send({ token: phone }).expect(200);
    await api.post('/api/admin/devices').set(bearer(admin.token)).send({ token: laptop, platform: 'web' }).expect(200);
    tokens = await pushOutboxRepo.adminTokens(db, admin.userId);
    expect(tokens).toContain(laptop);
    expect(tokens).not.toContain(phone);
    expect(await adminPushRepo.activeCount(db, admin.userId)).toBeGreaterThanOrEqual(1);
  });
});

// ── حاجز قفل (نمط تدقيقَي #2 و#4، كما في `contract-closure.test.ts`) ──────────

async function blockedSessions() {
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'`,
  );
  return rows[0]!.n;
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

describe('[SECURITY] تسجيلٌ يسابق إبطال الجلسة', () => {
  /**
   * المصادقة تفحص `token_version` قبل معاملة التسجيل. تسجيلٌ تجاوزها ثم
   * أُبطلت الجلسة (تغيير كلمة المرور، الإيقاف — رفع النسخة و`deactivateAll`
   * في معاملةٍ واحدة) كان يُحفظ بعدها نشطاً حتى انتهاء التوكن: قناةٌ تحمل
   * بيانات الزبائن لجلسةٍ مُبطلة. التسجيل الآن يعيد فحص الجلسة تحت قفل الصف.
   */
  let revoked: Awaited<ReturnType<typeof createSubAdmin>>;
  const tokens: string[] = [];

  beforeAll(async () => {
    revoked = await createSubAdmin(['orders'], { suffix: 821 });
  });

  afterAll(async () => {
    await db.query('DELETE FROM admin_push_devices WHERE token = ANY($1::text[])', [tokens]);
    await purgeSubAdmins();
  });

  it('الإبطال يمسك الصف والتسجيل قد صادق: يُرفض بـSESSION_REVOKED ولا يبقى جهازٌ نشط', async () => {
    const token = browserToken('revoked-race');
    tokens.push(token);
    const client: pg.PoolClient = await db.connect();
    try {
      // معاملة الإبطال كما في `adminAccountsService`: رفع النسخة ثم تعطيل الأجهزة — لم تلتزم بعد.
      await client.query('BEGIN');
      await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [revoked.userId]);
      await adminPushRepo.deactivateAll(client, revoked.userId);

      // المصادقة تقرأ النسخة الملتزمة (القديمة) فتمرّ — ثم يصل الطلب إلى معاملته.
      const pending = api
        .post('/api/admin/devices')
        .set(bearer(revoked.token))
        .send({ token, platform: 'web' })
        .then((response) => response);
      await settledOrBlocked(pending, 1);

      await client.query('COMMIT');
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.body.error?.code).toBe('SESSION_REVOKED');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    const row = await deviceRow(token);
    expect(row === undefined || row.is_active === false).toBe(true);
    expect(await adminPushRepo.activeCount(db, revoked.userId)).toBe(0);
  });
});

/** ينتظر حتى تكون `n` جلسات بالضبط منتظرةً قفلاً في هذه القاعدة. */
async function waitForBlocked(n: number) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    if ((await blockedSessions()) === n) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`لم تُحجب ${n} جلسات على القفل خلال المهلة`);
}

/**
 * ينتظر جلسةً تنتظر قفلاً وعبارتها تبدأ بـ`prefix` — لا يكفي عدُّ المنتظرين: في الشيفرة
 * المعيبة ينتظر `deactivateAll` صفَّ الجهاز بدل أن ينتظر الإبطالُ صفَّ المسؤول.
 */
async function waitForLockWaiter(prefix: string) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE $1`,
      [`${prefix}%`],
    );
    if (rows[0]!.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`لا جلسة تنتظر قفلاً عند: ${prefix}`);
}

/** فشل الالتزام مرةً واحدة للعميل التالي الذي يطلبه `withTransaction` (نمط تدقيق #4). */
function failNextCommit() {
  const original = db.connect.bind(db) as (cb?: unknown) => Promise<pg.PoolClient>;
  let armed = true;
  return vi.spyOn(db, 'connect').mockImplementation((async (cb?: unknown) => {
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

describe('[SECURITY] التسجيل والإبطال: كل ترتيبٍ ينتهي بحالةٍ صحيحة', () => {
  /**
   * القفل `FOR SHARE` على صفّ المسؤول يرتّب التسجيل والإبطال في الاتجاهين، بترتيب
   * الأقفال نفسه (users ثم admin_push_devices) فلا جمود. كل حالةٍ بمسؤولٍ خاص —
   * الإبطال يُسقط توكنه.
   */
  const tokens: string[] = [];
  const freshToken = (label: string) => {
    const token = browserToken(label);
    tokens.push(token);
    return token;
  };
  const registerDevice = (sessionToken: string, token: string) =>
    api.post('/api/admin/devices').set(bearer(sessionToken)).send({ token, platform: 'web' }).then((r) => r);
  const activeRows = async (userId: string) =>
    (
      await db.query<{ token: string }>(
        'SELECT token FROM admin_push_devices WHERE user_id = $1 AND is_active ORDER BY token',
        [userId],
      )
    ).rows.map((row) => row.token);

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await db.query('DELETE FROM admin_push_devices WHERE token = ANY($1::text[])', [tokens]);
    await purgeSubAdmins();
  });

  it('إيقاف الحساب يمسك الصف والتسجيل قد صادق: يُرفض بـACCOUNT_SUSPENDED (كالمصادقة) ولا جهاز نشط', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 822 });
    const token = freshToken('suspended-race');
    const client: pg.PoolClient = await db.connect();
    try {
      // الإيقاف كما في `adminAccountsService`: الحساب يُوقف والنسخة ترتفع والأجهزة تُعطَّل.
      await client.query('BEGIN');
      await client.query(
        'UPDATE users SET is_active = FALSE, token_version = token_version + 1 WHERE id = $1',
        [admin.userId],
      );
      await adminPushRepo.deactivateAll(client, admin.userId);
      const pending = registerDevice(admin.token, token);
      expect(await settledOrBlocked(pending, 1)).toBe('blocked');
      await client.query('COMMIT');
      const response = await pending;
      expect(response.status).toBe(403);
      expect(response.body.error?.code).toBe('ACCOUNT_SUSPENDED');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    expect(await activeRows(admin.userId)).toEqual([]);
  });

  it('إيقافٌ بلا رفع نسخة (حالة حدّية): القفل يرفضه أيضاً — `is_active` يُفحص تحت القفل', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 823 });
    const token = freshToken('inactive-only');
    const client: pg.PoolClient = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE users SET is_active = FALSE WHERE id = $1', [admin.userId]);
      const pending = registerDevice(admin.token, token);
      expect(await settledOrBlocked(pending, 1)).toBe('blocked');
      await client.query('COMMIT');
      const response = await pending;
      expect(response.status).toBe(403);
      expect(response.body.error?.code).toBe('ACCOUNT_SUSPENDED');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
    expect(await activeRows(admin.userId)).toEqual([]);
  });

  it('الترتيب المعاكس: التسجيل يمسك الصف أولاً والإبطال ينتظره ثم يعطّل الجهاز — بلا جمود', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 824 });
    const token = freshToken('reverse-order');
    expect((await registerDevice(admin.token, token)).status).toBe(200);

    const holder: pg.PoolClient = await db.connect();
    const revoker: pg.PoolClient = await db.connect();
    try {
      // صفّ الجهاز ممسوك: التسجيل الثاني يأخذ قفل المسؤول ثم يقف على صفّ الجهاز.
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM admin_push_devices WHERE token = $1 FOR UPDATE', [token]);
      const registering = registerDevice(admin.token, token);
      await waitForBlocked(1);

      // الإبطال يقف خلف قفل التسجيل على صفّ المسؤول — ولا يصل الأجهزة قبله.
      await revoker.query('BEGIN');
      const revoking = (async () => {
        await revoker.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [admin.userId]);
        await adminPushRepo.deactivateAll(revoker, admin.userId);
        await revoker.query('COMMIT');
      })();
      await waitForLockWaiter('UPDATE users SET token_version');
      await waitForBlocked(2);

      await holder.query('ROLLBACK');
      const response = await registering;
      await revoking;
      expect(response.status).toBe(200);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await revoker.query('ROLLBACK').catch(() => undefined);
      holder.release();
      revoker.release();
    }
    expect(await activeRows(admin.userId)).toEqual([]);
    // وتوكن الجلسة المُبطلة لا يسجّل بعدها.
    const after = await registerDevice(admin.token, freshToken('after-revoke'));
    expect(after.status).toBe(401);
    expect(await activeRows(admin.userId)).toEqual([]);
  });

  it('تسجيلان متزامنان للرمز نفسه: كلاهما 200 وصفٌّ واحد نشط', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 825 });
    const token = freshToken('duplicate');
    const [first, second] = await Promise.all([registerDevice(admin.token, token), registerDevice(admin.token, token)]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const { rows } = await db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM admin_push_devices WHERE token = $1',
      [token],
    );
    expect(rows[0]!.n).toBe(1);
    expect(await activeRows(admin.userId)).toEqual([token]);
  });

  it('إبطالان متتاليان: الثاني بلا أثر، ولا جهاز يعود نشطاً', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 826 });
    const token = freshToken('double-revoke');
    expect((await registerDevice(admin.token, token)).status).toBe(200);
    for (let round = 0; round < 2; round += 1) {
      const client: pg.PoolClient = await db.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [admin.userId]);
        await adminPushRepo.deactivateAll(client, admin.userId);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
    expect(await activeRows(admin.userId)).toEqual([]);
    expect((await registerDevice(admin.token, freshToken('double-revoke-after'))).status).toBe(401);
  });

  it('فشل الالتزام: لا صفّ يُحفظ، والقفل يُحرَّر فلا يعلق إبطالٌ بعده', async () => {
    const admin = await createSubAdmin(['orders'], { suffix: 827 });
    const token = freshToken('commit-failure');
    failNextCommit();
    const failed = await registerDevice(admin.token, token);
    vi.restoreAllMocks();
    expect(failed.status).toBe(500);
    const { rows } = await db.query('SELECT 1 FROM admin_push_devices WHERE token = $1', [token]);
    expect(rows).toHaveLength(0);

    // لا قفل متروك على صفّ المسؤول: إبطالٌ بمهلة قفلٍ قصيرة يمرّ فوراً.
    const client: pg.PoolClient = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '2s'");
      await client.query('UPDATE users SET token_version = token_version WHERE id = $1', [admin.userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    // والتسجيل التالي ينجح بالجلسة نفسها.
    expect((await registerDevice(admin.token, token)).status).toBe(200);
    expect(await activeRows(admin.userId)).toEqual([token]);
  });
});
