import { expect, test } from '@playwright/test';

test('test-rig route mounts LiveMap canvas and console stays clean', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto('/test-rig?driverCount=3&sps=2&durationSec=30');
  const canvas = page.locator('[data-testid="live-map-canvas"]');
  await expect(canvas).toBeVisible({ timeout: 5000 });

  const dims = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return { width: c.width, height: c.height };
  });
  expect(dims.width).toBeGreaterThan(0);
  expect(dims.height).toBeGreaterThan(0);

  // Let RAF run a few frames to surface render-path errors.
  await page.waitForTimeout(500);
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
