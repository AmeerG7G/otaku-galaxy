import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import type { SessionData } from './session';

/**
 * STEP 76 BFF routes: the browser reaches the API only through these, with
 * the token attached server-side. Each must refuse a foreign origin, need a
 * session, forward only the fields the API takes, and never let a path
 * parameter become another API path.
 */

const state = vi.hoisted(() => ({
  session: null as SessionData | null,
  written: [] as SessionData[],
  cleared: 0,
  calls: [] as Array<{ path: string; request: Record<string, unknown> }>,
  uploads: [] as Array<{ path: string; form: FormData; token: string }>,
  respond: (() => Promise.resolve({ data: {}, message: null })) as (path: string) => Promise<unknown>,
}));

vi.mock('@/lib/server-session', () => ({
  readSession: async () => state.session,
  writeSession: async (data: SessionData) => {
    state.written.push(data);
  },
  clearSession: async () => {
    state.cleared += 1;
  },
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  apiFetch: (path: string, request: Record<string, unknown> = {}) => {
    state.calls.push({ path, request });
    return state.respond(path);
  },
  apiUpload: (path: string, form: FormData, token: string) => {
    state.uploads.push({ path, form, token });
    return Promise.resolve({ data: { id: 'm1', url: '/uploads/review/2026/10/a.jpg' }, message: 'تم رفع الصورة' });
  },
}));

const SITE = 'http://127.0.0.1:3000';
const PRODUCT = '6a1f0e76-7d4c-4a54-9f86-0d6a2f1e9b10';
const VARIANT = '7b2f0e76-7d4c-4a54-9f86-0d6a2f1e9b11';
const ORDER = '8c3f0e76-7d4c-4a54-9f86-0d6a2f1e9b12';
const session: SessionData = { token: 'old-jwt', exp: 4_000_000_000, user: { id: 'u1', username: 'زبون', phone: '+9647700000000' } };

/** A JWT-shaped token whose payload carries `exp` (the BFF reads it unverified, to bound the cookie). */
function fakeJwt(exp: number): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ sub: 'u1', exp })}.sig`;
}

function req(path: string, init: { method: string; body?: unknown; origin?: string | null; headers?: Record<string, string> }): Request {
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (init.origin !== null) headers.origin = init.origin ?? SITE;
  if (init.body !== undefined && !(init.body instanceof FormData)) headers['content-type'] = 'application/json';
  return new Request(`${SITE}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : init.body instanceof FormData ? init.body : JSON.stringify(init.body),
  });
}
const params = <T,>(value: T) => ({ params: Promise.resolve(value) });

const routes = {
  favorites: await import('@/app/bff/favorites/route'),
  favorite: await import('@/app/bff/favorites/[productId]/route'),
  restock: await import('@/app/bff/restock/route'),
  restockOne: await import('@/app/bff/restock/[productId]/route'),
  reviews: await import('@/app/bff/reviews/route'),
  review: await import('@/app/bff/reviews/[id]/route'),
  uploads: await import('@/app/bff/uploads/route'),
  profile: await import('@/app/bff/account/profile/route'),
  password: await import('@/app/bff/account/password/route'),
  birthday: await import('@/app/bff/birthday/route'),
  claim: await import('@/app/bff/points/rewards/[levelKey]/claim/route'),
  read: await import('@/app/bff/notifications/[id]/read/route'),
  readAll: await import('@/app/bff/notifications/read-all/route'),
};

beforeEach(() => {
  vi.stubEnv('SITE_ORIGIN', SITE);
  state.session = session;
  state.written = [];
  state.cleared = 0;
  state.calls = [];
  state.uploads = [];
  state.respond = (path) =>
    Promise.resolve(
      path === '/auth/me'
        ? { data: { user: { id: 'u1', username: 'زبون', phone: '+9647700000000', role: 'customer', gender: null } }, message: null }
        : path === '/auth/me/password'
          ? { data: { token: fakeJwt(4_100_000_000), user: { id: 'u1', username: 'زبون', phone: '+9647700000000', role: 'customer' } }, message: null }
          : { data: {}, message: null },
    );
});

/** Every mutating STEP 76 route, called the way the browser does. */
const mutations: Array<[string, (origin?: string | null) => Promise<Response>]> = [
  ['POST favorites', (o) => routes.favorites.POST(req('/bff/favorites', { method: 'POST', body: { productId: PRODUCT }, origin: o }))],
  ['DELETE favorite', (o) => routes.favorite.DELETE(req(`/bff/favorites/${PRODUCT}`, { method: 'DELETE', origin: o }), params({ productId: PRODUCT }))],
  ['POST restock', (o) => routes.restock.POST(req('/bff/restock', { method: 'POST', body: { productId: PRODUCT }, origin: o }))],
  ['DELETE restock', (o) => routes.restockOne.DELETE(req(`/bff/restock/${PRODUCT}`, { method: 'DELETE', origin: o }), params({ productId: PRODUCT }))],
  ['POST reviews', (o) => routes.reviews.POST(req('/bff/reviews', { method: 'POST', body: { orderId: ORDER, productId: PRODUCT, rating: 5 }, origin: o }))],
  ['PATCH review', (o) => routes.review.PATCH(req(`/bff/reviews/${PRODUCT}`, { method: 'PATCH', body: { rating: 4 }, origin: o }), params({ id: PRODUCT }))],
  ['PATCH profile', (o) => routes.profile.PATCH(req('/bff/account/profile', { method: 'PATCH', body: { username: 'اسم' }, origin: o }))],
  ['PATCH password', (o) => routes.password.PATCH(req('/bff/account/password', { method: 'PATCH', body: { currentPassword: 'a', newPassword: 'bbbbbbbb' }, origin: o }))],
  ['POST birthday', (o) => routes.birthday.POST(req('/bff/birthday', { method: 'POST', body: { day: 1, month: 2 }, origin: o }))],
  ['POST claim', (o) => routes.claim.POST(req('/bff/points/rewards/explorer/claim', { method: 'POST', origin: o }), params({ levelKey: 'explorer' }))],
  ['POST read', (o) => routes.read.POST(req(`/bff/notifications/${PRODUCT}/read`, { method: 'POST', origin: o }), params({ id: PRODUCT }))],
  ['POST read-all', (o) => routes.readAll.POST(req('/bff/notifications/read-all', { method: 'POST', origin: o }))],
];

describe('[CRITICAL] every STEP 76 mutation', () => {
  it('refuses another origin, and a request with no origin evidence, before touching the API', async () => {
    for (const [name, call] of mutations) {
      for (const origin of ['https://evil.example', null]) {
        const response = await call(origin);
        expect(response.status, `${name} from ${origin}`).toBe(403);
      }
    }
    expect(state.calls).toEqual([]);
  });

  it('needs a session', async () => {
    state.session = null;
    for (const [name, call] of mutations) {
      expect((await call()).status, name).toBe(401);
    }
    expect(state.calls).toEqual([]);
  });

  it('sends the session token, never one from the browser, and answers uncacheable', async () => {
    for (const [name, call] of mutations) {
      state.calls = [];
      const response = await call();
      expect(response.status, name).toBeLessThan(300);
      expect(response.headers.get('cache-control'), name).toBe('no-store');
      expect(state.calls[0]?.request.token, name).toBe('old-jwt');
    }
  });

  it('ends the browser session when the API rejects the token', async () => {
    state.respond = () => Promise.reject(new ApiError(401, 'SESSION_REVOKED', 'انتهت صلاحية الجلسة'));
    const response = await mutations[0]![1]();
    expect(response.status).toBe(401);
    expect(state.cleared).toBe(1);
  });
});

describe('path parameters never become another API path', () => {
  it('a non-UUID id is refused at the BFF', async () => {
    for (const bad of ['..%2F..%2Fadmin', 'x', `${PRODUCT}/../../admin`]) {
      expect((await routes.favorite.DELETE(req('/bff/favorites/x', { method: 'DELETE' }), params({ productId: bad }))).status).toBe(404);
      expect((await routes.restockOne.DELETE(req('/bff/restock/x', { method: 'DELETE' }), params({ productId: bad }))).status).toBe(404);
      expect((await routes.review.PATCH(req('/bff/reviews/x', { method: 'PATCH', body: { rating: 3 } }), params({ id: bad }))).status).toBe(404);
      expect((await routes.read.POST(req('/bff/notifications/x/read', { method: 'POST' }), params({ id: bad }))).status).toBe(404);
    }
    expect(state.calls).toEqual([]);
  });

  it('a level key outside the shape is refused; a valid one reaches the claim route as-is', async () => {
    for (const bad of ['../points', 'Explorer', 'a b', '', 'x'.repeat(40)]) {
      expect((await routes.claim.POST(req('/bff/points/rewards/x/claim', { method: 'POST' }), params({ levelKey: bad }))).status, bad).toBe(400);
    }
    expect(state.calls).toEqual([]);
    await routes.claim.POST(req('/bff/points/rewards/voyager/claim', { method: 'POST' }), params({ levelKey: 'voyager' }));
    expect(state.calls[0]).toMatchObject({ path: '/points/rewards/voyager/claim', request: { method: 'POST' } });
  });

  it('a colour alert carries a UUID variant or none at all', async () => {
    expect((await routes.restock.POST(req('/bff/restock', { method: 'POST', body: { productId: PRODUCT, variantId: 'red' } }))).status).toBe(404);
    expect((await routes.restockOne.DELETE(req(`/bff/restock/${PRODUCT}?variantId=red`, { method: 'DELETE' }), params({ productId: PRODUCT }))).status).toBe(404);
    expect(state.calls).toEqual([]);
    await routes.restock.POST(req('/bff/restock', { method: 'POST', body: { productId: PRODUCT, variantId: VARIANT } }));
    await routes.restock.POST(req('/bff/restock', { method: 'POST', body: { productId: PRODUCT } }));
    await routes.restockOne.DELETE(req(`/bff/restock/${PRODUCT}?variantId=${VARIANT}`, { method: 'DELETE' }), params({ productId: PRODUCT }));
    expect(state.calls.map((call) => [call.path, call.request.body ?? call.request.query])).toEqual([
      ['/restock-subscriptions', { productId: PRODUCT, variantId: VARIANT }],
      ['/restock-subscriptions', { productId: PRODUCT }],
      [`/restock-subscriptions/${PRODUCT}`, { variantId: VARIANT }],
    ]);
  });
});

describe('[CRITICAL] password change re-seals this browser\'s session', () => {
  it('stores the NEW token with its own expiry; the old token is gone from the cookie', async () => {
    const exp = 4_100_000_000;
    state.respond = () =>
      Promise.resolve({ data: { token: fakeJwt(exp), user: { id: 'u1', username: 'زبون', phone: '+9647700000000', role: 'customer' } }, message: 'تم تغيير كلمة المرور بنجاح' });
    const response = await routes.password.PATCH(
      req('/bff/account/password', { method: 'PATCH', body: { currentPassword: 'old-pass', newPassword: 'new-pass-1' } }),
    );
    expect(response.status).toBe(200);
    expect(state.calls[0]).toMatchObject({ path: '/auth/me/password', request: { method: 'PATCH', body: { currentPassword: 'old-pass', newPassword: 'new-pass-1' }, token: 'old-jwt' } });
    expect(state.written).toEqual([{ token: fakeJwt(exp), exp, user: { id: 'u1', username: 'زبون', phone: '+9647700000000' } }]);
    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain(fakeJwt(exp));
  });

  it('a wrong current password changes nothing and keeps the session', async () => {
    state.respond = () => Promise.reject(new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'كلمة المرور الحالية غير صحيحة'));
    const response = await routes.password.PATCH(req('/bff/account/password', { method: 'PATCH', body: { currentPassword: 'x', newPassword: 'new-pass-1' } }));
    expect(response.status).toBe(400);
    expect((await response.json()) as object).toMatchObject({ error: { code: 'INVALID_CURRENT_PASSWORD' } });
    expect(state.written).toEqual([]);
    expect(state.cleared).toBe(0);
  });

  it('missing fields never reach the API', async () => {
    expect((await routes.password.PATCH(req('/bff/account/password', { method: 'PATCH', body: { newPassword: 'x' } }))).status).toBe(400);
    expect(state.calls).toEqual([]);
  });
});

describe('profile', () => {
  it('forwards only the fields the app edits and refreshes the session name', async () => {
    state.respond = () =>
      Promise.resolve({ data: { user: { id: 'u1', username: 'اسم جديد', phone: '+9647700000000', gender: 'female', avatarUrl: null, role: 'customer' } }, message: null });
    const response = await routes.profile.PATCH(
      req('/bff/account/profile', { method: 'PATCH', body: { username: 'اسم جديد', gender: 'female', phone: '+9647811111111', role: 'admin' } }),
    );
    expect(response.status).toBe(200);
    expect(state.calls[0]?.request.body).toEqual({ username: 'اسم جديد', gender: 'female' });
    expect(state.written).toEqual([{ ...session, user: { ...session.user, username: 'اسم جديد' } }]);
  });

  it('refuses a third gender, an outside photo URL and an empty change', async () => {
    for (const body of [{ gender: 'unknown' }, { avatarUrl: 'https://evil.example/a.png' }, {}]) {
      expect((await routes.profile.PATCH(req('/bff/account/profile', { method: 'PATCH', body }))).status, JSON.stringify(body)).toBe(400);
    }
    expect(state.calls).toEqual([]);
  });
});

describe('reviews', () => {
  it('forwards rating, comment and uploaded photo references only', async () => {
    await routes.reviews.POST(
      req('/bff/reviews', {
        method: 'POST',
        body: { orderId: ORDER, productId: PRODUCT, rating: 5, comment: 'ممتاز', photoUrls: ['/uploads/review/2026/10/a.jpg'], status: 'approved', userId: 'x' },
      }),
    );
    expect(state.calls[0]).toMatchObject({
      path: '/reviews',
      request: { method: 'POST', body: { orderId: ORDER, productId: PRODUCT, rating: 5, comment: 'ممتاز', photoUrls: ['/uploads/review/2026/10/a.jpg'] } },
    });
    expect(Object.keys(state.calls[0]!.request.body as object).sort()).toEqual(['comment', 'orderId', 'photoUrls', 'productId', 'rating']);
  });

  it('refuses an outside photo URL, six photos, a fractional or boolean rating', async () => {
    const photo = '/uploads/review/2026/10/a.jpg';
    for (const extra of [
      { rating: 5, photoUrls: ['https://evil.example/a.jpg'] },
      { rating: 5, photoUrls: ['/uploads/../../etc/passwd'] },
      { rating: 5, photoUrls: Array(6).fill(photo) },
      { rating: 4.5 },
      { rating: true },
      { rating: 0 },
    ]) {
      const response = await routes.reviews.POST(req('/bff/reviews', { method: 'POST', body: { orderId: ORDER, productId: PRODUCT, ...extra } }));
      expect(response.status, JSON.stringify(extra)).toBe(400);
    }
    expect(state.calls).toEqual([]);
  });
});

describe('[CRITICAL] uploads', () => {
  const upload = (form: FormData, headers?: Record<string, string>) => routes.uploads.POST(req('/bff/uploads', { method: 'POST', body: form, headers }));
  const file = (bytes: number) => new File([new Uint8Array(bytes)], 'my-private-name.jpg', { type: 'image/jpeg' });

  it('forwards the file and purpose with the session token, not the browser file name', async () => {
    const form = new FormData();
    form.set('purpose', 'review');
    form.set('file', file(1000));
    const response = await upload(form);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { url: '/uploads/review/2026/10/a.jpg' } });
    const sent = state.uploads[0]!;
    expect(sent).toMatchObject({ path: '/uploads', token: 'old-jwt' });
    expect([...sent.form.keys()].sort()).toEqual(['file', 'purpose']);
    expect((sent.form.get('file') as File).name).toBe('upload');
  });

  it('refuses a purpose other than review or avatar, a missing file and a body over 5 MB', async () => {
    const product = new FormData();
    product.set('purpose', 'product');
    product.set('file', file(10));
    expect((await upload(product)).status).toBe(403);

    const empty = new FormData();
    empty.set('purpose', 'review');
    expect((await upload(empty)).status).toBe(400);

    const large = new FormData();
    large.set('purpose', 'avatar');
    large.set('file', file(5 * 1024 * 1024 + 1));
    expect((await upload(large)).status).toBe(413);

    expect(state.uploads).toEqual([]);
  });

  it('refuses a declared body larger than the cap without reading it', async () => {
    const form = new FormData();
    form.set('purpose', 'review');
    form.set('file', file(10));
    expect((await upload(form, { 'content-length': String(50 * 1024 * 1024) })).status).toBe(413);
    expect(state.uploads).toEqual([]);
  });
});

describe('birthday', () => {
  it('sends integers only; the API owns the once-only and first-order rules', async () => {
    expect((await routes.birthday.POST(req('/bff/birthday', { method: 'POST', body: { day: '3', month: 4 } }))).status).toBe(400);
    expect(state.calls).toEqual([]);
    state.respond = () => Promise.reject(new ApiError(409, 'BIRTHDAY_ALREADY_SET', 'تاريخ الميلاد محفوظ ولا يمكن تغييره'));
    const response = await routes.birthday.POST(req('/bff/birthday', { method: 'POST', body: { day: 3, month: 4 } }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'BIRTHDAY_ALREADY_SET', message: 'تاريخ الميلاد محفوظ ولا يمكن تغييره' } });
  });
});
