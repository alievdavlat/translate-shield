import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/specs',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://localhost:5199',
  },
  webServer: [
    {
      command: 'npm run dev -w tests/app',
      url: 'http://localhost:5199',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run recorder',
      url: 'http://localhost:5200',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
