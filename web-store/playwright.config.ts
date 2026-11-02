import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks against a running storefront (`npm run start`) that talks
 * to a real local API seeded with development data. Nothing here touches a
 * staging or production system.
 *
 * WEB_BASE_URL defaults to the local production build. The Chromium bundled in
 * this environment is used directly; no browser download happens.
 *
 * `global-setup.ts` creates a fresh customer through the API's real
 * registration → admin approval path, so it needs E2E_API_URL plus the local
 * dev seed's admin credentials (SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD).
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000',
    locale: 'ar-IQ',
    trace: 'off',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
