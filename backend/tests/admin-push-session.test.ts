import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
