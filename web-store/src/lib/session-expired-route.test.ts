import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { SessionData } from './session';

/**
 * `/bff/session/expired` is a GET any site can link to. It may drop the
 * session only when the API itself rejects the token.
 */

const state = vi.hoisted(() => ({
  session: null as SessionData | null,
  me: (): Promise<unknown> => Promise.resolve({ data: {} }),
  cleared: 0,
}));

vi.mock('@/lib/server-session', () => ({
  readSession: async () => state.session,
  clearSession: async () => {
    state.cleared += 1;
  },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: (path: string) => {
    expect(path).toBe('/auth/me');
    return state.me();
  },
}));

const { GET } = await import('@/app/bff/session/expired/route');

const SITE = 'http://127.0.0.1:3000';
const session: SessionData = { token: 'jwt', exp: 4_000_000_000, user: { id: 'u', username: 'زبون', phone: '07700000000' } };
const hit = () => GET(new Request(`${SITE}/bff/session/expired?returnTo=%2Forders`));

beforeEach(() => {
  vi.stubEnv('SITE_ORIGIN', SITE);
  state.session = session;
  state.cleared = 0;
});

describe('GET /bff/session/expired', () => {
  it('keeps a session the API still accepts (a link from another site cannot sign anyone out)', async () => {
    state.me = () => Promise.resolve({ data: {} });
    const response = await hit();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${SITE}/orders`);
    expect(state.cleared).toBe(0);
  });

  it('drops the session when the API rejects the token or the account is suspended', async () => {
    for (const error of [
      new ApiError(401, 'SESSION_REVOKED', 'انتهت صلاحية الجلسة'),
      new ApiError(401, 'UNAUTHORIZED', 'الرمز منتهي أو غير صالح'),
      new ApiError(403, 'ACCOUNT_SUSPENDED', 'الحساب موقوف'),
    ]) {
      state.cleared = 0;
      state.me = () => Promise.reject(error);
      const response = await hit();
      expect(response.headers.get('location'), error.code).toBe(`${SITE}/login?returnTo=%2Forders&expired=1`);
      expect(state.cleared, error.code).toBe(1);
    }
  });

  it('keeps the session when the API is unreachable', async () => {
    state.me = () => Promise.reject(new ApiError(503, 'UPSTREAM_UNAVAILABLE', 'تعذّر الاتصال بالخادم'));
    const response = await hit();
    expect(response.headers.get('location')).toBe(`${SITE}/orders`);
    expect(state.cleared).toBe(0);
  });

  it('without a session goes to login, and never off-site', async () => {
    state.session = null;
    const response = await GET(new Request(`${SITE}/bff/session/expired?returnTo=%2F.%2F%2Fevil.example`));
    expect(response.headers.get('location')).toBe(`${SITE}/login?returnTo=%2F&expired=1`);
  });
});
