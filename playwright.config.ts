// End-to-end tests: the built panel in Chromium against the made-up house (test/e2e/harness.html), on a tablet and a phone.
// Run: npm run test:e2e   (one file: npm run test:e2e -- test/e2e/tabs.spec.ts)
import {defineConfig} from '@playwright/test';
import {VIEWPORTS} from './test/e2e/houses';

const CI = !!process.env.CI;
// parallel worktrees each set their own E2E_PORT, so one run never reuses another's server
const PORT = Number(process.env.E2E_PORT ?? 4173);

export default defineConfig({
  testDir: 'test/e2e',
  testMatch: '**/*.spec.ts',
  // one set of baselines for everyone: no platform or browser in the name, because they are recorded in the Playwright image (Docker or `container`) only
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  expect: {toHaveScreenshot: {threshold: 0, maxDiffPixels: 0, animations: 'disabled', caret: 'hide'}},
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
    {name: 'tablet', testIgnore: '**/visual/**', use: {viewport: VIEWPORTS.tablet}},
    {name: 'phone', testIgnore: '**/visual/**', use: {viewport: VIEWPORTS.phone}},
    // the specs under visual/ set their own viewport per describe (the baseline names carry it); no retries, so a flaky frame shows
    {name: 'visual', testMatch: '**/visual/*.spec.ts', retries: 0, timeout: 120_000, use: {viewport: VIEWPORTS.tablet}},
  ],
});
