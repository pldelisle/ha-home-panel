// End-to-end tests: the built panel in Chromium against the made-up house (test/e2e/harness.html), on a tablet and a phone.
// Run: npm run test:e2e   (one file: npm run test:e2e -- test/e2e/tabs.spec.ts)
import {defineConfig} from '@playwright/test';

const CI = !!process.env.CI;
const PORT = 4173;

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['github'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    deviceScaleFactor: 1,
    timezoneId: 'America/Toronto',
    locale: 'en-CA',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: 'node test/e2e/server.mjs',
    env: {PORT: String(PORT)},
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
  },
  projects: [
    {name: 'tablet', use: {viewport: {width: 1180, height: 820}}},
    {name: 'phone', use: {viewport: {width: 393, height: 852}}},
  ],
});
