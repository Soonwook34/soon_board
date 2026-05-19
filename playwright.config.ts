import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  baseURL: 'http://localhost:5173',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-ipad',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 1024, height: 768 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
  },
})
