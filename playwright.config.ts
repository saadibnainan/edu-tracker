import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    timezoneId: 'Europe/Berlin',
    locale: 'en-GB',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
