import { defineConfig } from '@playwright/test';

const baseURL = 'http://localhost:5175';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.js',
  use: { baseURL, channel: process.env.VIEWER_BROWSER_CHANNEL, trace: 'retain-on-failure' },
  webServer: { command: 'npm run build && npm run preview', url: baseURL, reuseExistingServer: false },
});
