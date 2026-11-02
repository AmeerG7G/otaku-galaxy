import { expect, test } from '@playwright/test';
import { e2eState } from './helpers';

/**
 * The BFF boundary, checked against the running site: CSRF, admin
 * isolation, redirects, the session cookie, CSP, and per-shopper rate limits
 * end to end (web server → signed shopper IP → API limiter).
 */

const SITE = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
test.use({ extraHTTPHeaders: { 'x-real-ip': '203.0.113.53' } });

test('mutating BFF routes refuse other origins and requests without origin proof', async ({ request }) => {
  const variants: Array<Record<string, string>> = [{ Origin: 'https://evil.example' }, { Origin: 'null' }, {}];
  for (const headers of variants) {
    for (const route of ['/bff/cart', '/bff/session', '/bff/orders', '/bff/register']) {
      const response = await request.post(route, { headers, data: {} });
      expect(response.status(), `${route} ${JSON.stringify(headers)}`).toBe(403);
      expect((await response.json()).error.code).toBe('CROSS_ORIGIN_REJECTED');
    }
  }
});

test('there is no route to the admin API or any other API path through the site', async ({ request }) => {
  for (const route of ['/bff/admin/orders', '/api/admin/orders', '/api/orders', '/bff/auth/me', '/bff/../api/admin']) {
    expect((await request.get(route)).status(), route).toBe(404);
  }
  // Whatever renders under /bff/ (a framework 404 page) may run nothing at all.
  const policy = (await request.get('/bff/no-such-route')).headers()['content-security-policy'] ?? '';
  expect(policy).toContain("default-src 'none'");
});

test('admin accounts cannot hold a storefront session', async ({ request }) => {
  const phone = process.env.SEED_ADMIN_PHONE!;
  const password = process.env.SEED_ADMIN_PASSWORD!;
  const response = await request.post('/bff/session', { headers: { Origin: SITE }, data: { phone, password } });
  expect(response.status()).toBe(403);
  expect((await response.json()).error.code).toBe('WEB_CUSTOMERS_ONLY');
  expect(response.headers()['set-cookie'] ?? '').not.toContain('og_session');
});

test('login never redirects off-site, and the session cookie is unreadable by scripts', async ({ page }) => {
  const { phone, password } = e2eState();
  await page.goto('/login?returnTo=%2F%2Fevil.example%2Fpath');
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL(`${SITE}/`);

  const cookie = (await page.context().cookies()).find((entry) => entry.name.endsWith('og_session'));
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.cookie)).not.toContain('og_session');

  // The API bearer token never reaches the browser.
  await page.goto('/account');
  expect(await page.content()).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);

  // Signed in, a crafted returnTo still lands on this site — including dot
  // segments that normalise to `//host`.
  for (const returnTo of ['%2F%2Fevil.example', '%2F.%2F%2Fevil.example%2Flogin', '%2Fa%2F..%2F%2Fevil.example', '%2F%252e%2F%2Fevil.example']) {
    const response = await page.request.get(`/login?returnTo=${returnTo}`, { maxRedirects: 0 });
    expect(response.status(), returnTo).toBe(307);
    expect(response.headers().location, returnTo).toBe('/');
  }

  // A link from another site to the "session expired" route cannot sign out a
  // session the API still accepts: it continues on this site, still signed in.
  const expired = await page.request.get('/bff/session/expired?returnTo=%2F.%2F%2Fevil.example', {
    maxRedirects: 0,
    headers: { 'Sec-Fetch-Site': 'cross-site' },
  });
  expect(expired.status()).toBe(303);
  expect(expired.headers().location).toBe(`${SITE}/`);
  expect(expired.headers()['set-cookie'] ?? '').not.toContain('og_session');
  await page.goto('/account');
  await expect(page).toHaveURL(`${SITE}/account`);
});

test('every page carries a nonce CSP and every script uses that nonce', async ({ request }) => {
  const response = await request.get('/');
  const policy = response.headers()['content-security-policy'] ?? '';
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce).toBeTruthy();
  expect(policy).toContain("frame-ancestors 'none'");
  expect(policy).toContain("object-src 'none'");
  const html = await response.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) expect(tag).toContain(`nonce="${nonce}"`);
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});

test('[end to end] login rate limits are per shopper behind the site, not one bucket for all', async ({ playwright }) => {
  // A phone nobody owns; 10 attempts per (phone + shopper IP) per window.
  const phone = `0773${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const shopper = async (ip: string) =>
    playwright.request.newContext({ baseURL: SITE, extraHTTPHeaders: { 'x-real-ip': ip, Origin: SITE } });
  const attempt = async (ip: string) => {
    const context = await shopper(ip);
    const response = await context.post('/bff/session', { data: { phone, password: 'wrong-password-123' } });
    const code = ((await response.json()) as { error?: { code?: string } }).error?.code;
    await context.dispose();
    return { status: response.status(), code };
  };

  const a = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  for (let i = 0; i < 10; i += 1) expect((await attempt(a)).status).not.toBe(429);
  expect(await attempt(a)).toEqual({ status: 429, code: 'LOGIN_RATE_LIMITED' });
  // Another shopper behind the same web server is not locked out.
  expect((await attempt(`${a.split('.').slice(0, 3).join('.')}.9`)).status).not.toBe(429);
});
