import path from 'node:path';
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { e2eState, expectNoHorizontalOverflow, watchPageErrors } from './helpers';

/**
 * Every page at every target width: no horizontal scrolling, touch targets of
 * at least 44px on touch layouts, no CSP violations, no character artwork and
 * no landing page. Screenshots go to test-results/screens for human review.
 * This is browser emulation — not a substitute for checks on real phones.
 */

const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440] as const;
const SCREENS = path.join(process.cwd(), 'test-results', 'screens');
const AUTH_STATE = path.join(process.cwd(), 'e2e', '.state', 'auth.json');
const HEADERS = { 'x-real-ip': '203.0.113.52' };

/**
 * Each width is its own shopper (own IP): every page view is a set of API
 * calls under that shopper's rate limit, as for real visitors, and one
 * emulated device browsing every page eight times over would exceed it.
 */
function shopperIp(width: number, signedIn: boolean): string {
  return `203.0.113.${100 + WIDTHS.indexOf(width as (typeof WIDTHS)[number]) * 2 + (signedIn ? 1 : 0)}`;
}

async function contextFor(browser: Browser, width: number, signedIn: boolean): Promise<BrowserContext> {
  const touch = width < 900;
  return browser.newContext({
    viewport: { width, height: touch ? 780 : 900 },
    isMobile: touch,
    hasTouch: touch,
    deviceScaleFactor: touch ? 2 : 1,
    locale: 'ar-IQ',
    extraHTTPHeaders: { 'x-real-ip': shopperIp(width, signedIn) },
    ...(signedIn ? { storageState: AUTH_STATE } : {}),
  });
}

test.describe.configure({ mode: 'serial' });

let publicPages: string[] = [];
let privatePages: string[] = [];

test.beforeAll(async ({ browser }) => {
  const { phone, password, productId, apiUrl } = e2eState();
  const categories = (await (await fetch(`${apiUrl}/catalog/categories`)).json()) as { data: { items: Array<{ id: string }> } };
  publicPages = ['/', '/categories', `/c/${categories.data.items[0]!.id}`, `/p/${productId}`, '/search?q=%D9%87%D9%88%D8%AF%D9%8A', '/login', '/register', '/forgot-password', '/no-such-page'];

  // One login for the whole file; every width reuses the session.
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS });
  const page = await context.newPage();
  await page.goto('/login?returnTo=%2Forders');
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL('**/orders');
  const firstOrder = await page.locator('.order-list a').first().getAttribute('href').catch(() => null);
  // A cart line so the cart and checkout pages render their full layout.
  await page.request.post('/bff/cart', {
    headers: { Origin: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000' },
    data: { productId, quantity: 1, optionValue: null },
  });
  await context.storageState({ path: AUTH_STATE });
  await context.close();
  privatePages = ['/cart', '/checkout', '/orders', '/account', ...(firstOrder ? [firstOrder] : [])];
});

for (const width of WIDTHS) {
  test(`${width}px: no horizontal overflow, usable targets, no CSP errors`, async ({ browser }) => {
    for (const signedIn of [false, true]) {
      const context = await contextFor(browser, width, signedIn);
      const page = await context.newPage();
      const problems = watchPageErrors(page);
      for (const route of signedIn ? privatePages : publicPages) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const label = `${width}px ${route}`;
        await expectNoHorizontalOverflow(page, label);

        if (width < 900) {
          const small = await page.evaluate(() =>
            [...document.querySelectorAll<HTMLElement>('.btn, .bottom-nav a, .stepper button, .field input:not([type=radio]):not([type=checkbox]), .field select')]
              .filter((element) => element.offsetParent !== null)
              .map((element) => ({ text: (element.textContent ?? element.getAttribute('aria-label') ?? element.id).trim().slice(0, 30), height: element.getBoundingClientRect().height }))
              .filter((target) => target.height < 43.5),
          );
          expect(small, `${label}: touch targets under 44px`).toEqual([]);
        }

        // Only product imagery from the API — no app artwork on the website.
        const images = await page.evaluate(() => [...document.images].map((image) => image.currentSrc || image.src));
        for (const src of images) expect(src, label).not.toMatch(/assets\/|character|mascot/i);

        if ([320, 390, 768, 1280].includes(width)) {
          const name = `${width}${signedIn ? '-in' : ''}${route.replace(/[^a-z0-9]+/gi, '_')}.png`;
          await page.screenshot({ path: path.join(SCREENS, name), fullPage: true });
        }
      }
      expect(problems, `${width}px signedIn=${signedIn}`).toEqual([]);
      await context.close();
    }
  });
}

test('the home page is the catalog itself — no landing page', async ({ browser }) => {
  const context = await contextFor(browser, 360, false);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('كل المنتجات');
  await expect(page.locator('.product-card').first()).toBeVisible();
  // The first product is reachable without scrolling past a hero.
  const top = await page.locator('.product-card').first().evaluate((element) => element.getBoundingClientRect().top);
  expect(top).toBeLessThan(780);
  await context.close();
});
