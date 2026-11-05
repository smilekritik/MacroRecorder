import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './artifacts/playwright-results',
  forbidOnly: true,
  reporter: [
    ['list'],
    ['./tests/e2e/harness/mandatory-reporter.ts'],
    ['html', { outputFolder: './artifacts/playwright-report', open: 'never' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'simulated',
      testIgnore: ['**/packaged/**'],
    },
    {
      name: 'packaged',
      testMatch: ['**/packaged/**/*.spec.ts'],
    },
  ],
});
