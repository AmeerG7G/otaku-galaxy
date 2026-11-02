import { expect, test, type Page } from '@playwright/test';
import { e2eState, watchPageErrors } from './helpers';

/**
 * The whole purchase path against the real API: browse → product → login →
 * cart → checkout → order. Amounts on screen come from the API's quote; the
 * order is created exactly once even when the browser never sees the first
 * response.
 */

const SITE = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';
test.use({ extraHTTPHeaders: { 'x-real-ip': '203.0.113.51' } });

async function fillCheckout(page: Page) {
  const { governorateId } = e2eState();
  await page.getByLabel('المحافظة').selectOption(governorateId);
  await page.getByLabel('العنوان الكامل').fill('بغداد، الكرادة، قرب ساحة الواثق');
  // The phone is prefilled from the account; the total appears once priced.
  await expect(page.getByLabel('رقم الهاتف')).toHaveValue(/^07\d{9}$/);
  await expect(page.locator('.summary-row--total')).not.toContainText('—');
  await expect(page.getByRole('button', { name: 'تأكيد الطلب' })).toBeEnabled();
}

test('browse → login → cart → checkout: one order, even when the first response is lost', async ({ page }) => {
  const { phone, password, productId } = e2eState();
  const problems = watchPageErrors(page);

  await page.goto('/');
  await expect(page.locator('.product-card').first()).toBeVisible();

  await page.goto(`/p/${productId}`);
  await page.getByRole('link', { name: 'سجّل الدخول للإضافة إلى السلة' }).click();
  await page.waitForURL(/\/login\?returnTo=/);
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL(`**/p/${productId}`);

  await page.getByRole('button', { name: 'أضف إلى السلة' }).click();
  await expect(page.getByText('أُضيف إلى السلة')).toBeVisible();

  await page.goto('/cart');
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await page.getByRole('link', { name: 'متابعة إلى الدفع' }).click();
  await page.waitForURL('**/checkout');
  await fillCheckout(page);
  // What is reviewed is what the fingerprint covers.
  await expect(page.locator('.review-lines li')).toHaveCount(1);

  // The server creates the order, but the browser never sees the answer.
  let attempts = 0;
  await page.route('**/bff/orders', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.getByText('لم نتأكد من وصول طلبك')).toBeVisible();

  // Same idempotency key → the API replays the committed order.
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?placed=1$/);
  await expect(page.getByText('تم استلام طلبك')).toBeVisible();
  expect(attempts).toBe(2);

  await page.goto('/orders');
  await expect(page.locator('.order-list > li')).toHaveCount(1);
  expect(problems).toEqual([]);
});

test('a cart change after review is refused (QUOTE_CHANGED), then the re-reviewed order goes through', async ({ page }) => {
  const { phone, password, productId } = e2eState();
  const problems = watchPageErrors(page);

  await page.goto('/login?returnTo=%2Fcart');
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL('**/cart');

  const add = (quantity: number) =>
    page.request.post('/bff/cart', { headers: { Origin: SITE }, data: { productId, quantity, optionValue: null } });
  expect((await add(1)).status()).toBe(200);

  await page.goto('/checkout');
  await fillCheckout(page);
  const reviewedTotal = await page.locator('.summary-row--total').textContent();

  // Another device adds one more while this page shows the old total.
  expect((await add(1)).status()).toBe(200);
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.locator('p.alert[role=alert]')).toContainText('تغيّر ملخّص طلبك');
  await expect(page.locator('.summary-row--total')).not.toHaveText(reviewedTotal ?? '');

  await expect(page.getByRole('button', { name: 'تأكيد الطلب' })).toBeEnabled();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?placed=1$/);
  await expect(page.locator('.cart-line')).toHaveCount(1);
  await expect(page.locator('.cart-line')).toContainText('× 2');
  expect(problems).toEqual([]);
});
