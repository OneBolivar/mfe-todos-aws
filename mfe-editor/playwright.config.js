import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: { browserName: 'chromium', trace: 'retain-on-failure' },
  projects: [
    { name: 'desarrollo', use: { baseURL: 'http://localhost:5174' } },
    { name: 'produccion', use: { baseURL: 'http://localhost:4174' } },
  ],
  webServer: [
    { command: 'npm run dev', url: 'http://localhost:5174', reuseExistingServer: false },
    { command: 'npm run preview -- --port 4174', url: 'http://localhost:4174', reuseExistingServer: false },
  ],
});
