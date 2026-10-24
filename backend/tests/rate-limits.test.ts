import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * [CRITICAL] حدود المعدّل تُبنى على عنوان الزبون الفعلي — لا على عنوان خادم الموقع.
 *
 * ═══ العطل ═══ الموقع (`web-store/`) يستدعي الخادم من خادمه، فكان `req.ip`
 * لكل زبائنه عنواناً واحداً: الدلو العام (٣٠٠/١٥ دقيقة) يُغلق الموقع كله بعد
 * ٣٠٠ طلب، وحدّ الدخول يصير بالرقم وحده.
 *
 * ═══ العقد ═══
 *   عنوانٌ موقَّع بـ`BFF_SHARED_SECRET` حديثاً   ← هو مفتاح الحدود
 *   ترويسةٌ بلا توقيع/بتوقيعٍ خاطئ/قديم/بلا سرّ  ← `req.ip` كما كان (لا تزوير)
 *
 * الحدود معطّلة في بقية السويت؛ هذا الملف يطلبها صراحةً
 * (`RATE_LIMIT_ENFORCE_IN_TESTS`) قبل تحميل الإعدادات، بسقوفٍ صغيرة.
 */
const SECRET = vi.hoisted(() => {
  const secret = 'rate-limit-suite-bff-secret-0123456789abcdef';
  const saved = { ...process.env };
  Object.assign(process.env, {
    BFF_SHARED_SECRET: secret,
    RATE_LIMIT_ENFORCE_IN_TESTS: '1',
    RATE_LIMIT_GLOBAL_MAX: '40',
    RATE_LIMIT_LOGIN_MAX_PER_PHONE: '3',
  });
  (globalThis as { __rateLimitSavedEnv?: NodeJS.ProcessEnv }).__rateLimitSavedEnv = saved;
  return secret;
});

import { clientIp, resolveClientIp, signClientIp } from '../src/middleware/client-ip.js';
import { clientRateLimitKey } from '../src/middleware/error-handler.js';
import { api } from './helpers.js';

afterAll(() => {
  const saved = (globalThis as { __rateLimitSavedEnv?: NodeJS.ProcessEnv }).__rateLimitSavedEnv!;
  for (const name of [
    'BFF_SHARED_SECRET',
    'RATE_LIMIT_ENFORCE_IN_TESTS',
    'RATE_LIMIT_GLOBAL_MAX',
    'RATE_LIMIT_LOGIN_MAX_PER_PHONE',
  ]) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

const NOW = 1_800_000_000;

describe('[CRITICAL] resolveClientIp — يُقبل العنوان الموقَّع وحده', () => {
  function probe(secret: string | null = SECRET) {
    const app = express();
    app.use(resolveClientIp(secret, () => NOW));
    app.get('/ip', (req, res) => res.json({ ip: clientIp(req), key: clientRateLimitKey(req) }));
    return request(app);
  }

  const peer = async () => (await probe().get('/ip')).body.ip as string;

  it('بلا ترويسة ← req.ip كما كان', async () => {
    expect(await peer()).toMatch(/127\.0\.0\.1$/);
  });

  it('عنوانٌ موقَّع حديث ← هو عنوان الزبون', async () => {
    const res = await probe().get('/ip').set(signClientIp(SECRET, '203.0.113.7', NOW));
    expect(res.body.ip).toBe('203.0.113.7');
    // داخل النافذة من الجهتين.
    for (const at of [NOW - 60, NOW + 60]) {
      const ok = await probe().get('/ip').set(signClientIp(SECRET, '203.0.113.8', at));
      expect(ok.body.ip).toBe('203.0.113.8');
    }
  });

  it('أي خللٍ في التوقيع ← الترويسة تُتجاهل والعنوان من req.ip', async () => {
    const own = await peer();
    const valid = signClientIp(SECRET, '203.0.113.7', NOW);
    const forged: Array<Record<string, string>> = [
      // بلا توقيع.
      { 'X-OG-Client-IP': '203.0.113.7' },
      // سرٌّ آخر.
      signClientIp('another-secret-another-secret-another-secret', '203.0.113.7', NOW),
      // توقيعٌ صحيح لعنوانٍ غير المُدّعى.
      { ...valid, 'X-OG-Client-IP': '198.51.100.9' },
      // خارج النافذة.
      signClientIp(SECRET, '203.0.113.7', NOW - 61),
      signClientIp(SECRET, '203.0.113.7', NOW + 61),
      // ليس عنوان IP — ولو وُقِّع.
      signClientIp(SECRET, 'not-an-ip', NOW),
      signClientIp(SECRET, '203.0.113.7, 198.51.100.9', NOW),
      // صيغة توقيعٍ مكسورة.
      { 'X-OG-Client-IP': '203.0.113.7', 'X-OG-Client-Signature': 'garbage' },
      { 'X-OG-Client-IP': '203.0.113.7', 'X-OG-Client-Signature': `${NOW}.${'A'.repeat(64)}` },
    ];
    for (const headers of forged) {
      const res = await probe().get('/ip').set(headers);
      expect(res.body.ip, JSON.stringify(headers)).toBe(own);
    }
  });

  it('بلا سرٍّ مُعدّ لا يُقبل العنوان — ويُحذَّر لأن الموقع يوقّع والخادم لا', async () => {
    // وحدةٌ جديدة: حالة التحذير (مرة كل عشر دقائق) لا تتسرّب من الاختبارات السابقة.
    vi.resetModules();
    const fresh = await import('../src/middleware/client-ip.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const app = express();
      app.use(fresh.resolveClientIp(null, () => NOW));
      app.get('/ip', (req, res) => res.json({ ip: fresh.clientIp(req) }));
      const res = await request(app).get('/ip').set(signClientIp(SECRET, '203.0.113.7', NOW));
      expect(res.body.ip).toMatch(/127\.0\.0\.1$/);
      expect(warn.mock.calls.flat().join(' ')).toContain('BFF_SHARED_SECRET');
    } finally {
      warn.mockRestore();
    }
  });

  it('إعداد وسيطٍ خاطئ يُحذَّر منه مرةً واحدة (تشخيص express-rate-limit المفقود)', async () => {
    const warnings = async (trustProxy: unknown, headers: Record<string, string>) => {
      vi.resetModules();
      const fresh = await import('../src/middleware/client-ip.js');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const app = express();
        app.set('trust proxy', trustProxy);
        app.use(fresh.resolveClientIp(SECRET, () => NOW));
        app.get('/ip', (_req, res) => res.json({}));
        await request(app).get('/ip').set(headers);
        await request(app).get('/ip').set(headers);
        return warn.mock.calls.map((call) => String(call[0]));
      } finally {
        warn.mockRestore();
      }
    };
    const behindProxyUntrusted = await warnings(false, { 'X-Forwarded-For': '198.51.100.4' });
    expect(behindProxyUntrusted).toHaveLength(1);
    expect(behindProxyUntrusted[0]).toContain('TRUST_PROXY=false');
    // الإعداد السليم صامت.
    expect(await warnings(1, { 'X-Forwarded-For': '198.51.100.4' })).toEqual([]);
    expect(await warnings(false, {})).toEqual([]);
  });

  it('تحذيرٌ عن مشكلةٍ لا يُسكت تحذيراً عن أخرى', async () => {
    vi.resetModules();
    const fresh = await import('../src/middleware/client-ip.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const app = express();
      // طلبٌ بلا عنوان معروف أولاً (اتصالٌ مقطوع مثلاً)، ثم إعدادٌ خاطئ حقيقي.
      app.use('/unknown', (req, _res, next) => {
        Object.defineProperty(req, 'ip', { value: undefined });
        next();
      });
      app.use(fresh.resolveClientIp(SECRET, () => NOW));
      app.get(['/unknown', '/ip'], (_req, res) => res.json({}));
      await request(app).get('/unknown');
      await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.4');
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages).toHaveLength(2);
      expect(messages.join(' ')).toContain('req.ip غير معروف');
      expect(messages.join(' ')).toContain('TRUST_PROXY=false');
    } finally {
      warn.mockRestore();
    }
  });

  it('مفتاح الحدود يجمّع IPv6 بشبكته الفرعية — لا آلاف الدلاء لمشتركٍ واحد', async () => {
    const key = async (ip: string) =>
      (await probe().get('/ip').set(signClientIp(SECRET, ip, NOW))).body.key as string;
    expect(await key('2001:db8:abcd:12::1')).toBe(await key('2001:db8:abcd:12::ffff'));
    expect(await key('203.0.113.7')).not.toBe(await key('203.0.113.8'));
  });
});

describe('[CRITICAL] الحدود الفعلية في التطبيق تفصل زبائن الموقع', () => {
  const now = () => Math.floor(Date.now() / 1000);
  const as = (ip: string) => signClientIp(SECRET, ip, now());

  it('حدّ الدخول: زبونٌ استنفد محاولاته لا يحجب زبوناً آخر على الرقم نفسه', async () => {
    const phone = '07799999901';
    const attempt = (headers: Record<string, string>) =>
      api.post('/api/auth/login').set(headers).send({ phone, password: 'wrong-password-123' });

    for (let i = 0; i < 3; i += 1) {
      const res = await attempt(as('203.0.113.10'));
      expect(res.status, JSON.stringify(res.body)).not.toBe(429);
    }
    const blocked = await attempt(as('203.0.113.10'));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('LOGIN_RATE_LIMITED');

    // زبونٌ آخر خلف خادم الموقع نفسه — دلوه مستقلّ.
    expect((await attempt(as('203.0.113.11'))).status).not.toBe(429);
    // ترويسةٌ مزوّرة تدّعي عنوان الأول لا تقع في دلوه ولا تُخرجه منه.
    const forged = await attempt({ 'X-OG-Client-IP': '203.0.113.10' });
    expect(forged.status).not.toBe(429);
    expect((await attempt(as('203.0.113.10'))).status).toBe(429);
  });

  it('الحدّ العام: لكل زبونٍ دلوه', async () => {
    const hit = (ip: string) => api.get('/no-such-route').set(as(ip));
    for (let i = 0; i < 40; i += 1) {
      expect((await hit('198.51.100.20')).status).toBe(404);
    }
    expect((await hit('198.51.100.20')).status).toBe(429);
    expect((await hit('198.51.100.21')).status).toBe(404);
  });
});
