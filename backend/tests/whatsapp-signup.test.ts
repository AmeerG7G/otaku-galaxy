import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config/index.js';
import { db } from '../src/database/pool.js';
import { purgeExpiredWhatsAppData, runWhatsAppOutboxOnce } from '../src/jobs/whatsappOutboxJob.js';
import { signMetaPayload } from '../src/services/whatsapp/metaWebhook.js';
import { fixtureSent, setFixtureSendFailure, WhatsAppSendError } from '../src/services/whatsapp/provider.js';
import { whatsappSignupService } from '../src/services/whatsappSignupService.js';
import { AppError } from '../src/utils/errors.js';
import { api, createAdminUser, purgeTestUsers, registerAndLogin } from './helpers.js';

/**
 * التحقق التلقائي عبر واتساب — الدورة الكاملة عبر HTTP بمزوّد `fixture`
 * (توقيع Meta وحمولتها نفسهما؛ لا شبكة ولا رقم حقيقي).
 *
 * ═══ ما يُثبته ═══
 * - `off` (الافتراض): المسار الجديد مغلق، والويبهوك يُهمَل، والتسجيل الإداري كما هو.
 * - النجاح بالمرسِل وبمشاركة الرقم؛ المرسِل الخاطئ؛ المهلة والتأخّر؛ التوقيع؛
 *   التكرار والإعادة؛ كلمة المرور قبل التحقق؛ السرّ الخاطئ؛ الرقم المأخوذ؛
 *   طغيان صاحب الرقم على صفٍّ معلَّق لغيره؛ الحدود؛ تعطّل المزوّد؛ `auto → off`.
 * - التزامن: ويبهوكان لجلسة، إكمالان، بدايات متزامنة، إكمالٌ يسابق تسجيلاً.
 * - لا رقم كامل ولا رمز ولا سرّ في السجلّ.
 */

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends object ? Mutable<T[K]> : T[K] };
const wa = config.whatsapp as Mutable<typeof config.whatsapp>;
const ORIGINAL = { mode: wa.mode, limits: { ...wa.limits }, confirmation: wa.confirmationMessage };

const freshLocal = () => `077${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
const toE164 = (local: string) => `+964${local.slice(1)}`;
const digits = (local: string) => `964${local.slice(1)}`;
let seq = 0;
const wamid = () => `wamid.TEST${Date.now()}${++seq}`;
const nowTs = (offsetSeconds = 0) => Math.floor(Date.now() / 1000) + offsetSeconds;

function textPayload(m: { from?: string; userId?: string; text: string; ts?: number; id?: string }) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-TEST',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '9647500000000', phone_number_id: 'PNID-TEST' },
          contacts: [{ profile: { name: 'زبون' }, ...(m.from ? { wa_id: m.from } : {}), ...(m.userId ? { user_id: m.userId } : {}) }],
          messages: [{
            ...(m.from ? { from: m.from } : {}),
            ...(m.userId ? { from_user_id: m.userId } : {}),
            id: m.id ?? wamid(),
            timestamp: String(m.ts ?? nowTs()),
            type: 'text',
            text: { body: m.text },
          }],
        },
      }],
    }],
  };
}

function contactPayload(m: { userId: string; waId: string; origin?: string; from?: string; ts?: number; id?: string }) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA-TEST',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: 'PNID-TEST' },
          contacts: [{ profile: { name: 'زبون' }, user_id: m.userId }],
          messages: [{
            ...(m.from ? { from: m.from } : {}),
            from_user_id: m.userId,
            id: m.id ?? wamid(),
            timestamp: String(m.ts ?? nowTs()),
            type: 'contacts',
            contacts: [{
              ...(m.origin === undefined ? {} : { origin: m.origin }),
              name: { formatted_name: 'زبون' },
              phones: [{ phone: '+964 770 000 0000', wa_id: m.waId, type: 'MOBILE' }],
            }],
          }],
        },
      }],
    }],
  };
}

function postWebhook(payload: unknown, signature?: string | null) {
  const raw = JSON.stringify(payload);
  const req = api.post('/api/webhooks/whatsapp').set('Content-Type', 'application/json');
  if (signature !== null) req.set('X-Hub-Signature-256', signature ?? signMetaPayload(raw, wa.appSecret));
  return req.send(raw);
}

async function start(local = freshLocal()) {
  const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: local }).expect(201);
  return { local, phone: toE164(local), ...(res.body.data as { sessionId: string; secret: string; code: string; waLink: string; expiresAt: string; businessNumber: string }) };
}

const status = (s: { sessionId: string; secret: string }) =>
  api.post('/api/auth/register/whatsapp/status').send({ sessionId: s.sessionId, secret: s.secret });

const complete = (s: { sessionId: string; secret: string }, password = 'whatsapp-pass-1', extra: Record<string, unknown> = {}) =>
  api.post('/api/auth/register/whatsapp/complete').send({ sessionId: s.sessionId, secret: s.secret, username: 'زبون واتساب', gender: 'female', password, ...extra });

async function verifyBySender(s: { local: string; code: string }) {
  const res = await postWebhook(textPayload({ from: digits(s.local), userId: 'IQ.BSUID1', text: `أؤكد أنني أنشئ حسابي. الرمز: ${s.code}` }));
  expect(res.status).toBe(200);
}

const sessionRow = async (id: string) =>
  (await db.query('SELECT * FROM whatsapp_signup_sessions WHERE id = $1', [id])).rows[0];

async function cleanup() {
  await db.query(`DELETE FROM whatsapp_signup_sessions WHERE phone LIKE '+96477%'`);
  await db.query(`DELETE FROM whatsapp_webhook_events WHERE event_id LIKE 'wamid.TEST%'`);
  await purgeTestUsers();
}

beforeAll(async () => {
  await cleanup();
  wa.limits.perIpUnverifiedHour = 100_000;
  wa.limits.perIpDay = 100_000;
  wa.limits.globalUnverifiedDay = 100_000;
  wa.limits.globalDay = 100_000;
  wa.limits.outboundDay = 100_000;
});
afterAll(async () => {
  wa.mode = ORIGINAL.mode;
  Object.assign(wa.limits, ORIGINAL.limits);
  wa.confirmationMessage = ORIGINAL.confirmation;
  await cleanup();
});
beforeEach(async () => {
  // ردودٌ منتظرة من اختبارٍ سابق لا تُحتسب في اختبارٍ يعدّ ما أُرسل.
  await db.query(`UPDATE whatsapp_outbox SET status = 'skipped' WHERE status = 'queued'`);
  wa.mode = 'auto';
  fixtureSent.length = 0;
  setFixtureSendFailure(null);
});
afterEach(() => setFixtureSendFailure(null));

describe('[CRITICAL] الوضع off — المسار القائم كما هو', () => {
  it('الافتراض off: لا خيار واتساب، النقاط ٤٠٤، والتسجيل الإداري ٢٠٢', async () => {
    expect(ORIGINAL.mode).toBe('off');
    wa.mode = 'off';
    const options = await api.get('/api/auth/registration-options').expect(200);
    expect(options.body.data).toEqual({ whatsapp: { enabled: false } });
    for (const path of ['start', 'status', 'complete']) {
      const res = await api.post(`/api/auth/register/whatsapp/${path}`).send({});
      expect(res.status, path).toBe(404);
      expect(res.body.error.code, path).toBe('REGISTRATION_METHOD_UNAVAILABLE');
    }
    await api.post('/api/auth/register').send({ username: 'طالب', phone: freshLocal(), password: 'secret-pass', gender: 'male' }).expect(202);
  });

  it('الويبهوك في off: ٢٠٠ ولا يُخزَّن حدث ولا تتغيّر جلسة', async () => {
    wa.mode = 'auto';
    const s = await start();
    wa.mode = 'off';
    const id = wamid();
    const res = await postWebhook(textPayload({ id, from: digits(s.local), text: s.code }));
    expect(res.status).toBe(200);
    expect((await db.query('SELECT 1 FROM whatsapp_webhook_events WHERE event_id = $1', [id])).rowCount).toBe(0);
    expect((await sessionRow(s.sessionId)).status).toBe('pending');
  });

  it('[CRITICAL] auto ← off أثناء الطريق: الجلسة المتحقَّقة لا تكتمل، والحساب المكتمل سابقاً يدخل', async () => {
    const done = await start();
    await verifyBySender(done);
    await complete(done).expect(201);
    const s = await start();
    await verifyBySender(s);
    wa.mode = 'off';
    expect((await complete(s)).status).toBe(404);
    expect((await status(s)).status).toBe(404);
    await api.post('/api/auth/login').send({ phone: done.local, password: 'whatsapp-pass-1' }).expect(200);
  });
});

describe('البداية والخيارات', () => {
  it('الخيارات في auto: الرقم العام والمهلة فقط', async () => {
    const res = await api.get('/api/auth/registration-options').expect(200);
    expect(res.body.data).toEqual({
      whatsapp: { enabled: true, businessNumber: wa.businessNumber, ttlSeconds: wa.sessionTtlSeconds },
    });
  });

  it('start: رمز وسرّ ورابط wa.me؛ القاعدة لا تحمل الرمز ولا السرّ صريحين', async () => {
    const s = await start();
    expect(s.code).toMatch(/^OG-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(s.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(s.waLink.startsWith(`https://wa.me/${wa.businessNumber.slice(1)}?text=`)).toBe(true);
    expect(decodeURIComponent(s.waLink.split('text=')[1]!)).toContain(s.code);
    const row = await sessionRow(s.sessionId);
    expect(row.status).toBe('pending');
    expect(row.phone).toBe(s.phone);
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(s.secret);
    expect(dump).not.toContain(s.code.replace(/-/g, '').slice(2));
    // لا حساب ولا طلب يُنشأ عند البداية.
    expect((await db.query('SELECT 1 FROM users WHERE phone = $1', [s.phone])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM account_requests WHERE submitted_phone = $1', [s.phone])).rowCount).toBe(0);
  });

  it('[SECURITY] الرقم المفعَّل يأخذ ردّ البداية نفسه (لا كشف وجود حساب)', async () => {
    const existing = await registerAndLogin();
    const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: existing.phone }).expect(201);
    expect(Object.keys(res.body.data).sort()).toEqual(['businessNumber', 'code', 'expiresAt', 'secret', 'sessionId', 'waLink']);
  });

  it('رقمٌ غير عراقي يُرفض بالتحقق', async () => {
    const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: '+447700900123' });
    expect(res.status).toBe(400);
  });
});

describe('[CRITICAL] التحقق والإكمال', () => {
  it('النجاح بالمرسِل: حسابٌ مفعَّل، طلبٌ مقبول عبر واتساب، دخولٌ بكلمة المرور', async () => {
    const adminToken = await createAdminUser();
    const s = await start();
    expect((await status(s)).body.data.status).toBe('pending');
    await verifyBySender(s);
    const st = (await status(s).expect(200)).body.data;
    expect(st.status).toBe('verified');
    expect(st.completeBy).toBeTruthy();

    const res = await complete(s).expect(201);
    expect(Object.keys(res.body.data).sort()).toEqual(['token', 'user']);
    expect(res.body.data.user.phone).toBe(s.phone);
    expect(JSON.stringify(res.body)).not.toContain('whatsapp-pass-1');

    const me = await api.get('/api/auth/me').set('Authorization', `Bearer ${res.body.data.token}`).expect(200);
    expect(me.body.data.user.gender).toBe('female');
    await api.post('/api/auth/login').send({ phone: s.local, password: 'whatsapp-pass-1' }).expect(200);

    const row = await sessionRow(s.sessionId);
    expect(row.status).toBe('completed');
    expect(row.verified_via).toBe('sender');
    const { rows: [request] } = await db.query('SELECT * FROM account_requests WHERE id = $1', [row.account_request_id]);
    expect(request.status).toBe('approved');
    expect(request.resolved_by).toBeNull();

    const list = await api
      .get('/api/admin/account-requests')
      .query({ search: s.local, status: 'approved' })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const item = (list.body.data.items as { id: string; resolvedVia: string }[]).find((i) => i.id === request.id);
    expect(item?.resolvedVia).toBe('whatsapp');

    // تأكيد «أُنشئ حسابٌ بهذا الرقم» يُرسل مرّةً واحدة.
    await runWhatsAppOutboxOnce();
    expect(fixtureSent.filter((m) => m.kind === 'confirmation')).toHaveLength(1);
    expect(fixtureSent[0]!.recipient).toEqual({ bsuid: 'IQ.BSUID1' });
  });

  it('الرمز داخل نصٍّ كردي، بأحرف صغيرة وفراغات، يُطابَق', async () => {
    const s = await start();
    const loose = s.code.toLowerCase().replace(/-/g, ' ');
    await postWebhook(textPayload({ from: digits(s.local), text: `کۆد: ${loose} سوپاس` })).expect(200);
    expect((await status(s)).body.data.status).toBe('verified');
  });

  it('[SECURITY] كلمة المرور قبل التحقق: ٤٠٩ ولا صفّ حساب', async () => {
    const s = await start();
    const res = await complete(s);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_NOT_VERIFIED');
    expect((await db.query('SELECT 1 FROM users WHERE phone = $1', [s.phone])).rowCount).toBe(0);
  });

  it('[SECURITY] السرّ الخاطئ ٤٠٤ كالمعرّف المجهول؛ السادسة تُميت الجلسة', async () => {
    const s = await start();
    await verifyBySender(s);
    const wrong = { sessionId: s.sessionId, secret: 'A'.repeat(43) };
    const unknown = { sessionId: '00000000-0000-4000-8000-000000000000', secret: s.secret };
    const a = await complete(wrong);
    const b = await complete(unknown);
    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body.error.code).toBe(b.body.error.code);
    expect((await status(wrong)).status).toBe(404);
    for (let i = 0; i < 4; i++) await complete(wrong).expect(404);
    expect((await complete(s)).status).toBe(429);
    expect((await sessionRow(s.sessionId)).dead_reason).toBe('attempts');
  });

  it('الإكمال بعد مهلته: ٤١٠', async () => {
    const s = await start();
    await verifyBySender(s);
    await db.query(`UPDATE whatsapp_signup_sessions SET verified_at = now() - interval '16 minutes' WHERE id = $1`, [s.sessionId]);
    const res = await complete(s);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('SESSION_EXPIRED');
  });

  it('إكمالٌ ثانٍ بالجلسة نفسها: ٤٠٩ SESSION_COMPLETED', async () => {
    const s = await start();
    await verifyBySender(s);
    await complete(s).expect(201);
    const again = await complete(s);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SESSION_COMPLETED');
  });
});

describe('[CRITICAL] المرسِل والمهلة والتوقيع', () => {
  it('مرسِلٌ آخر: محاولةٌ خاطئة؛ الثالثة تُميت الجلسة', async () => {
    const s = await start();
    const other = digits(freshLocal());
    await postWebhook(textPayload({ from: other, text: s.code })).expect(200);
    const st = (await status(s)).body.data;
    expect(st.status).toBe('pending');
    expect(st.lastAttemptMismatched).toBe(true);
    await postWebhook(textPayload({ from: '447700900123', text: s.code })).expect(200); // غير عراقي
    await postWebhook(textPayload({ from: other, text: s.code })).expect(200);
    expect((await status(s)).body.data.status).toBe('mismatch');
    // ولا يُنقذها المرسِل الصحيح بعد موتها.
    await verifyBySender(s);
    expect((await status(s)).body.data.status).toBe('mismatch');
    expect((await complete(s)).body.error.code).toBe('SESSION_DEAD');
  });

  it('رسالةٌ أُرسلت بعد انتهاء المهلة تُرفض', async () => {
    const s = await start();
    await db.query(`UPDATE whatsapp_signup_sessions SET expires_at = now() - interval '2 minutes' WHERE id = $1`, [s.sessionId]);
    await postWebhook(textPayload({ from: digits(s.local), text: s.code })).expect(200);
    expect((await status(s)).body.data.status).toBe('expired');
  });

  it('ويبهوكٌ متأخّر لرسالةٍ أُرسلت في المهلة يُقبل؛ بعد المهلة الإضافية يُهمَل', async () => {
    const s = await start();
    await db.query(
      `UPDATE whatsapp_signup_sessions SET created_at = now() - interval '7 minutes', expires_at = now() - interval '2 minutes' WHERE id = $1`,
      [s.sessionId],
    );
    await postWebhook(textPayload({ from: digits(s.local), text: s.code, ts: nowTs(-180) })).expect(200);
    expect((await sessionRow(s.sessionId)).status).toBe('verified');

    const late = await start();
    await db.query(
      `UPDATE whatsapp_signup_sessions SET created_at = now() - interval '16 minutes', expires_at = now() - interval '11 minutes' WHERE id = $1`,
      [late.sessionId],
    );
    const id = wamid();
    await postWebhook(textPayload({ id, from: digits(late.local), text: late.code, ts: nowTs(-700) })).expect(200);
    expect((await sessionRow(late.sessionId)).status).toBe('pending');
    expect((await db.query('SELECT outcome FROM whatsapp_webhook_events WHERE event_id = $1', [id])).rows[0].outcome).toBe('late');
  });

  it('[SECURITY] توقيعٌ خاطئ أو مفقود أو جسمٌ معدَّل: ٤٠١ ولا أثر', async () => {
    const s = await start();
    const payload = textPayload({ from: digits(s.local), text: s.code });
    expect((await postWebhook(payload, null)).status).toBe(401);
    expect((await postWebhook(payload, 'sha256=' + '0'.repeat(64))).status).toBe(401);
    expect((await postWebhook(payload, signMetaPayload(JSON.stringify(payload), 'another-secret'))).status).toBe(401);
    const tampered = await api
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signMetaPayload(JSON.stringify(payload), wa.appSecret))
      .send(JSON.stringify(payload).replace(s.code, s.code.slice(0, -1) + 'X'));
    expect(tampered.status).toBe(401);
    expect((await sessionRow(s.sessionId)).status).toBe('pending');
  });

  it('جسمٌ أكبر من ٢٥٦ ك.ب: ٤١٣', async () => {
    const res = await api
      .post('/api/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=' + '0'.repeat(64))
      .send(JSON.stringify({ pad: 'x'.repeat(300 * 1024) }));
    expect(res.status).toBe(413);
  });

  it('مصافحة الاشتراك: بلا رمز تحقّقٍ مضبوط ← ٤٠٣؛ برمزٍ صحيح ← التحدّي', async () => {
    const original = wa.verifyToken;
    try {
      wa.verifyToken = '';
      await api.get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': '', 'hub.challenge': '123' }).expect(403);
      wa.verifyToken = 'test-verify-token';
      await api.get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123' }).expect(403);
      const ok = await api.get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'test-verify-token', 'hub.challenge': '98765' }).expect(200);
      expect(ok.text).toBe('98765');
    } finally {
      wa.verifyToken = original;
    }
  });

  it('[CRITICAL] الحدث المكرَّر لا أثر له، والإعادة بعد الإكمال تُهمَل', async () => {
    const s = await start();
    const id = wamid();
    const wrong = textPayload({ id, from: digits(freshLocal()), text: s.code });
    await postWebhook(wrong).expect(200);
    await postWebhook(wrong).expect(200);
    expect((await sessionRow(s.sessionId)).mismatch_count).toBe(1);
    expect((await db.query('SELECT 1 FROM whatsapp_webhook_events WHERE event_id = $1', [id])).rowCount).toBe(1);

    const good = textPayload({ from: digits(s.local), text: s.code });
    await postWebhook(good).expect(200);
    await complete(s).expect(201);
    const replayId = wamid();
    await postWebhook(textPayload({ id: replayId, from: digits(s.local), text: s.code })).expect(200);
    expect((await db.query('SELECT outcome FROM whatsapp_webhook_events WHERE event_id = $1', [replayId])).rows[0].outcome).toBe('stale');
  });

  it('رسالةٌ بلا رمز أو برمزٍ مجهول تُسجَّل ولا تمسّ شيئاً', async () => {
    const a = wamid();
    const b = wamid();
    await postWebhook(textPayload({ id: a, from: digits(freshLocal()), text: 'مرحبا' })).expect(200);
    await postWebhook(textPayload({ id: b, from: digits(freshLocal()), text: 'OG-ZZZZZ-ZZZZZ' })).expect(200);
    const { rows } = await db.query('SELECT event_id, outcome FROM whatsapp_webhook_events WHERE event_id = ANY($1)', [[a, b]]);
    expect(Object.fromEntries(rows.map((r) => [r.event_id, r.outcome]))).toEqual({ [a]: 'no_code', [b]: 'unknown_code' });
  });
});

describe('[CRITICAL] اسم مستخدم بلا رقم — مشاركة الرقم', () => {
  async function awaitingSession(userId: string) {
    const s = await start();
    await postWebhook(textPayload({ userId, text: s.code })).expect(200);
    expect((await status(s)).body.data.status).toBe('awaiting_contact');
    return s;
  }

  it('الرقم غائب ← زرّ مشاركة يُرسل إلى BSUID؛ الردّ المطابق يتحقّق؛ الإكمال ينجح', async () => {
    const userId = `IQ.U${Date.now()}`;
    const s = await awaitingSession(userId);
    await runWhatsAppOutboxOnce();
    const sent = fixtureSent.filter((m) => m.kind === 'contact_request');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.recipient).toEqual({ bsuid: userId });
    // الرسالة الثانية لا تعيد إرسال الزرّ.
    await postWebhook(textPayload({ userId, text: s.code })).expect(200);
    await runWhatsAppOutboxOnce();
    expect(fixtureSent.filter((m) => m.kind === 'contact_request')).toHaveLength(1);

    await postWebhook(contactPayload({ userId, waId: digits(s.local), origin: 'contact_request' })).expect(200);
    expect((await status(s)).body.data.status).toBe('verified');
    expect((await sessionRow(s.sessionId)).verified_via).toBe('contact_request');
    await complete(s).expect(201);
  });

  it('[SECURITY] بطاقةٌ أُرسلت يدوياً (origin other أو غائب) لا تُحقِّق', async () => {
    const userId = `IQ.U${Date.now()}b`;
    const s = await awaitingSession(userId);
    await postWebhook(contactPayload({ userId, waId: digits(s.local), origin: 'other' })).expect(200);
    await postWebhook(contactPayload({ userId, waId: digits(s.local) })).expect(200);
    expect((await status(s)).body.data.status).toBe('awaiting_contact');
  });

  it('[SECURITY] رقمٌ مُشارَك مختلف = محاولة خاطئة؛ معرّفٌ آخر لا يصل الجلسة', async () => {
    const userId = `IQ.U${Date.now()}c`;
    const s = await awaitingSession(userId);
    await postWebhook(contactPayload({ userId, waId: digits(freshLocal()), origin: 'contact_request' })).expect(200);
    expect((await sessionRow(s.sessionId)).mismatch_count).toBe(1);
    await postWebhook(contactPayload({ userId: 'IQ.SOMEONE_ELSE', waId: digits(s.local), origin: 'contact_request' })).expect(200);
    expect((await status(s)).body.data.status).toBe('awaiting_contact');
    // رقم المرسِل حاضرٌ ومخالفٌ للمُشارَك ← محاولة خاطئة أيضاً.
    await postWebhook(contactPayload({ userId, waId: digits(s.local), from: digits(freshLocal()), origin: 'contact_request' })).expect(200);
    expect((await sessionRow(s.sessionId)).mismatch_count).toBe(2);
  });

  it('مهلة المشاركة انقضت: منتهية', async () => {
    const userId = `IQ.U${Date.now()}d`;
    const s = await awaitingSession(userId);
    await db.query(`UPDATE whatsapp_signup_sessions SET contact_deadline = now() - interval '3 minutes' WHERE id = $1`, [s.sessionId]);
    expect((await status(s)).body.data.status).toBe('expired');
    await postWebhook(contactPayload({ userId, waId: digits(s.local), origin: 'contact_request' })).expect(200);
    expect((await sessionRow(s.sessionId)).status).toBe('awaiting_contact');
  });

  it('طلب المشاركة لجلسةٍ تحقّقت قبل إرساله لا يُرسل', async () => {
    const userId = `IQ.U${Date.now()}e`;
    const s = await awaitingSession(userId);
    await postWebhook(contactPayload({ userId, waId: digits(s.local), origin: 'contact_request' })).expect(200);
    const counts = await runWhatsAppOutboxOnce();
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
    expect(fixtureSent.filter((m) => m.kind === 'contact_request')).toHaveLength(0);
  });
});

describe('[CRITICAL] الأرقام القائمة', () => {
  it('[SECURITY] صفٌّ معلَّق لغير صاحب الرقم: صاحبه يطغى بكلمته، والطلب نفسه يُقبل عبر واتساب', async () => {
    const local = freshLocal();
    const squat = await api.post('/api/auth/register').send({ username: 'منتحل', phone: local, password: 'attacker-pass', gender: 'male' }).expect(202);
    const requestId = squat.body.data.request.id as string;
    const s = await start(local);
    await verifyBySender(s);
    const res = await complete(s, 'owner-pass-123').expect(201);
    expect(res.body.data.user.username).toBe('زبون واتساب');
    await api.post('/api/auth/login').send({ phone: local, password: 'owner-pass-123' }).expect(200);
    expect((await api.post('/api/auth/login').send({ phone: local, password: 'attacker-pass' })).status).toBe(401);
    const { rows: [request] } = await db.query('SELECT status, user_id FROM account_requests WHERE id = $1', [requestId]);
    expect(request.status).toBe('approved');
    expect((await sessionRow(s.sessionId)).account_request_id).toBe(requestId);
    expect((await db.query(`SELECT 1 FROM account_requests WHERE submitted_phone = $1 AND kind = 'registration'`, [s.phone])).rowCount).toBe(1);
  });

  it('[SECURITY] رقمٌ مفعَّل: يُكشف «مأخوذ» بعد التحقق وحده، والإكمال لا يمسّ الحساب', async () => {
    const existing = await registerAndLogin();
    const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: existing.phone }).expect(201);
    const s = { ...res.body.data, local: `0${existing.phone.slice(4)}` };
    expect((await status(s)).body.data.status).toBe('pending');
    await verifyBySender(s);
    expect((await status(s)).body.data.status).toBe('phone_taken');
    const done = await complete(s, 'new-pass-999');
    expect(done.status).toBe(409);
    expect(done.body.error.code).toBe('PHONE_TAKEN');
    await api.post('/api/auth/login').send({ phone: existing.phone, password: existing.password }).expect(200);
    expect((await api.post('/api/auth/login').send({ phone: existing.phone, password: 'new-pass-999' })).status).toBe(401);
  });

  it('حذف الحساب يحذف جلسات واتساب للرقم', async () => {
    const s = await start();
    await verifyBySender(s);
    const { token } = (await complete(s).expect(201)).body.data;
    const other = await start(s.local).catch(() => null); // جلسةٌ ثانية للرقم نفسه (إن سمح الحدّ)
    await api.post('/api/auth/me/delete').set('Authorization', `Bearer ${token}`).send({ password: 'whatsapp-pass-1' }).expect(200);
    expect((await db.query('SELECT 1 FROM whatsapp_signup_sessions WHERE phone = $1', [s.phone])).rowCount).toBe(0);
    if (other) expect(await sessionRow(other.sessionId)).toBeUndefined();
  });
});

describe('الحدود والمزوّد والتنظيف', () => {
  it('ثلاث جلسات حيّة لكل رقم؛ الرابعة ٤٢٩', async () => {
    const local = freshLocal();
    for (let i = 0; i < 3; i++) await start(local);
    const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: local });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('WHATSAPP_VERIFY_RATE_LIMITED');
  });

  it('سقف العنوان وسقف اليوم العام (من القاعدة لا من الذاكرة)', async () => {
    wa.limits.perIpUnverifiedHour = 1;
    try {
      const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: freshLocal() });
      expect(res.status).toBe(429);
    } finally {
      wa.limits.perIpUnverifiedHour = 100_000;
    }
    wa.limits.globalDay = 1;
    try {
      const res = await api.post('/api/auth/register/whatsapp/start').send({ phone: freshLocal() });
      expect(res.status).toBe(429);
      expect(res.body.error.code).toBe('WHATSAPP_VERIFY_BUSY');
    } finally {
      wa.limits.globalDay = 100_000;
    }
  });

  it('تعطّل المزوّد: خطأٌ عابر يعيد المحاولة، والدائم يفشل؛ الرمز وحده في السجلّ', async () => {
    const s = await start();
    await verifyBySender(s);
    await complete(s).expect(201);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      setFixtureSendFailure(new WhatsAppSendError('http_503', true));
      await runWhatsAppOutboxOnce();
      let row = (await db.query(`SELECT * FROM whatsapp_outbox WHERE session_id = $1`, [s.sessionId])).rows[0];
      expect(row.status).toBe('queued');
      expect(row.attempts).toBe(1);
      expect(row.last_error_code).toBe('http_503');
      await db.query(`UPDATE whatsapp_outbox SET next_attempt_at = now() WHERE id = $1`, [row.id]);
      setFixtureSendFailure(new WhatsAppSendError('http_400', false));
      await runWhatsAppOutboxOnce();
      row = (await db.query(`SELECT * FROM whatsapp_outbox WHERE id = $1`, [row.id])).rows[0];
      expect(row.status).toBe('failed');
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain(s.local.slice(3));
      expect(logged).not.toContain('IQ.BSUID1');
    } finally {
      warn.mockRestore();
    }
  });

  it('الوضع off: الردود المنتظرة لا تُرسل', async () => {
    const s = await start();
    await verifyBySender(s);
    await complete(s).expect(201);
    wa.mode = 'off';
    const counts = await runWhatsAppOutboxOnce();
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
    expect(fixtureSent).toHaveLength(0);
  });

  it('التنظيف: جلسات ٣٠ يوماً (المكتملة ٩٠) وأحداث ١٤ يوماً', async () => {
    const old = await start();
    const recentDone = await start();
    await verifyBySender(recentDone);
    await complete(recentDone).expect(201);
    await db.query(`UPDATE whatsapp_signup_sessions SET created_at = now() - interval '31 days' WHERE id = ANY($1)`, [[old.sessionId, recentDone.sessionId]]);
    const eventId = wamid();
    await db.query(
      `INSERT INTO whatsapp_webhook_events (provider, event_id, event_type, received_at) VALUES ('fixture', $1, 'text', now() - interval '15 days')`,
      [eventId],
    );
    await purgeExpiredWhatsAppData();
    expect(await sessionRow(old.sessionId)).toBeUndefined();
    expect(await sessionRow(recentDone.sessionId)).toBeDefined();
    expect((await db.query('SELECT 1 FROM whatsapp_webhook_events WHERE event_id = $1', [eventId])).rowCount).toBe(0);
  });

  it('[SECURITY] السجلّ لا يحمل رقماً كاملاً ولا رمزاً ولا سرّاً ولا كلمة مرور', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    try {
      const s = await start();
      await postWebhook(textPayload({ from: digits(freshLocal()), text: s.code }));
      await verifyBySender(s);
      await complete(s, 'log-check-pass-1').expect(201);
      await runWhatsAppOutboxOnce();
      const logged = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
      for (const secret of [s.local.slice(1), s.code, s.code.slice(3, 8), s.secret, 'log-check-pass-1']) {
        expect(logged).not.toContain(secret);
      }
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});

describe('[CRITICAL] التزامن', () => {
  it('ويبهوكان مختلفان لجلسةٍ واحدة: انتقالٌ واحد', async () => {
    const s = await start();
    const outcomes = await Promise.all(
      [1, 2].map(() =>
        whatsappSignupService.handleInboundEvent('fixture', {
          kind: 'text', eventId: wamid(), senderPhone: digits(s.local), senderRef: 'IQ.C', text: s.code, sentAt: new Date(),
        }),
      ),
    );
    expect(outcomes.sort()).toEqual(['stale', 'verified']);
  });

  it('إكمالان متزامنان: حسابٌ واحد', async () => {
    const s = await start();
    await verifyBySender(s);
    const results = await Promise.all([complete(s, 'race-pass-1'), complete(s, 'race-pass-2')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await db.query('SELECT 1 FROM users WHERE phone = $1', [s.phone])).rowCount).toBe(1);
  });

  it('عشر بدايات متزامنة لرقمٍ واحد: ثلاثٌ فقط', async () => {
    const local = freshLocal();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => api.post('/api/auth/register/whatsapp/start').send({ phone: local })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
  });

  it('[SECURITY] إكمالٌ يسابق تسجيلاً عادياً للرقم نفسه: صاحب واتساب يفوز دائماً', async () => {
    for (let round = 0; round < 3; round++) {
      const s = await start();
      await verifyBySender(s);
      const [done, reg] = await Promise.all([
        complete(s, 'wa-owner-pass'),
        api.post('/api/auth/register').send({ username: 'سابق', phone: s.local, password: 'racer-pass-1', gender: 'male' }),
      ]);
      expect(done.status).toBe(201);
      expect([202, 409]).toContain(reg.status);
      if (done.status === 201) {
        await api.post('/api/auth/login').send({ phone: s.local, password: 'wa-owner-pass' }).expect(200);
        expect((await api.post('/api/auth/login').send({ phone: s.local, password: 'racer-pass-1' })).status).toBe(401);
        const { rows } = await db.query(
          `SELECT status FROM account_requests WHERE submitted_phone = $1 AND kind = 'registration'`,
          [s.phone],
        );
        expect(rows.map((r) => r.status)).toEqual(['approved']);
      }
    }
  });
});

describe('[CRITICAL] قرار المسؤول يسبق واتساب (Phase B)', () => {
  let adminToken = '';
  const admin = () => ({ Authorization: `Bearer ${adminToken}` });
  beforeAll(async () => {
    adminToken = await createAdminUser();
  });

  async function pendingRegistration(local = freshLocal()) {
    const res = await api.post('/api/auth/register').send({ username: 'طالب', phone: local, password: 'applicant-pass', gender: 'male' }).expect(202);
    return { local, requestId: res.body.data.request.id as string };
  }

  it('[SECURITY] رقمٌ آخر طلبه مرفوض: التحقق لا يفعّله — ٤٠٣ ACCOUNT_REQUEST_REJECTED، والسجلّ كما هو', async () => {
    const { local, requestId } = await pendingRegistration();
    await api.post(`/api/admin/account-requests/${requestId}/reject`).set(admin()).send({ note: 'مرفوض' }).expect(200);
    const s = await start(local);
    await verifyBySender(s);
    expect((await status(s)).body.data.status).toBe('dead');
    const done = await complete(s, 'owner-pass-123');
    expect(done.status).toBe(403);
    expect(done.body.error.code).toBe('ACCOUNT_REQUEST_REJECTED');
    expect(await sessionRow(s.sessionId)).toMatchObject({ status: 'dead', dead_reason: 'blocked', user_id: null });
    const { rows } = await db.query(`SELECT status, admin_note FROM account_requests WHERE submitted_phone = $1 AND kind = 'registration'`, [s.phone]);
    expect(rows).toEqual([{ status: 'rejected', admin_note: 'مرفوض' }]);
    const { rows: [user] } = await db.query('SELECT phone_verified_at FROM users WHERE phone = $1', [s.phone]);
    expect(user?.phone_verified_at ?? null).toBeNull();
    expect((await api.post('/api/auth/login').send({ phone: local, password: 'owner-pass-123' })).status).not.toBe(200);
  });

  it('[SECURITY] رقمٌ مرفوض لم يبقَ له صفّ حساب: لا يُنشأ حساب', async () => {
    const { local, requestId } = await pendingRegistration();
    await api.post(`/api/admin/account-requests/${requestId}/reject`).set(admin()).send({}).expect(200);
    await db.query('UPDATE account_requests SET user_id = NULL WHERE id = $1', [requestId]);
    await db.query('DELETE FROM users WHERE phone = $1', [toE164(local)]);
    const s = await start(local);
    await verifyBySender(s);
    expect((await complete(s)).status).toBe(403);
    expect((await db.query('SELECT 1 FROM users WHERE phone = $1', [s.phone])).rowCount).toBe(0);
  });

  it('[SECURITY] حسابٌ معلَّق موقوف: التحقق لا يفعّله — ٤٠٣ ACCOUNT_SUSPENDED', async () => {
    const { local } = await pendingRegistration();
    await db.query('UPDATE users SET is_active = FALSE WHERE phone = $1', [toE164(local)]);
    const s = await start(local);
    await verifyBySender(s);
    expect((await status(s)).body.data.status).toBe('dead');
    const done = await complete(s);
    expect(done.status).toBe(403);
    expect(done.body.error.code).toBe('ACCOUNT_SUSPENDED');
    const { rows: [user] } = await db.query('SELECT is_active, phone_verified_at FROM users WHERE phone = $1', [s.phone]);
    expect(user).toEqual({ is_active: false, phone_verified_at: null });
    expect((await sessionRow(s.sessionId)).dead_reason).toBe('blocked');
  });

  it('إعادة التقديم بالطريقة العادية بعد الرفض تفتح طلباً جديداً — واتساب يحسمه (قاعدة الدخول نفسها)', async () => {
    const { local, requestId } = await pendingRegistration();
    await api.post(`/api/admin/account-requests/${requestId}/reject`).set(admin()).send({}).expect(200);
    await api.post('/api/auth/register').send({ username: 'طالب', phone: local, password: 'applicant-pass-2', gender: 'male' }).expect(202);
    const s = await start(local);
    await verifyBySender(s);
    await complete(s).expect(201);
    const { rows } = await db.query(
      `SELECT status FROM account_requests WHERE submitted_phone = $1 AND kind = 'registration' ORDER BY created_at`,
      [s.phone],
    );
    expect(rows.map((r) => r.status)).toEqual(['rejected', 'approved']);
  });

  it('[CRITICAL] إكمالٌ يسابق رفض المسؤول: لا يجتمع «مرفوض» و«مفعَّل» أبداً', async () => {
    for (let round = 0; round < 5; round++) {
      const { local, requestId } = await pendingRegistration();
      const s = await start(local);
      await verifyBySender(s);
      const [done, rejected] = await Promise.all([
        complete(s, 'owner-pass-123').then((r) => r),
        api.post(`/api/admin/account-requests/${requestId}/reject`).set(admin()).send({}).then((r) => r),
      ]);
      const { rows: [user] } = await db.query('SELECT phone_verified_at FROM users WHERE phone = $1', [s.phone]);
      const { rows: [latest] } = await db.query(
        `SELECT status FROM account_requests WHERE submitted_phone = $1 AND kind = 'registration' ORDER BY created_at DESC LIMIT 1`,
        [s.phone],
      );
      if (done.status === 201) {
        expect(rejected.status).toBe(409);
        expect(latest.status).toBe('approved');
        expect(user.phone_verified_at).not.toBeNull();
      } else {
        expect(done.status).toBe(403);
        expect(rejected.status).toBe(200);
        expect(latest.status).toBe('rejected');
        expect(user.phone_verified_at).toBeNull();
      }
    }
  });
});

describe('[CRITICAL] الويبهوك: العطل العابر يُعاد (Phase B)', () => {
  it('عطل قاعدة بيانات في حدث: ٥٠٠ فتعيد Meta؛ الإعادة نفسها تتحقّق مرّة واحدة', async () => {
    const s = await start();
    const payload = textPayload({ from: digits(s.local), userId: 'IQ.BSUID1', text: `الرمز: ${s.code}` });
    const spy = vi
      .spyOn(whatsappSignupService, 'handleInboundEvent')
      .mockRejectedValueOnce(Object.assign(new Error('connection terminated'), { code: '57P01' }));
    try {
      expect((await postWebhook(payload)).status).toBe(500);
      expect((await status(s)).body.data.status).toBe('pending');
      expect((await postWebhook(payload)).status).toBe(200);
      expect((await status(s)).body.data.status).toBe('verified');
      expect((await postWebhook(payload)).status).toBe(200); // إعادةٌ ثالثة: مكرَّرة بلا أثر
    } finally {
      spy.mockRestore();
    }
    await complete(s).expect(201);
  });

  it('خطأٌ منطقي (AppError) لا تصلحه الإعادة: ٢٠٠', async () => {
    const s = await start();
    const spy = vi
      .spyOn(whatsappSignupService, 'handleInboundEvent')
      .mockRejectedValueOnce(new AppError(409, 'X', 'منطقي'));
    try {
      expect((await postWebhook(textPayload({ from: digits(s.local), userId: 'IQ.BSUID1', text: s.code }))).status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
});
