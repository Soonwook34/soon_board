// live-map plan §10 단계 15 + 인수 10 (60min 라이브 운영 후 메모리 증가 < 50MB).
//
// Wall-clock 60min 측정은 Chrome Task Manager 수동 (별도 follow-up phase).
// 본 vitest 는 *deterministic invariant* 만 lock: sustained-input 시 LiveDataSource / ReplayDataSource
// 의 internal Map/Set 이 단조 누적되지 않는지 검증.
//
// 검증 포인트:
//  - LiveDataSource: locationBuffer 총 sample 합 ≤ 상한 (ring buffer trim 정상 동작)
//  - records / cursors / listeners 가 cycle 누적으로 leak 되지 않음
//  - ReplayDataSource: cache 는 의도적으로 단조 증가 (LRU 없음, plan §5.1), inflight 는 0 으로 settle

import { describe, expect, it, vi } from 'vitest';
import { LiveDataSource } from '../LiveDataSource.js';
import { ReplayDataSource } from '../ReplayDataSource.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// D1: LocationBuffer 공유 클래스로 추출됨 — totalSampleCount() / driverCount() API 사용.
interface LiveInternals {
  locationBuffer: { totalSampleCount(): number; driverCount(): number };
  records: Map<string, unknown[]>;
  cursors: Map<string, Date>;
  listeners: Set<unknown>;
}

interface ReplayInternals {
  cache: Map<string, unknown[]>;
  inflight: Map<string, Promise<void>>;
  locationBuffer: { totalSampleCount(): number; driverCount(): number };
}

describe('LiveDataSource — sustained-input 메모리 invariant (인수 10)', () => {
  it('200 cycle × 20 driver 인입 후 locationBuffer 총 sample 합 ≤ 10000 (ring buffer 작동)', async () => {
    // 각 cycle 마다 20 driver × 4 sample (3.7 Hz × 10s 의 근사) → 1 cycle = 80 samples.
    // 200 cycle 누적 inject = 16000 samples. ring buffer (60s = 6 cycle) 후 60 × 80 = 480 ≤ 10000.
    const DRIVERS = 20;
    const SAMPLES_PER_CYCLE = 4; // per driver
    const CADENCE_MS = 10_000;
    const RING_BUFFER_MS = 60_000;

    let cycle = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        const samples = [];
        for (let d = 1; d <= DRIVERS; d++) {
          for (let s = 0; s < SAMPLES_PER_CYCLE; s++) {
            const dateMs = Date.parse('2024-03-02T15:00:00.000Z') + cycle * CADENCE_MS + s * (CADENCE_MS / SAMPLES_PER_CYCLE);
            samples.push({
              driver_number: d,
              session_key: 9472,
              meeting_key: 1234,
              date: new Date(dateMs).toISOString(),
              x: 100 + d,
              y: 200 + d,
              z: 10,
            });
          }
        }
        return jsonResponse(samples);
      }
      return jsonResponse([]);
    });

    vi.useFakeTimers();
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    const startP = ds.start();
    // hydration flush
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await startP;
    cycle++; // 첫 hydration 이 cycle 0 — 다음 cadence 부터 cycle 1+

    for (let i = 0; i < 200; i++) {
      await vi.advanceTimersByTimeAsync(CADENCE_MS);
      cycle++;
    }

    const internals = ds as unknown as LiveInternals;
    const totalSamples = internals.locationBuffer.totalSampleCount();

    // ring buffer trim 작동: 60s 안의 sample 만 보존 → 20 driver × ~24 samples = ~480.
    // 안전 상한 10000 (실제는 훨씬 작음 — leak 검출 sentinel).
    expect(totalSamples).toBeLessThanOrEqual(20 * 500);
    expect(internals.locationBuffer.driverCount()).toBe(DRIVERS);

    // non-location 7 endpoint: records map 에 적재 (빈 응답 ignore 라 0 일 수도 있음).
    // 실제 데이터가 적재된 endpoint 만 records 에 들어감.
    expect(internals.records.size).toBeLessThanOrEqual(7);

    // 8 endpoint × 1 cursor = max 8. 빈 응답 endpoint 는 cursor 미설정 → location 만 1.
    expect(internals.cursors.size).toBeLessThanOrEqual(8);

    ds.stop();
    vi.useRealTimers();

    // 마지막 sample 의 date 가 ring buffer 안 — getSamplePair 동작 검증 (behavior smoke).
    const lastTime = new Date(
      Date.parse('2024-03-02T15:00:00.000Z') + cycle * CADENCE_MS,
    );
    const pair = ds.getSamplePair(1, lastTime);
    expect(pair).not.toBeNull();
    // 가장 오래된 s1 의 date 가 (newestDate - ringBufferMs) 이후
    if (pair && pair.s1) {
      const oldestAllowed = new Date(lastTime.valueOf() - RING_BUFFER_MS - CADENCE_MS);
      expect(pair.s1.date.valueOf()).toBeGreaterThanOrEqual(oldestAllowed.valueOf());
    }
  });

  it('listener subscribe → unsubscribe → resubscribe 후 listeners Set 크기 1 (누적 leak 없음)', () => {
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    const internals = ds as unknown as LiveInternals;
    const unsub1 = ds.onDisplayTimeChange(() => {});
    const unsub2 = ds.onDisplayTimeChange(() => {});
    expect(internals.listeners.size).toBe(2);
    unsub1();
    unsub2();
    expect(internals.listeners.size).toBe(0);
    // 재등록 후에도 정확히 1
    ds.onDisplayTimeChange(() => {});
    expect(internals.listeners.size).toBe(1);
  });
});

describe('ReplayDataSource — seek 누적 invariant', () => {
  it('100 seek (각 다른 윈도우) 후 cache size = seek 수 × 3 dense endpoint, inflight = 0', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([]);
    });
    const SESSION_START = new Date('2024-03-02T15:00:23.000Z');
    const ds = new ReplayDataSource({
      sessionKey: 9472,
      sessionDateStart: SESSION_START,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000,
      windowMs: 60_000,
    });
    await ds.start(); // sparse 6 + dense 1 window × 3 = 9 baseline

    const internals = ds as unknown as ReplayInternals;
    const baselineCache = internals.cache.size; // 6 sparse + 3 dense (window 0)

    // 100 seek — 매번 새 window. windowMs=60s, 첫 seek 부터 정수 배수 offset.
    for (let i = 1; i <= 100; i++) {
      const t = new Date(SESSION_START.valueOf() + i * 60_001);
      ds.setPlaybackClock(t);
      for (let j = 0; j < 5; j++) await Promise.resolve();
    }
    // 모든 inflight 가 settle 될 때까지 flush
    for (let j = 0; j < 50; j++) await Promise.resolve();

    // 각 seek 는 windowStart(t)와 windowStart(t)+windowMs 두 윈도우 prefetch 가능 (lookahead 60s).
    // 단조 증가는 의도 (plan §5.1 — LRU 없음). 상한 = baseline + 100 seek × 2 window × 3 dense = 600.
    expect(internals.cache.size).toBeGreaterThan(baselineCache);
    expect(internals.cache.size).toBeLessThanOrEqual(baselineCache + 100 * 2 * 3);
    expect(internals.inflight.size).toBe(0);
  });

  it('동일 윈도우 재seek 100회 후 cache 크기 baseline 그대로 (hit, 신규 fetch 없음)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([]);
    });
    const SESSION_START = new Date('2024-03-02T15:00:23.000Z');
    const ds = new ReplayDataSource({
      sessionKey: 9472,
      sessionDateStart: SESSION_START,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000,
      windowMs: 60_000,
    });
    await ds.start();
    const baselineCalls = fetchImpl.mock.calls.length;

    for (let i = 0; i < 100; i++) {
      ds.setPlaybackClock(SESSION_START);
      for (let j = 0; j < 3; j++) await Promise.resolve();
    }

    // 같은 윈도우 재seek 는 cache hit — 신규 fetch 0 (cadence 가 정확히 일치).
    expect(fetchImpl.mock.calls.length).toBe(baselineCalls);
  });
});
