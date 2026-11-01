import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: { baseURL: 'http://localhost:5173', acceptDownloads: true },
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60000 },
});
