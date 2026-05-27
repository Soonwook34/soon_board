// Playwright e2e config — live-map plan §10 단계 15 Playwright follow-up.
// 본 config 는 /test-rig 라우트 + SyntheticDataSource 결정론적 마운트를 활용한
// smoke + visual regression + memory profile 을 chromium 단일 프로젝트로 실행한다.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
    },
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/test-rig?driverCount=1&sps=1&durationSec=10',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
