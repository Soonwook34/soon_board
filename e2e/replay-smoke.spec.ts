// Step 8 real-endpoint browser smoke — plan openf1-client.md Step 8 (AC18 + AC19).
// 다른 e2e (smoke/visual/memory) 와 달리 /test-rig SyntheticDataSource 가 아니라 실제 /replay/:key
// 를 live api.openf1.org 에 붙여 검증한다. 실 네트워크 의존이라 @realnet 태그로 e2e:ci 에서 제외하고
// (deterministic 유지), `npm run e2e:smoke` 로만 on-demand 실행한다.
//
// 검증 범위 (deterministic client-invariant 만 hard-assert):
//   실측 결과 live OpenF1 는 3 req/s 로 올바르게 분산된 호출에도 간헐적 429 를 반환하고(서버측 변동),
//   sparse 한 dense window 는 404 {"detail":"No results found."} 로 응답한다. 따라서 "literal 0 429"
//   는 신뢰할 수 있는 assertion 이 아니다. 대신 client 가 보장하는 결정론적 불변식만 hard-assert 하고,
//   서버측 429 는 정보로만 기록한다(사용자 결정 2026-06-01):
//     AC19 no-burst — 임의 1000ms 윈도우 내 OpenF1 요청 ≤ bound (token bucket rate 3, capacity 1).
//                     §0 의 burst(진입 시 8~15 동시 요청)가 사라졌음을 client-side 결정론으로 증명.
//     AC18 dedup    — 동일 canonical OpenF1 URL 이 150ms 내 중복 발사되지 않음 (StrictMode 이중 mount
//                     → in-flight dedup → 단일 네트워크 요청).
//     app-functional — console error / pageerror 0 (429/404 는 client warn + graceful empty-window 처리,
//                     error path 미진입 → 화면 유지).
//   429/404 count 는 informational log 로만 출력(서버 mood 의존이라 assert 하지 않음). burst 회귀는
//   maxPerSec bound 가 server 와 무관하게 이미 잡는다.

import { expect, test, type Page } from '@playwright/test';

const PAST_KEY = 9644; // Las Vegas 2024 — past, public/seasons/2024.json 에 존재, circuit_key 152 trackOutline 보유
const SECOND_KEY = 9655; // Qatar 2024 — back→다른 세션 재진입 leg (plan line 358)
const OPENF1 = 'api.openf1.org';
const MAX_PER_SEC_BOUND = 8; // token bucket(rate 3) → 실측 3. 8 은 unthrottled burst(10~30)와 명확히 분리되는 여유.
const DEDUP_WINDOW_MS = 150;
const BURST_WINDOW_MS = 10_000;
const SECOND_WINDOW_MS = 5_000;

interface Req {
  url: string;
  t: number;
}

test('@realnet /replay real-endpoint smoke: no burst + dedup + app functional', async ({
  page,
}) => {
  test.setTimeout(180_000); // mount-retry(ping 429 대비) × 2 leg + observation window 여유.

  const t0 = Date.now();
  const requests: Req[] = [];
  const status429: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location().url;
    // 브라우저는 실패한 네트워크 요청을 'Failed to load resource' console error 로 자동 기록한다.
    // OpenF1 의 404(empty window)/429(rate limit) 는 app error 가 아니라 informational 로 합의된
    // 서버측 거동이므로 제외. 그 외(실 JS error, 비-OpenF1 리소스 실패)만 app error 로 수집.
    if (msg.text().includes('Failed to load resource') && url.includes(OPENF1)) return;
    consoleErrors.push(`${msg.text()} @ ${url}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('request', (req) => {
    if (req.url().includes(OPENF1)) requests.push({ url: req.url(), t: Date.now() - t0 });
  });
  page.on('response', (res) => {
    if (res.url().includes(OPENF1) && res.status() === 429) status429.push(res.url());
  });

  // Leg 1 — /replay/9644, burst-prone first window 관찰.
  // live OpenF1 가 ping 을 강하게 rate-limit 해 화면이 아예 mount 안 되면 측정 불가 → skip(inconclusive).
  // (memory.spec.ts 의 'measure 불가 시 skip' 패턴과 동일. 실패가 아니라 환경 가용성 문제.)
  const mounted = await gotoReplay(page, PAST_KEY);
  test.skip(!mounted, 'live OpenF1 rate-limited the ping; replay screen did not mount — smoke inconclusive');
  await page.waitForTimeout(BURST_WINDOW_MS);

  // Leg 2 — 다른 세션 재진입 (plan line 358). best-effort: mount 실패해도 leg 1 측정으로 충분.
  if (await gotoReplay(page, SECOND_KEY)) await page.waitForTimeout(SECOND_WINDOW_MS);

  const maxPerSec = maxRequestsPerSecond(requests);
  const concurrentDupes = findConcurrentDuplicates(requests, DEDUP_WINDOW_MS);

  // 서버측 거동은 정보로만 — assert 하지 않음 (사용자 결정).
  console.log(
    `[replay-smoke] openf1 req=${requests.length} 429=${status429.length} ` +
      `maxPerSec=${maxPerSec} concurrentDupes=${concurrentDupes.length} consoleErrors=${consoleErrors.length}`,
  );

  // sanity — client 가 실제로 OpenF1 호출을 했어야 smoke 가 의미를 가진다.
  expect(requests.length, 'expected OpenF1 requests via the client').toBeGreaterThan(0);

  // AC19 no-burst (deterministic, client-side).
  expect(maxPerSec, `maxPerSec=${maxPerSec} (token bucket throttle broken?)`).toBeLessThanOrEqual(
    MAX_PER_SEC_BOUND,
  );

  // AC18 dedup (deterministic, client-side).
  expect(concurrentDupes, `concurrent dup URLs: ${JSON.stringify(concurrentDupes)}`).toEqual([]);

  // app-functional — 429/404 가 error path 를 트리거하지 않고 graceful 하게 흡수됨.
  expect(consoleErrors, `console errors: ${consoleErrors.join('\n')}`).toEqual([]);
});

/**
 * /replay/:key 진입 후 replay-screen mount 대기. ping 429 로 mount 실패 시 full reload 재시도.
 * 재시도 사이에 cooldown 을 둬 OpenF1 rate window 가 회복되게 한다. mount 성공 여부를 반환(throw 안 함).
 */
async function gotoReplay(page: Page, key: number): Promise<boolean> {
  const attempts = 4;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    await page.goto(`/replay/${key}`);
    try {
      await expect(page.locator('[data-testid="replay-screen"]')).toBeVisible({ timeout: 10_000 });
      return true;
    } catch {
      if (attempt < attempts) await page.waitForTimeout(3_000); // rate window cooldown
    }
  }
  return false;
}

// 동일 URL 이 windowMs 내에 두 번 이상 발사된 케이스 (in-flight dedup 이 막아야 하는 burst).
// leg 간 동일 endpoint 재fetch 는 안전 — 두 leg 는 BURST_WINDOW_MS(10s) 이상 떨어져 있어 windowMs(150ms)
// 를 넘는다 (게다가 session_key 가 달라 URL 자체가 다름).
function findConcurrentDuplicates(reqs: Req[], windowMs: number): Req[] {
  const byUrl = new Map<string, number[]>();
  const dupes: Req[] = [];
  for (const req of reqs) {
    const times = byUrl.get(req.url) ?? [];
    if (times.some((prev) => req.t - prev < windowMs)) dupes.push(req);
    times.push(req.t);
    byUrl.set(req.url, times);
  }
  return dupes;
}

/** 임의 1000ms sliding window 안의 최대 요청 수. */
function maxRequestsPerSecond(reqs: Req[]): number {
  let max = 0;
  for (const anchor of reqs) {
    const count = reqs.filter((h) => h.t >= anchor.t && h.t < anchor.t + 1000).length;
    if (count > max) max = count;
  }
  return max;
}
