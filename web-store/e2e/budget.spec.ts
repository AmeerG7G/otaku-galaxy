import { expect, test } from '@playwright/test';
import { e2eState } from './helpers';

/**
 * One shopper (one IP) browsing for a while stays well inside the API's
 * per-shopper limit (300 calls / 15 min by default). Every page is rendered
 * per request from the API with the shopper's signed IP, so link prefetching
 * — each card and chip in view rendered ahead of time — used to multiply a
 * page view into 11–32 API calls and lock the shopper out after about a
 * dozen listings. This visits 42 pages, scrolled to the bottom, as one
 * shopper: no prefetch requests, and no page fails.
 */

test.use({ extraHTTPHeaders: { 'x-real-ip': '203.0.113.200' } });

test('42 page views by one shopper: no prefetching, no rate-limited pages', async ({ page }) => {
  test.setTimeout(240_000);
  const { productId, apiUrl } = e2eState();
  const categories = (await (await fetch(`${apiUrl}/catalog/categories`)).json()) as { data: { items: Array<{ id: string }> } };
  const route = ['/', '/?page=2', '/categories', `/c/${categories.data.items[0]!.id}`, `/p/${productId}`, '/search?q=%D9%87%D9%88%D8%AF%D9%8A'];

  const prefetches: string[] = [];
  page.on('request', (request) => {
    if (request.headers()['next-router-prefetch']) prefetches.push(request.url());
  });

  for (let round = 0; round < 7; round += 1) {
    for (const path of route) {
      const response = await page.goto(path);
      expect(response?.status(), `${round}:${path}`).toBe(200);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('heading', { name: 'تعذّر تحميل الصفحة' }), `${round}:${path}`).toHaveCount(0);
    }
  }
  expect(prefetches).toEqual([]);
});
