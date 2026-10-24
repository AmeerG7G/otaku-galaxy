import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { STATE_FILE, type E2eState } from './global-setup';

export function e2eState(): E2eState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2eState;
}

export async function login(page: Page, returnTo = '/') {
  const { phone, password } = e2eState();
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('رقم الهاتف').fill(phone);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول' }).click();
  await page.waitForURL((url) => url.pathname === returnTo.split('?')[0]);
}

/** Any Content-Security-Policy violation or uncaught page error fails the test. */
export function watchPageErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy|Refused to/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: page scrolls horizontally (${scrollWidth} > ${clientWidth})`).toBeLessThanOrEqual(clientWidth);
}
