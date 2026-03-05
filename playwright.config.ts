import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: 'html',
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm run build',
    cwd: process.cwd(),
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
