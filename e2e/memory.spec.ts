// LiveMap 60min 사용 시 메모리 leak 부재 검증.
// CI: 10min real-time + 선형 회귀로 leak 외삽. local-only: 60min @long tag.
// 헬퍼 동일 — 차이는 durationMs + tag 만.

import { expect, test, type Page } from '@playwright/test';

interface Sample {
  tSec: number;
  usedJSHeap: number;
}

interface PerformanceMemory {
  usedJSHeapSize: number;
}

const WARMUP_MS = 60_000;
const SAMPLE_INTERVAL_MS = 30_000;
const LEAK_SLOPE_BYTES_PER_SEC = 1024; // 1 KB/sec → 60min 으로 외삽 시 ~3.5 MB
const ABSOLUTE_PEAK_BYTES = 200 * 1024 * 1024; // 200 MB

async function runMemoryProfile(page: Page, durationMs: number): Promise<void> {
  await page.goto('/test-rig?driverCount=20&sps=10&durationSec=' + Math.ceil(durationMs / 1000));
  await expect(page.locator('[data-testid="live-map-canvas"]')).toBeVisible({ timeout: 10_000 });

  const samples: Sample[] = [];
  const sampleCount = Math.floor(durationMs / SAMPLE_INTERVAL_MS);
  for (let i = 1; i <= sampleCount; i++) {
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
    const used = await page.evaluate(() => {
      const mem = (performance as unknown as { memory?: PerformanceMemory }).memory;
      return mem?.usedJSHeapSize ?? 0;
    });
    samples.push({ tSec: (i * SAMPLE_INTERVAL_MS) / 1000, usedJSHeap: used });
  }

  // performance.memory 가 0 만 반환하면 (non-Chromium 또는 권한 부족) skip.
  if (samples.every((s) => s.usedJSHeap === 0)) {
    test.skip(true, 'performance.memory unavailable — skipping leak slope assertion');
  }

  // Warm-up 제거.
  const postWarm = samples.filter((s) => s.tSec * 1000 >= WARMUP_MS);
  expect(
    postWarm.length,
    `need ≥3 post-warmup samples; got ${postWarm.length} of ${samples.length}`,
  ).toBeGreaterThanOrEqual(3);

  const slope = linearRegressionSlope(postWarm);
  const peak = Math.max(...samples.map((s) => s.usedJSHeap));
  console.log(
    `[memory profile] samples=${samples.length} peak=${(peak / 1024 / 1024).toFixed(1)}MB slope=${slope.toFixed(1)}B/sec`,
  );

  expect(
    slope,
    `leak slope ${slope.toFixed(1)} B/sec > threshold ${LEAK_SLOPE_BYTES_PER_SEC}`,
  ).toBeLessThan(LEAK_SLOPE_BYTES_PER_SEC);
  expect(
    peak,
    `peak heap ${(peak / 1024 / 1024).toFixed(1)} MB > ${ABSOLUTE_PEAK_BYTES / 1024 / 1024} MB`,
  ).toBeLessThan(ABSOLUTE_PEAK_BYTES);
}

function linearRegressionSlope(samples: Sample[]): number {
  const n = samples.length;
  const meanX = samples.reduce((s, p) => s + p.tSec, 0) / n;
  const meanY = samples.reduce((s, p) => s + p.usedJSHeap, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of samples) {
    num += (s.tSec - meanX) * (s.usedJSHeap - meanY);
    den += (s.tSec - meanX) * (s.tSec - meanX);
  }
  return den === 0 ? 0 : num / den;
}

const TEN_MIN_MS = 10 * 60 * 1000;
const SIXTY_MIN_MS = 60 * 60 * 1000;

test('10min memory profile (CI)', async ({ page }) => {
  test.setTimeout(TEN_MIN_MS + 120_000);
  await runMemoryProfile(page, TEN_MIN_MS);
});

test('60min memory profile (local @long)', { tag: '@long' }, async ({ page }) => {
  test.setTimeout(SIXTY_MIN_MS + 300_000);
  await runMemoryProfile(page, SIXTY_MIN_MS);
});
