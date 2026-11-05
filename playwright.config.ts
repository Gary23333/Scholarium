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
    baseURL: 'http://127.0.0.1:3460',
    headless: !process.env.PW_HEADED,
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --experimental-strip-types --no-warnings e2e/serve.ts',
    url: 'http://127.0.0.1:3460/api/health',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
