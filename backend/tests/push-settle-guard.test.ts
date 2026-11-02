import { generateKeyPairSync } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database/pool.js';
import { dispatchPushOutbox, scrubPushError } from '../src/jobs/pushOutboxJob.js';
import { pushOutboxRepo } from '../src/repositories/pushOutboxRepo.js';
import { FcmPushProvider, GOOGLE_TOKEN_URL, parseRetryAfter, type PushProvider } from '../src/services/push/index.js';
import { api, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * حسم صفوف الدفع — مرة واحدة، بأعداد الأجهزة، وبميزانية دور.
 *
 * [CRITICAL] (١) عاملٌ انتهى حجزه لا يكتب نتيجته فوق عاملٍ التقط الصفّ بعده؛
 * (٢) أعداد الأجهزة تُحفظ («قبلتها FCM» لا «وصلت»)؛ (٣) `Retry-After` يُحترم؛
 * (٤) ما لم يُعالَج في ميزانية الدور يعود بلا استهلاك محاولة؛ (٥) لا رمز في
 * `last_error`.
 */

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
let customer: { token: string; userId: string };
let seq = 0;

async function newPendingRow() {
  seq += 1;
  // جملتان: صفّ الصندوق يكتبه زنادٌ، ولا تراه جملةٌ واحدة تُدرج الإشعار (لقطة الجملة).
  const notification = await db.query<{ id: string }>(
    `INSERT INTO notifications (user_id, type, title) VALUES ($1, 'orderAccepted', $2) RETURNING id`,
    [customer.userId, `حسم ${seq}`],
  );
  const { rows } = await db.query<{ id: string }>(
    'SELECT id::text AS id FROM push_outbox WHERE notification_id = $1',
    [notification.rows[0]!.id],
  );
  return rows[0]!.id;
}

async function row(id: string) {
  const { rows } = await db.query<{
    status: string;
    attempts: number;
    devices_accepted: number;
    devices_invalid: number;
    devices_transient: number;
    last_error: string | null;
    due_in_seconds: number;
  }>(
    `SELECT status, attempts, devices_accepted, devices_invalid, devices_transient, last_error,
            EXTRACT(EPOCH FROM next_attempt_at - now())::int AS due_in_seconds
       FROM push_outbox WHERE id = $1`,
    [id],
  );
  return rows[0]!;
}

function stub(result: { sent?: number; invalid?: string[]; transient?: number; retryAfterSeconds?: number }): PushProvider {
  return {
    name: 'stub',
    async send() {
      return {
        sent: result.sent ?? 0,
        invalidTokens: result.invalid ?? [],
        transientFailures: result.transient ?? 0,
        ...(result.retryAfterSeconds !== undefined ? { retryAfterSeconds: result.retryAfterSeconds } : {}),
      };
    },
  };
}

beforeAll(async () => {
  customer = await registerAndLogin();
  for (const token of ['settle-device-a-000000', 'settle-device-b-000000', 'settle-device-c-000000']) {
    await api.post('/api/devices').set(bearer(customer.token)).send({ token, platform: 'android' }).expect(200);
  }
});

afterAll(async () => {
  await purgeTestUsers();
});

describe('الحسم المحروس', () => {
  it('[CRITICAL] عاملٌ انتهى حجزه لا يحسم صفّاً التقطه غيره — حسمٌ واحد وعدٌّ واحد', async () => {
    const id = await newPendingRow();
    // العامل «أ» يلتقط (المحاولة ١)، ثم ينتهي حجزه فيلتقط «ب» (المحاولة ٢).
    await db.query('UPDATE push_outbox SET attempts = attempts + 1 WHERE id = $1', [id]);
    await db.query('UPDATE push_outbox SET attempts = attempts + 1 WHERE id = $1', [id]);
    const devices = { accepted: 1, invalid: 0, transient: 0 };
    expect(await pushOutboxRepo.markSent(db, { id, attempts: 2 }, devices)).toBe(true);
    // «أ» يعود متأخراً بنتيجته — لا أثر لها.
    expect(await pushOutboxRepo.markFailed(db, { id, attempts: 1 }, 'late_worker')).toBe(false);
    expect(await pushOutboxRepo.markSent(db, { id, attempts: 2 }, devices)).toBe(false);
    expect(await row(id)).toMatchObject({ status: 'sent', attempts: 2, last_error: null, devices_accepted: 1 });
  });

  it('[CRITICAL] أعداد الأجهزة تُحفظ: مقبولة لدى FCM، رموزٌ مرفوضة، وعطلٌ عابر', async () => {
    const id = await newPendingRow();
    const summary = await dispatchPushOutbox({
      provider: stub({ sent: 1, invalid: ['settle-device-c-000000'], transient: 1 }),
      batchSize: 100_000,
    });
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(await row(id)).toMatchObject({
      status: 'sent',
      devices_accepted: 1,
      devices_invalid: 1,
      devices_transient: 1,
      last_error: 'partial:1',
    });
  });

  it('[CRITICAL] Retry-After يُحترم حين يتجاوز تباعد المحاولة', async () => {
    const id = await newPendingRow();
    await dispatchPushOutbox({ provider: stub({ transient: 2, retryAfterSeconds: 900 }), batchSize: 100_000 });
    const after = await row(id);
    expect(after.status).toBe('pending');
    expect(after.due_in_seconds).toBeGreaterThan(800);
  });

  it('[CRITICAL] انقضاء الميزانية يعيد الصفوف الملتقَطة بلا استهلاك محاولة', async () => {
    const id = await newPendingRow();
    let tick = 0;
    const summary = await dispatchPushOutbox({
      provider: stub({ sent: 1 }),
      batchSize: 100_000,
      budgetMs: 1,
      now: () => (tick += 1_000),
    });
    expect(summary.released).toBeGreaterThanOrEqual(1);
    expect(await row(id)).toMatchObject({ status: 'pending', attempts: 0 });
  });
});

describe('النصوص والتوقيت', () => {
  it('[SECURITY] لا رمز جهازٍ ولا مفتاح في last_error', () => {
    const token = 'dQw4w9WgXcQ:APA91bH' + 'x'.repeat(140);
    expect(scrubPushError(`send failed for ${token}`)).toBe('send failed for [redacted]');
    expect(scrubPushError('y'.repeat(1000)).length).toBeLessThanOrEqual(300);
  });

  it('Retry-After بالثواني أو بتاريخ HTTP', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter(new Date(10_000 + 30_000).toUTCString(), 10_000)).toBeGreaterThanOrEqual(29);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('FCM — إرسالٌ متوازٍ وتبادلٌ واحد لرمز الوصول', () => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const settings = { projectId: 'otaku-test', clientEmail: 'push@otaku-test.iam.gserviceaccount.com', privateKey, timeoutMs: 500 };

  afterEach(() => vi.unstubAllGlobals());

  it('[CRITICAL] ستة رموز: تبادلٌ واحد، وRetry-After من 429 يُرفع إلى المستدعي', async () => {
    let exchanges = 0;
    let sends = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === GOOGLE_TOKEN_URL) {
        exchanges += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return new Response(JSON.stringify({ access_token: 'ya29.once', expires_in: 3600 }), { status: 200 });
      }
      sends += 1;
      if (sends === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '120' } });
      return new Response('{}', { status: 200 });
    });
    const result = await new FcmPushProvider(settings).send({
      tokens: ['a', 'b', 'c', 'd', 'e', 'f'],
      title: 'x',
      body: 'y',
    });
    expect(exchanges).toBe(1);
    expect(result).toMatchObject({ sent: 5, transientFailures: 1, retryAfterSeconds: 120, invalidTokens: [] });
  });
});
