import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3460',
    headless: false,
    channel: 'chrome',
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node --experimental-strip-types --no-warnings e2e/serve.ts',
    url: 'http://localhost:3460/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
