import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { seal, unseal, type SessionData } from './session';
import { sealSignup, unsealSignup, type WhatsAppSignupCookie } from './whatsapp-signup-cookie';

/**
 * WhatsApp sign-up BFF (API `WHATSAPP_VERIFY_MODE=auto`). The API's `secret`
 * must never reach page JavaScript: it lives in a sealed httpOnly cookie and
 * only the BFF sends it upstream. Completion starts a storefront session
 * exactly like login, customers only.
 */

const state = vi.hoisted(() => ({
  signup: null as WhatsAppSignupCookie | null,
  writtenSignup: [] as WhatsAppSignupCookie[],
  clearedSignup: 0,
  sessions: [] as SessionData[],
  calls: [] as Array<{ path: string; request: Record<string, unknown> }>,
  respond: (() => Promise.resolve({ data: {}, message: null })) as (path: string) => Promise<unknown>,
}));

vi.mock('@/lib/whatsapp-signup-cookie', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./whatsapp-signup-cookie')>()),
  readSignupCookie: async () => state.signup,
  writeSignupCookie: async (data: WhatsAppSignupCookie) => {
    state.writtenSignup.push(data);
  },
  clearSignupCookie: async () => {
    state.clearedSignup += 1;
  },
}));
vi.mock('@/lib/server-session', () => ({
  readSession: async () => null,
  writeSession: async (data: SessionData) => {
    state.sessions.push(data);
  },
  clearSession: async () => {},
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: (path: string, request: Record<string, unknown> = {}) => {
    state.calls.push({ path, request });
    return state.respond(path);
  },
}));

const SITE = 'http://127.0.0.1:3000';
const SECRET = 'S'.repeat(43);
const cookie: WhatsAppSignupCookie = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  secret: SECRET,
  code: 'OG-AB12C-DE34F',
  waLink: 'https://wa.me/9647500000000?text=OG-AB12C-DE34F',
  businessNumber: '+9647500000000',
  expiresAt: new Date(Date.now() + 300_000).toISOString(),
};

function req(path: string, body?: unknown, origin: string | null = SITE): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request(`${SITE}${path}`, { method: 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function fakeJwt(exp: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp })}.sig`;
}

beforeEach(() => {
  process.env.SITE_ORIGIN = SITE;
  state.signup = null;
  state.writtenSignup = [];
  state.clearedSignup = 0;
  state.sessions = [];
  state.calls = [];
  state.respond = () => Promise.resolve({ data: {}, message: null });
});

describe('sealed sign-up cookie', () => {
  const keys = [randomBytes(32)];

  it('round-trips, and a tampered or foreign-key value is refused', () => {
    const sealed = sealSignup(cookie, keys);
    expect(unsealSignup(sealed, keys)).toEqual(cookie);
    expect(sealed).not.toContain(SECRET);
    const parts = sealed.split('.');
    parts[3] = Buffer.from('x' + Buffer.from(parts[3]!, 'base64url').toString('latin1').slice(1), 'latin1').toString('base64url');
    expect(unsealSignup(parts.join('.'), keys)).toBeNull();
    expect(unsealSignup(sealed, [randomBytes(32)])).toBeNull();
    expect(unsealSignup(undefined, keys)).toBeNull();
  });

  it('[SECURITY] a session cookie is never accepted as a sign-up cookie, nor the reverse', () => {
    const session: SessionData = { token: 't', exp: 4_000_000_000, user: { id: 'u1', username: 'x', phone: '+9647700000000' } };
    expect(unsealSignup(seal(session, keys), keys)).toBeNull();
    expect(unseal(sealSignup(cookie, keys), keys)).toBeNull();
  });
});

describe('BFF /bff/register/whatsapp/start', () => {
  it('forwards the phone only; the secret goes to the cookie, never to the page', async () => {
    state.respond = () => Promise.resolve({ data: { ...cookie }, message: null });
    const { POST } = await import('@/app/bff/register/whatsapp/start/route');
    const res = await POST(req('/bff/register/whatsapp/start', { phone: '07701234567', password: 'nope', extra: 1 }));
    expect(res.status).toBe(201);
    expect(state.calls).toEqual([{ path: '/auth/register/whatsapp/start', request: { method: 'POST', body: { phone: '07701234567' } } }]);
    expect(state.writtenSignup).toEqual([cookie]);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain(SECRET);
    expect(JSON.stringify(body)).not.toContain(cookie.sessionId);
    expect(body.data).toEqual({ code: cookie.code, waLink: cookie.waLink, businessNumber: cookie.businessNumber, expiresAt: cookie.expiresAt });
  });

  it('refuses a foreign origin before calling the API', async () => {
    const { POST } = await import('@/app/bff/register/whatsapp/start/route');
    const res = await POST(req('/bff/register/whatsapp/start', { phone: '07701234567' }, 'https://evil.example'));
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('passes the API refusal (mode off) through unchanged', async () => {
    state.respond = () => Promise.reject(new ApiError(404, 'REGISTRATION_METHOD_UNAVAILABLE', 'التحقق عبر واتساب غير متاح — اطلب حساباً بالطريقة العادية'));
    const { POST } = await import('@/app/bff/register/whatsapp/start/route');
    const res = await POST(req('/bff/register/whatsapp/start', { phone: '07701234567' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('REGISTRATION_METHOD_UNAVAILABLE');
    expect(state.writtenSignup).toEqual([]);
  });
});

describe('BFF /bff/register/whatsapp/status', () => {
  it('no cookie → 404 without calling the API', async () => {
    const { POST } = await import('@/app/bff/register/whatsapp/status/route');
    const res = await POST(req('/bff/register/whatsapp/status', {}));
    expect(res.status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it('sends the cookie secret upstream; a terminal state clears the cookie, "verified" keeps it', async () => {
    state.signup = cookie;
    const { POST } = await import('@/app/bff/register/whatsapp/status/route');
    state.respond = () => Promise.resolve({ data: { status: 'verified' }, message: null });
    let res = await POST(req('/bff/register/whatsapp/status', {}));
    expect(res.status).toBe(200);
    expect(state.calls[0]!.request.body).toEqual({ sessionId: cookie.sessionId, secret: SECRET });
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(state.clearedSignup).toBe(0);
    state.respond = () => Promise.resolve({ data: { status: 'expired' }, message: null });
    res = await POST(req('/bff/register/whatsapp/status', {}));
    expect((await res.json()).data.status).toBe('expired');
    expect(state.clearedSignup).toBe(1);
  });

  it('an API 404 (session gone) clears the cookie', async () => {
    state.signup = cookie;
    state.respond = () => Promise.reject(new ApiError(404, 'SESSION_NOT_FOUND', 'جلسة التحقق غير موجودة — ابدأ من جديد'));
    const { POST } = await import('@/app/bff/register/whatsapp/status/route');
    const res = await POST(req('/bff/register/whatsapp/status', {}));
    expect(res.status).toBe(404);
    expect(state.clearedSignup).toBe(1);
  });
});

describe('BFF /bff/register/whatsapp/complete', () => {
  it('sends the details with the cookie secret, starts the session, clears the cookie', async () => {
    state.signup = cookie;
    const exp = Math.floor(Date.now() / 1000) + 3600;
    state.respond = () => Promise.resolve({
      data: { token: fakeJwt(exp), user: { id: 'u9', username: 'زبون', phone: '+9647701234567', role: 'customer' } },
      message: null,
    });
    const { POST } = await import('@/app/bff/register/whatsapp/complete/route');
    const res = await POST(req('/bff/register/whatsapp/complete', { username: 'زبون', gender: 'female', password: 'secret123', sessionId: 'forged', secret: 'forged' }));
    expect(res.status).toBe(201);
    expect(state.calls[0]!.request.body).toEqual({ sessionId: cookie.sessionId, secret: SECRET, username: 'زبون', gender: 'female', password: 'secret123' });
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]!.exp).toBe(exp);
    expect(state.clearedSignup).toBe(1);
    expect(JSON.stringify(await res.json())).not.toContain('secret123');
  });

  it('an admin account never gets a storefront session', async () => {
    state.signup = cookie;
    state.respond = () => Promise.resolve({ data: { token: fakeJwt(4_000_000_000), user: { id: 'a1', username: 'مدير', phone: '+9647800000000', role: 'admin' } }, message: null });
    const { POST } = await import('@/app/bff/register/whatsapp/complete/route');
    const res = await POST(req('/bff/register/whatsapp/complete', { username: 'x', gender: 'male', password: 'secret123' }));
    expect(res.status).toBe(403);
    expect(state.sessions).toEqual([]);
  });

  it('no cookie → 404; an API refusal (not verified yet) keeps the cookie', async () => {
    const { POST } = await import('@/app/bff/register/whatsapp/complete/route');
    expect((await POST(req('/bff/register/whatsapp/complete', {}))).status).toBe(404);
    state.signup = cookie;
    state.respond = () => Promise.reject(new ApiError(409, 'SESSION_NOT_VERIFIED', 'لم يكتمل التحقق عبر واتساب بعد'));
    const res = await POST(req('/bff/register/whatsapp/complete', { username: 'x', gender: 'male', password: 'secret123' }));
    expect(res.status).toBe(409);
    expect(state.clearedSignup).toBe(0);
    expect(state.sessions).toEqual([]);
  });
});
