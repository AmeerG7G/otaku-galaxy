import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { accountDeletionInfo, parseLegalLang, privacyPolicy } from './legal-content';
import type { SessionData } from './session';

/**
 * STEP 78 — the public privacy policy and account-deletion pages, and the
 * one BFF route that deletes an account.
 */

const state = vi.hoisted(() => ({
  session: null as SessionData | null,
  cleared: 0,
  calls: [] as Array<{ path: string; request: Record<string, unknown> }>,
  respond: (() => Promise.resolve({ data: {}, message: null })) as (path: string) => Promise<unknown>,
}));

vi.mock('@/lib/server-session', () => ({
  readSession: async () => state.session,
  writeSession: async () => undefined,
  clearSession: async () => {
    state.cleared += 1;
  },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: (p: string, request: Record<string, unknown> = {}) => {
    state.calls.push({ path: p, request });
    return state.respond(p);
  },
}));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ refresh() {}, push() {}, replace() {} }),
}));

const SITE = 'http://127.0.0.1:3000';
const session: SessionData = { token: 'jwt', exp: 4_000_000_000, user: { id: 'u1', username: 'زبون', phone: '+9647700000000' } };

const route = await import('@/app/bff/account/delete/route');
const { default: PrivacyPage } = await import('@/app/privacy-policy/page');
const { default: DeletePage } = await import('@/app/delete-account/page');

function req(body: unknown, origin: string | null = SITE): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin !== null) headers.origin = origin;
  return new Request(`${SITE}/bff/account/delete`, { method: 'POST', headers, body: JSON.stringify(body) });
}

const page = async (Page: (props: { searchParams: Promise<{ lang?: string }> }) => Promise<React.ReactElement>, lang?: string) =>
  renderToStaticMarkup(await Page({ searchParams: Promise.resolve(lang ? { lang } : {}) }));

beforeEach(() => {
  vi.stubEnv('SITE_ORIGIN', SITE);
  state.session = session;
  state.cleared = 0;
  state.calls = [];
  state.respond = () => Promise.resolve({ data: { reference: 'DEL-0123456789', deletedAt: '2026-10-31T00:00:00.000Z', retainedOrders: 2 }, message: 'تم حذف حسابك' });
});

describe('[SECURITY] POST /bff/account/delete', () => {
  it('refuses another origin before reading anything', async () => {
    const res = await route.POST(req({ password: 'x' }, 'https://evil.example'));
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it('needs a session — a visitor cannot delete anyone with a phone and password', async () => {
    state.session = null;
    const res = await route.POST(req({ password: 'x', phone: '07700000000' }));
    expect(res.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it('needs the password', async () => {
    const res = await route.POST(req({}));
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it('forwards only password and reason, with the session token, then drops the session', async () => {
    const res = await route.POST(req({ password: 'secret', reason: '  bye  ', userId: 'someone-else', phone: '07711111111' }));
    expect(res.status).toBe(200);
    expect(state.calls).toEqual([
      { path: '/auth/me/delete', request: { method: 'POST', body: { password: 'secret', reason: 'bye' }, token: 'jwt' } },
    ]);
    expect(state.cleared).toBe(1);
    const json = await res.json();
    expect(json.data).toEqual({ reference: 'DEL-0123456789', retainedOrders: 2 });
    // [PRIVACY] no phone, no token in the answer.
    expect(JSON.stringify(json)).not.toMatch(/jwt|770000/);
  });

  it('a wrong password keeps the session; an expired one ends it', async () => {
    state.respond = () => Promise.reject(new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'كلمة المرور الحالية غير صحيحة'));
    expect((await route.POST(req({ password: 'bad' }))).status).toBe(400);
    expect(state.cleared).toBe(0);

    state.respond = () => Promise.reject(new ApiError(409, 'ACCOUNT_HAS_ACTIVE_ORDERS', 'لا يمكن حذف الحساب'));
    expect((await route.POST(req({ password: 'ok' }))).status).toBe(409);
    expect(state.cleared).toBe(0);

    state.respond = () => Promise.reject(new ApiError(401, 'SESSION_REVOKED', 'انتهت'));
    expect((await route.POST(req({ password: 'ok' }))).status).toBe(401);
    expect(state.cleared).toBe(1);
  });

  it('refuses a reason over 500 characters without calling the API', async () => {
    const res = await route.POST(req({ password: 'x', reason: 'a'.repeat(501) }));
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]);
  });
});

describe('public pages', () => {
  it('the privacy policy renders for a visitor in Arabic and English, with the deletion link', async () => {
    state.session = null;
    const ar = await page(PrivacyPage);
    expect(ar).toContain('سياسة الخصوصية');
    expect(ar).toContain('lang="ar" dir="rtl"');
    expect(ar).toContain('href="/delete-account"');
    const en = await page(PrivacyPage, 'en');
    expect(en).toContain('Privacy Policy');
    expect(en).toContain('lang="en" dir="ltr"');
    expect(en).toContain('href="/delete-account?lang=en"');
    expect(state.calls).toEqual([]);
  });

  it('the deletion page explains everything to a visitor and asks them to sign in — no phone field', async () => {
    state.session = null;
    const html = await page(DeletePage, 'en');
    expect(html).toContain('What is deleted');
    expect(html).toContain('What is kept, and why');
    expect(html).toContain(`href="/login?returnTo=${encodeURIComponent('/delete-account?lang=en')}"`);
    expect(html).not.toMatch(/type="tel"|name="phone"/);
    expect(html).not.toContain('type="password"');
  });

  it('a signed-in customer sees the form with their own account only', async () => {
    const html = await page(DeletePage);
    expect(html).toContain('طلب حذف الحساب');
    expect(html).toContain('type="password"');
    expect(html).toContain('07700000000');
    expect(html).not.toContain('jwt');
  });

  it('?lang accepts only en; anything else is Arabic', () => {
    expect(parseLegalLang('en')).toBe('en');
    expect(parseLegalLang(['en'])).toBe('en');
    expect(parseLegalLang('fr')).toBe('ar');
    expect(parseLegalLang(undefined)).toBe('ar');
  });
});

describe('policy text stays in step with the backend', () => {
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/src');

  it('both languages have the same sections', () => {
    const ids = (p: ReturnType<typeof privacyPolicy>) => p.sections.map((s) => [s.id, s.items?.length ?? 0, s.paragraphs?.length ?? 0]);
    expect(ids(privacyPolicy('en'))).toEqual(ids(privacyPolicy('ar')));
    expect(ids(accountDeletionInfo('en'))).toEqual(ids(accountDeletionInfo('ar')));
  });

  it('retention numbers quoted in the policy are the ones in the code', async () => {
    const outbox = await readFile(path.join(backend, 'jobs/pushOutboxJob.ts'), 'utf8');
    const analytics = await readFile(path.join(backend, 'domain/analyticsDefinitions.ts'), 'utf8');
    const text = JSON.stringify(privacyPolicy('en'));
    expect(text).toContain('30 days');
    expect(text).toContain('60 days');
    expect(text).toContain('400 days');
    expect(outbox).toMatch(/const RETENTION_DAYS = 30;/);
    expect(outbox).toMatch(/STALE_TOKEN_DAYS = 60;/);
    expect(analytics).toMatch(/RAW_TRACKING_RETENTION_DAYS = 400;/);
  });
});
