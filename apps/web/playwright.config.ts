import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config.
 *
 * F0 ships a single smoke test that boots the web app and confirms the
 * console landing renders. F3 onward layers the critical-flow tests from
 * engineering-architecture §33 (login → live well → ack alarm → historian
 * → tenant-isolation regression).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['CI']
    ? {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
