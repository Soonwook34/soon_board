import { expect, test } from '@playwright/test';

test('test-rig canvas frame matches baseline (deterministic synthetic)', async ({ page }) => {
  await page.goto('/test-rig?driverCount=5&sps=4&durationSec=30');
  await expect(page.locator('[data-testid="live-map-canvas"]')).toBeVisible({ timeout: 5000 });
  // Allow renderer + first samples to settle.
  await page.waitForTimeout(1000);
  // Baseline auto-generated on first run; subsequent runs validate the diff.
  await expect(page.locator('[data-testid="live-map-canvas"]')).toHaveScreenshot(
    'test-rig-frame.png',
    { maxDiffPixelRatio: 0.05 },
  );
});
