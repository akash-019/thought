/**
 * File: e2e/playwright.config.ts
 *
 * Browser end-to-end tests against a running app (by default the Docker Compose stack).
 *   BASE_URL           the app                     (default http://localhost:3000)
 *   E2E_DATABASE_URL   its database, for set-up    (default the Compose database on :5433)
 *   E2E_JWT_SECRET     the API's JWT secret, to test token refresh (default: the Compose demo value)
 *   PW_CHANNEL=chrome  use the installed Chrome instead of Playwright's own Chromium
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Tests share one database and the reminder worker, so they run one file at a time.
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
});
