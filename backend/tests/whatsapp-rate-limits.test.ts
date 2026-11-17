import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * [CRITICAL] الحدود الطبقية للتسجيل عبر واتساب (STEP 85) والطريقان.
 *
 * عبر HTTP كما يصل الزبون فعلاً: عنوان الزبون موقَّعٌ بـ`BFF_SHARED_SECRET`
 * (`X-OG-Client-IP`) — المسار نفسه الذي يسلكه الموقع — فيملك كل اختبارٍ
 * عناوينه. حدود الذاكرة مفعّلة هنا (`RATE_LIMIT_ENFORCE_IN_TESTS`) بقيمها
 * الافتراضية، فيُرى أثرها مع حدود القاعدة معاً.
 *
 * ═══ ما يُثبته ═══
 *  1  أربعون زبوناً خلف عنوانٍ واحد (NAT المشغّل) يتحقّقون جميعاً.
 *  2  الجلسة الحادية والثلاثون غير المتحقَّق منها من عنوانٍ واحد: ٤٢٩.
 *  3  IPv6 في شبكة ‎/56 واحدة حصّةٌ واحدة؛  4  ‎/56 أخرى حصّةٌ مستقلة.
 *  5  بداياتٌ متزامنة لا تتجاوز حصّة العنوان.
 *  6  عناوين كثيرة على رقمٍ واحد لا تتجاوز حدود الرقم.
 *  7  الحدود العامّة: «مشغول» — والجلسة المتحقَّق منها تكمل، والطلب الإداري يعمل.
 *  8  سقف الرسائل الصادرة.   9  التأخير المتصاعد.   10  Retry-After صحيح.
 *  11 ترويسات العنوان المزوَّرة لا تغيّر المفتاح.
 *  12 `registration-options` لا يستهلك حدّ الدخول.
 *  13 الطريق الإداري بلا واتساب: طلبٌ معلَّق حتى الموافقة.
 *  14 الطريق التلقائي: حسابٌ مفعَّل.   15 `off`: التسجيل كما كان.
 */
const SECRET = vi.hoisted(() => {
  const secret = 'wa-rate-limit-suite-bff-secret-0123456789ab';
  const saved = { ...process.env };
  Object.assign(process.env, { BFF_SHARED_SECRET: secret, RATE_LIMIT_ENFORCE_IN_TESTS: '1' });
  (globalThis as { __waRateSavedEnv?: NodeJS.ProcessEnv }).__waRateSavedEnv = saved;
  return secret;
});

import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { runWhatsAppOutboxOnce } from '../src/jobs/whatsappOutboxJob.js';
import { clientIp, resolveClientIp, signClientIp } from '../src/middleware/client-ip.js';
import { signMetaPayload } from '../src/services/whatsapp/metaWebhook.js';
import { fixtureSent, setFixtureSendFailure } from '../src/services/whatsapp/provider.js';
import { resetCapWarningsForTests, signupIpKey } from '../src/services/whatsappSignupService.js';
import { api, createAdminUser, purgeTestUsers } from './helpers.js';

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const wa = config.whatsapp as Mutable<typeof config.whatsapp>;
const ORIGINAL = { mode: wa.mode, limits: structuredClone(wa.limits), confirmation: wa.confirmationMessage };

afterAll(async () => {
  wa.mode = ORIGINAL.mode;
  Object.assign(wa.limits, structuredClone(ORIGINAL.limits));
  wa.confirmationMessage = ORIGINAL.confirmation;
  await cleanup();
  const saved = (globalThis as { __waRateSavedEnv?: NodeJS.ProcessEnv }).__waRateSavedEnv!;
  for (const name of ['BFF_SHARED_SECRET', 'RATE_LIMIT_ENFORCE_IN_TESTS']) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

// ═══ أدوات ═══

let phoneSeq = Math.floor(Math.random() * 1_000_000);
/** أرقام ‎077… فريدة في هذا التشغيل (يحذفها `purgeTestUsers` وتنظيف الجلسات). */
const freshLocal = () => `0779${String(1_000_000 + (++phoneSeq % 8_999_999)).padStart(7, '0')}`;
const toE164 = (local: string) => `+964${local.slice(1)}`;
const digits = (local: string) => `964${local.slice(1)}`;
let seq = 0;
const wamid = () => `wamid.TESTRL${Date.now()}${++seq}`;

let ipSeq = 0;
/** عنوان IPv4 فريد لكل اختبار (نطاقات التوثيق). */
const freshIp = () => {
  ipSeq++;
  return `198.51.${100 + Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
};

const asClient = (ip: string) => signClientIp(SECRET, ip);

function startFrom(ip: string, local = freshLocal()) {
  return api.post('/api/auth/register/whatsapp/start').set(asClient(ip)).send({ phone: local });
}

async function startOk(ip: string, local = freshLocal()) {
  const res = await startFrom(ip, local);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { local, phone: toE164(local), ...(res.body.data as { sessionId: string; secret: string; code: string }) };
}

function textPayload(from: string, text: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-TEST',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '9647500000000', phone_number_id: 'PNID-TEST' },
          contacts: [{ profile: { name: 'زبون' }, wa_id: from, user_id: `IQ.RL${from}` }],
          messages: [{ from, from_user_id: `IQ.RL${from}`, id: wamid(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
}

/** رسالةٌ بلا رقم (اسم مستخدم واتساب) — تنتظر الجلسة مشاركة الرقم ويُطلب ردٌّ صادر. */
function usernameOnlyPayload(userId: string, text: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-TEST',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'PNID-TEST' },
          contacts: [{ profile: { name: 'زبون' }, user_id: userId }],
          messages: [{ from_user_id: userId, id: wamid(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
}

function postWebhook(payload: unknown) {
  const raw = JSON.stringify(payload);
  return api
    .post('/api/webhooks/whatsapp')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', signMetaPayload(raw, wa.appSecret))
    .send(raw);
}

async function verify(s: { local: string; code: string }) {
  expect((await postWebhook(textPayload(digits(s.local), `الرمز: ${s.code}`))).status).toBe(200);
}

const status = (s: { sessionId: string; secret: string }) =>
  api.post('/api/auth/register/whatsapp/status').send({ sessionId: s.sessionId, secret: s.secret });

const complete = (s: { sessionId: string; secret: string }) =>
  api
    .post('/api/auth/register/whatsapp/complete')
    .send({ sessionId: s.sessionId, secret: s.secret, username: 'زبون واتساب', gender: 'female', password: 'whatsapp-pass-1' });

/** Retry-After والحقل نفسه، عددٌ صحيح موجب داخل المدى المتوقَّع. */
function expectRetry(res: request.Response, min: number, max: number) {
  expect(res.status).toBe(429);
  const header = Number(res.headers['retry-after']);
  expect(Number.isInteger(header)).toBe(true);
  expect(res.body.error.retryAfterSeconds).toBe(header);
  expect(header).toBeGreaterThanOrEqual(min);
  expect(header).toBeLessThanOrEqual(max);
  return header;
}

/** يُخرج جلسات رقمٍ من «الحيّة» (انتهت مهلتها) دون أن يمسّ عدّ البدايات. */
const expireLive = (phone: string) =>
  db.query(`UPDATE whatsapp_signup_sessions SET expires_at = now() - interval '1 second' WHERE phone = $1 AND status = 'pending'`, [phone]);

async function cleanup() {
  await db.query(`DELETE FROM whatsapp_signup_sessions WHERE phone LIKE '+96477%'`);
  await db.query(`DELETE FROM whatsapp_webhook_events WHERE event_id LIKE 'wamid.TESTRL%'`);
  await purgeTestUsers();
}

const relaxedLimits = () => ({
  ...structuredClone(ORIGINAL.limits),
  globalUnverifiedDay: 1_000_000,
  globalDay: 1_000_000,
  outboundDay: 1_000_000,
});

beforeAll(cleanup);
beforeEach(async () => {
  wa.mode = 'auto';
  // حدود العنوان والرقم بقيمها الحقيقية؛ العامّة واسعة إلا حيث يختبرها اختبارٌ بعينه
  // (القاعدة المشتركة تحمل جلسات سويتاتٍ أخرى).
  Object.assign(wa.limits, relaxedLimits());
  fixtureSent.length = 0;
  setFixtureSendFailure(null);
  resetCapWarningsForTests();
  await db.query(`UPDATE whatsapp_outbox SET status = 'skipped' WHERE status = 'queued'`);
});
afterEach(() => setFixtureSendFailure(null));

describe('القيم المعتمدة', () => {
  it('العنوان ٣٠/ساعة غير متحقَّق و٣٠٠/يوم؛ الرقم ٣ حيّة و٦/ساعة و١٥/يوم بتأخير ١–٢–٤ دقائق؛ العامّة ١٠٠٠ و٥٠٠٠ و٥٠٠', () => {
    expect(ORIGINAL.limits).toMatchObject({
      perIpUnverifiedHour: 30,
      perIpDay: 300,
      livePerPhone: 3,
      perPhoneHour: 6,
      perPhoneDay: 15,
      perPhoneDelaysSeconds: [0, 0, 0, 60, 120, 240],
      globalUnverifiedDay: 1000,
      globalDay: 5000,
      outboundDay: 500,
    });
  });

  it('مفتاح العنوان: IPv4 كاملاً، وIPv6 بشبكته ‎/56', () => {
    expect(signupIpKey('203.0.113.7')).not.toBe(signupIpKey('203.0.113.8'));
    expect(signupIpKey('2001:db8:abcd:1201::1')).toBe(signupIpKey('2001:db8:abcd:12ff:ffff::9'));
    expect(signupIpKey('2001:db8:abcd:1201::1')).not.toBe(signupIpKey('2001:db8:abcd:1301::1'));
  });
});

describe('[CRITICAL] العنوان المشترك (NAT المشغّل)', () => {
  it('1 · أربعون زبوناً خلف عنوانٍ واحد يتحقّقون جميعاً — المتحقَّق منها لا تستهلك الحصّة', async () => {
    const ip = freshIp();
    const sessions = [];
    for (let i = 0; i < 40; i++) {
      const s = await startOk(ip);
      await verify(s);
      sessions.push(s);
    }
    for (const s of sessions) expect((await status(s)).body.data.status).toBe('verified');
    // وبعدها ما زالت الحصّة كاملة: ٣٠ جلسة غير متحقَّق منها تُقبل.
    for (let i = 0; i < 30; i++) await startOk(ip);
    expectRetry(await startFrom(ip), 1, 3600);
    // ويُكمل بعضهم التسجيل فعلاً.
    for (const s of sessions.slice(0, 3)) expect((await complete(s)).status).toBe(201);
  }, 120_000);

  it('2 · الحادية والثلاثون غير المتحقَّق منها: ٤٢٩ بـRetry-After حتى خروج أقدمها من الساعة', async () => {
    const ip = freshIp();
    for (let i = 0; i < 30; i++) await startOk(ip);
    const res = await startFrom(ip);
    expect(res.body.error.code).toBe('WHATSAPP_VERIFY_RATE_LIMITED');
    expectRetry(res, 3500, 3600);
    // أقدمها يخرج من الساعة ← تُقبل واحدة.
    const ipHash = (await db.query(
      `SELECT ip_hash FROM whatsapp_signup_sessions WHERE phone LIKE '+96477%' ORDER BY created_at DESC LIMIT 1`,
    )).rows[0].ip_hash;
    await db.query(
      `UPDATE whatsapp_signup_sessions SET created_at = now() - interval '61 minutes'
        WHERE id = (SELECT id FROM whatsapp_signup_sessions WHERE ip_hash = $1 ORDER BY created_at ASC LIMIT 1)`,
      [ipHash],
    );
    await startOk(ip);
  }, 60_000);

  it('3 · IPv6: عناوين ‎/64 مختلفة داخل ‎/56 واحدة حصّةٌ واحدة', async () => {
    for (let i = 0; i < 30; i++) await startOk(`2001:db8:5600:12${i.toString(16).padStart(2, '0')}::${i + 1}`);
    expectRetry(await startFrom('2001:db8:5600:12ff:abcd::77'), 1, 3600);
  }, 60_000);

  it('4 · IPv6: شبكة ‎/56 أخرى حصّةٌ مستقلة', async () => {
    for (let i = 0; i < 30; i++) await startOk(`2001:db8:5700:3400::${i + 1}`);
    expect((await startFrom('2001:db8:5700:3400::99')).status).toBe(429);
    await startOk('2001:db8:5700:3500::1');
  }, 60_000);

  it('5 · خمسون بدايةً متزامنة من عنوانٍ واحد لأرقامٍ مختلفة: ثلاثون بالضبط', async () => {
    const ip = freshIp();
    const results = await Promise.all(Array.from({ length: 50 }, () => startFrom(ip).then((r) => r.status)));
    expect(results.filter((s) => s === 201)).toHaveLength(30);
    expect(results.filter((s) => s === 429)).toHaveLength(20);
  }, 60_000);

  it('اليوم: ٣٠٠ بداية لكل عنوان — المتحقَّق منها تُحتسب هنا (سقف الفيضان)', async () => {
    wa.limits.perIpDay = 2;
    const ip = freshIp();
    await verify(await startOk(ip));
    await verify(await startOk(ip));
    const res = await startFrom(ip);
    expectRetry(res, 86_000, 86_400);
  });
});

describe('[CRITICAL] الرقم — تبديل العناوين لا يفتحه', () => {
  it('6 · عشرة عناوين على رقمٍ واحد: ٣ حيّة، ثم ٦ في الساعة أياً كان العنوان', async () => {
    const local = freshLocal();
    const phone = toE164(local);
    const outcomes: number[] = [];
    for (let i = 0; i < 10; i++) outcomes.push((await startFrom(freshIp(), local)).status);
    expect(outcomes.filter((s) => s === 201)).toHaveLength(3);
    // تنتهي الحيّة؛ البقية من عناوين جديدة — التأخير ثم سقف الساعة.
    let accepted = 3;
    for (let i = 0; i < 10; i++) {
      await expireLive(phone);
      await db.query(`UPDATE whatsapp_signup_sessions SET created_at = created_at - interval '5 minutes' WHERE phone = $1`, [phone]);
      if ((await startFrom(freshIp(), local)).status === 201) accepted++;
    }
    expect(accepted).toBe(6);
    const { rows: [{ n }] } = await db.query(`SELECT COUNT(*)::int AS n FROM whatsapp_signup_sessions WHERE phone = $1`, [phone]);
    expect(n).toBe(6);
  });

  it('السقف اليومي للرقم (١٥) من عناوين كثيرة', async () => {
    const local = freshLocal();
    const phone = toE164(local);
    for (let i = 0; i < 15; i++) {
      await db.query(
        `INSERT INTO whatsapp_signup_sessions (phone, code_hash, secret_hash, locale, provider, expires_at, created_at)
         VALUES ($1, sha256(random()::text::bytea), sha256(random()::text::bytea), 'ar', 'fixture', now() - interval '1 hour', now() - interval '2 hours')`,
        [phone],
      );
    }
    const res = await startFrom(freshIp(), local);
    expect(res.body.error.code).toBe('WHATSAPP_VERIFY_RATE_LIMITED');
    expectRetry(res, 79_000, 79_300);
  });
});

describe('[CRITICAL] التأخير المتصاعد وRetry-After', () => {
  it('9/10 · الأولى إلى الثالثة فوراً؛ الرابعة بعد دقيقة، الخامسة دقيقتين، السادسة أربعاً؛ السابعة سقف الساعة', async () => {
    const local = freshLocal();
    const phone = toE164(local);
    // يُرجع الزمن لكل جلسات الرقم معاً (كأن الثواني مرّت) — الترتيب بينها باقٍ.
    const age = (seconds: number) =>
      db.query(
        `UPDATE whatsapp_signup_sessions SET created_at = created_at - make_interval(secs => $2) WHERE phone = $1`,
        [phone, seconds],
      );
    for (let i = 0; i < 3; i++) await startOk(freshIp(), local);
    await expireLive(phone);
    for (const [delay, attempt] of [[60, 4], [120, 5], [240, 6]] as const) {
      const early = await startFrom(freshIp(), local);
      expect(early.body.error.code, `attempt ${attempt}`).toBe('WHATSAPP_VERIFY_RATE_LIMITED');
      expectRetry(early, delay - 2, delay);
      await age(delay - 10); // ما زال مبكراً: الباقي ≈ ١٠ ث
      expectRetry(await startFrom(freshIp(), local), 9, 11);
      await age(11);
      await startOk(freshIp(), local);
      await expireLive(phone);
    }
    // السادسة قُبلت: السابعة سقف الساعة (٦) — حتى تخرج الأولى من الساعة.
    const capped = await startFrom(freshIp(), local);
    const wait = expectRetry(capped, 1, 3600);
    const { rows: [{ oldest }] } = await db.query(
      `SELECT EXTRACT(EPOCH FROM (MIN(created_at) + interval '1 hour' - now()))::float8 AS oldest
         FROM whatsapp_signup_sessions WHERE phone = $1 AND created_at > now() - interval '1 hour'`,
      [phone],
    );
    expect(Math.abs(wait - oldest)).toBeLessThanOrEqual(2);
  });

  it('الحيّة الثلاث: Retry-After حتى تنتهي أقربها', async () => {
    const local = freshLocal();
    for (let i = 0; i < 3; i++) await startOk(freshIp(), local);
    expectRetry(await startFrom(freshIp(), local), wa.sessionTtlSeconds - 5, wa.sessionTtlSeconds);
  });
});

describe('[CRITICAL] الحدود العامّة — رجوعٌ آمن', () => {
  async function globalCounts() {
    const { rows: [row] } = await db.query<{ unverified: number; total: number }>(
      `SELECT COUNT(*) FILTER (WHERE verified_at IS NULL)::int AS unverified, COUNT(*)::int AS total
         FROM whatsapp_signup_sessions WHERE created_at > now() - interval '1 day'`,
    );
    return row!;
  }

  it('7 · غير المتحقَّق منها بلغت السقف: BUSY؛ المتحقَّق منها تكمل، والويبهوك يتحقّق، والطلب الإداري ٢٠٢', async () => {
    const verified = await startOk(freshIp());
    await verify(verified);
    const pending = await startOk(freshIp());
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      wa.limits.globalUnverifiedDay = (await globalCounts()).unverified;
      const busy = await startFrom(freshIp());
      expect(busy.body.error.code).toBe('WHATSAPP_VERIFY_BUSY');
      expectRetry(busy, 1, 86_400);
      expect(warn.mock.calls.flat().join(' ')).toContain('global unverified daily cap reached');
    } finally {
      warn.mockRestore();
    }
    expect((await complete(verified)).status).toBe(201);
    await verify(pending);
    expect((await complete(pending)).status).toBe(201);
    const manual = await api
      .post('/api/auth/register')
      .set(asClient(freshIp()))
      .send({ username: 'طالب', phone: freshLocal(), password: 'manual-pass-1', gender: 'male' });
    expect(manual.status).toBe(202);
  });

  it('7 · كل البدايات بلغت السقف اليومي: BUSY', async () => {
    wa.limits.globalDay = (await globalCounts()).total;
    const res = await startFrom(freshIp());
    expect(res.body.error.code).toBe('WHATSAPP_VERIFY_BUSY');
    expectRetry(res, 1, 86_400);
  });

  it('تحذيرٌ في السجلّ عند ٥٠٪ و٨٠٪ — مرّةً لكل مستوى، بلا رقمٍ ولا عنوان', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { unverified } = await globalCounts();
      wa.limits.globalUnverifiedDay = Math.ceil((unverified + 1) / 0.5); // البداية التالية = ٥٠٪
      const s1 = await startOk(freshIp());
      wa.limits.globalUnverifiedDay = Math.ceil((unverified + 2) / 0.8); // التالية = ٨٠٪
      await startOk(freshIp());
      await startOk(freshIp()); // ٨٠٪ مرّةً واحدة
      const lines = warn.mock.calls.flat().map(String).filter((l) => l.includes('global-unverified-starts'));
      expect(lines.filter((l) => l.includes('at 50%'))).toHaveLength(1);
      expect(lines.filter((l) => l.includes('at 80%'))).toHaveLength(1);
      expect(lines.join(' ')).not.toContain(s1.local.slice(3));
    } finally {
      warn.mockRestore();
    }
  });

  it('8 · سقف الرسائل الصادرة: طلب المشاركة لا يُرسل، والجلسة لا تتحقّق بلا دليل', async () => {
    const s = await startOk(freshIp());
    const userId = `IQ.RLCAP${Date.now()}`;
    expect((await postWebhook(usernameOnlyPayload(userId, `الرمز: ${s.code}`))).status).toBe(200);
    expect((await status(s)).body.data.status).toBe('awaiting_contact');
    const { rows: [{ n }] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM whatsapp_outbox WHERE status = 'sent' AND sent_at > now() - interval '1 day'`,
    );
    wa.limits.outboundDay = n;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await runWhatsAppOutboxOnce();
      expect(warn.mock.calls.flat().join(' ')).toContain('daily outbound message cap reached');
    } finally {
      warn.mockRestore();
    }
    expect(fixtureSent).toHaveLength(0);
    const { rows: [row] } = await db.query(`SELECT status, last_error_code FROM whatsapp_outbox WHERE session_id = $1`, [s.sessionId]);
    expect(row).toEqual({ status: 'skipped', last_error_code: 'daily_cap' });
    expect((await status(s)).body.data.status).toBe('awaiting_contact');

    // تحت السقف: الردّ يُرسل.
    wa.limits.outboundDay = n + 1;
    const s2 = await startOk(freshIp());
    await postWebhook(usernameOnlyPayload(`${userId}B`, `الرمز: ${s2.code}`));
    await runWhatsAppOutboxOnce();
    expect(fixtureSent).toHaveLength(1);
  });
});

describe('[SECURITY] العنوان لا يُزوَّر', () => {
  async function lastIpHash(sessionId: string): Promise<Buffer> {
    return (await db.query('SELECT ip_hash FROM whatsapp_signup_sessions WHERE id = $1', [sessionId])).rows[0].ip_hash;
  }

  it('11 · X-Forwarded-For وX-OG-Client-IP بلا توقيعٍ صحيح لا تغيّر المفتاح — والحدّ يقع على العنوان الحقيقي', async () => {
    const forged = [
      { 'X-Forwarded-For': '203.0.113.50' },
      { 'X-Forwarded-For': '203.0.113.51, 203.0.113.52' },
      { 'X-Real-IP': '203.0.113.53' },
      { 'X-OG-Client-IP': '203.0.113.54' },
      { 'X-OG-Client-IP': '203.0.113.55', 'X-OG-Client-Signature': `${Math.floor(Date.now() / 1000)}.${'0'.repeat(64)}` },
      // توقيعٌ صحيح لعنوانٍ آخر لا يصلح لهذا العنوان.
      { ...signClientIp(SECRET, '203.0.113.56'), 'X-OG-Client-IP': '203.0.113.57' },
      // توقيعٌ قديم (خارج الدقيقة).
      signClientIp(SECRET, '203.0.113.58', Math.floor(Date.now() / 1000) - 600),
    ];
    const hashes: Buffer[] = [];
    for (const headers of forged) {
      const res = await api.post('/api/auth/register/whatsapp/start').set(headers).send({ phone: freshLocal() });
      expect(res.status).toBe(201);
      hashes.push(await lastIpHash(res.body.data.sessionId));
    }
    for (const h of hashes) expect(h.equals(hashes[0]!)).toBe(true);
    const signed = await startOk('203.0.113.59');
    expect((await lastIpHash(signed.sessionId)).equals(hashes[0]!)).toBe(false);

    // الحدّ يقع على العنوان الحقيقي مهما تغيّرت الترويسات المزوَّرة.
    const { rows: [{ n }] } = await db.query(
      `SELECT COUNT(*)::int AS n FROM whatsapp_signup_sessions
        WHERE ip_hash = $1 AND verified_at IS NULL AND created_at > now() - interval '1 hour'`,
      [hashes[0]],
    );
    wa.limits.perIpUnverifiedHour = n;
    const blocked = await api
      .post('/api/auth/register/whatsapp/start')
      .set({ 'X-Forwarded-For': '192.0.2.200', 'X-OG-Client-IP': '192.0.2.201' })
      .send({ phone: freshLocal() });
    expect(blocked.status).toBe(429);
  });

  it('11 · خلف وسيطٍ واحد (`trust proxy` = 1): ما يكتبه العميل في X-Forwarded-For يُتجاهل — المعتمد ما أضافه الوسيط', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(resolveClientIp(SECRET));
    app.get('/ip', (req, res) => res.json({ ip: clientIp(req) }));
    const res = await request(app).get('/ip').set('X-Forwarded-For', '6.6.6.6, 203.0.113.9');
    expect(res.body.ip).toBe('203.0.113.9');
  });
});

describe('12 · registration-options خارج حدّ الدخول', () => {
  it('مئة فتحٍ لشاشة التسجيل من عنوانٍ واحد لا تستهلك حدّ الدخول (٦٠/١٥ دقيقة)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 100; i++) {
      expect((await api.get('/api/auth/registration-options').set(asClient(ip))).status).toBe(200);
    }
    const login = await api.post('/api/auth/login').set(asClient(ip)).send({ phone: freshLocal(), password: 'wrong-pass-123' });
    expect(login.status).not.toBe(429);
    // وحدّ الدخول نفسه باقٍ: ٦٠ طلب مصادقة ثم ٤٢٩.
    let last = 0;
    for (let i = 0; i < 61; i++) {
      last = (await api.post('/api/auth/login').set(asClient(ip)).send({ phone: freshLocal(), password: 'wrong-pass-123' })).status;
    }
    expect(last).toBe(429);
  }, 60_000);

  it('والتسجيل عبر واتساب لا يستهلكه أيضاً — دلوه مستقلّ (١٢٠/١٥ دقيقة)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 61; i++) await startFrom(ip); // يتجاوز ٦٠ دون ٤٢٩ من دلو الدخول
    const login = await api.post('/api/auth/login').set(asClient(ip)).send({ phone: freshLocal(), password: 'wrong-pass-123' });
    expect(login.status).not.toBe(429);
    expect(config.rateLimit.whatsappSignupMax).toBe(120);
  }, 60_000);
});

describe('[CRITICAL] الطريقان', () => {
  let adminToken = '';
  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  it('13 · بلا واتساب: الطلب الإداري يكتمل بلا أي خطوة واتساب، ويبقى معلَّقاً حتى الموافقة', async () => {
    const local = freshLocal();
    const res = await api
      .post('/api/auth/register')
      .set(asClient(freshIp()))
      .send({ username: 'بلا واتساب', phone: local, password: 'manual-pass-1', gender: 'female' });
    expect(res.status).toBe(202);
    const requestId = res.body.data.request.id as string;
    expect((await db.query('SELECT status FROM account_requests WHERE id = $1', [requestId])).rows[0].status).toBe('pending');
    expect((await db.query('SELECT phone_verified_at FROM users WHERE phone = $1', [toE164(local)])).rows[0].phone_verified_at).toBeNull();
    expect((await db.query('SELECT 1 FROM whatsapp_signup_sessions WHERE phone = $1', [toE164(local)])).rowCount).toBe(0);
    expect((await api.post('/api/auth/login').send({ phone: local, password: 'manual-pass-1' })).status).not.toBe(200);
    await api
      .post(`/api/admin/account-requests/${requestId}/approve`)
      .set({ Authorization: `Bearer ${adminToken}` })
      .send({})
      .expect(200);
    await api.post('/api/auth/login').send({ phone: local, password: 'manual-pass-1' }).expect(200);
  });

  it('14 · مع واتساب: البداية ← الرسالة ← البيانات ← حسابٌ مفعَّل بلا مسؤول', async () => {
    const s = await startOk(freshIp());
    await verify(s);
    const done = await complete(s);
    expect(done.status).toBe(201);
    expect(done.body.data.token).toEqual(expect.any(String));
    await api.post('/api/auth/login').send({ phone: s.local, password: 'whatsapp-pass-1' }).expect(200);
  });

  it('15 · off: لا خيار واتساب، ونقاطه ٤٠٤، والتسجيل الإداري ٢٠٢ كما كان', async () => {
    wa.mode = 'off';
    expect((await api.get('/api/auth/registration-options')).body.data).toEqual({ whatsapp: { enabled: false } });
    expect((await startFrom(freshIp())).status).toBe(404);
    const res = await api
      .post('/api/auth/register')
      .set(asClient(freshIp()))
      .send({ username: 'عادي', phone: freshLocal(), password: 'manual-pass-1', gender: 'male' });
    expect(res.status).toBe(202);
    expect(res.body.data.request.status).toBe('pending');
  });
});
