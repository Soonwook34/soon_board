// src/map/LiveDataSource.ts — plan §10 단계 12 + critic P0-4/P0-5 회귀.
//
// 검증 범위:
//  - constructor 가 네트워크 활동 없음
//  - cadence 합계 26 req/min (live-streaming §3.1)
//  - CORS gate (P0-4) — onCorsFailed + cadence 미등록
//  - hydration→cadence 직렬 (P0-5) — fake timer
//  - hydration token-bucket 333ms 간격
//  - date>=cursor 진행
//  - location buffer + sentinel filter + getSamplePair semantics
//  - ring buffer trim (60s)
//  - display_time anchor 모델
//  - getStreamState 전이 (buffering → live → lagging → stalled)
//  - stop() 정리

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIVE_CADENCE, LiveDataSource } from '../LiveDataSource.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function locationRecord(driver: number, dateIso: string, x: number, y: number, z = 0) {
  return { driver_number: driver, session_key: 9472, meeting_key: 1234, date: dateIso, x, y, z };
}

describe('LIVE_CADENCE 합계 검증 (live-streaming §3.1)', () => {
  it('8개 endpoint 합계가 26 req/min (location 6 + position 6 + intervals 4 + race_control 4 + laps 2 + pit 2 + stints 1 + weather 1)', () => {
    const totalPerMin = LIVE_CADENCE.reduce(
      (sum, c) => sum + 60_000 / c.intervalMs,
      0,
    );
    expect(totalPerMin).toBe(26);
  });

  it('우선순위: location 이 첫번째', () => {
    expect(LIVE_CADENCE[0].endpoint).toBe('location');
  });
});

describe('LiveDataSource — constructor 비활성', () => {
  it('생성만으로 fetch 호출 없음', () => {
    const fetchImpl = vi.fn();
    new LiveDataSource({ sessionKey: 9472, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('start() 전 getDisplayTime() 은 epoch (0)', () => {
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(ds.getDisplayTime().valueOf()).toBe(0);
  });

  it('start() 전 getStreamState() 은 "buffering"', () => {
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(ds.getStreamState()).toBe('buffering');
  });
});

describe('LiveDataSource — CORS gate (critic P0-4)', () => {
  it('corsAvailable=false 시 onCorsFailed 발화 + cadence 미등록 (fetchImpl 호출 0)', async () => {
    const fetchImpl = vi.fn();
    const onCorsFailed = vi.fn();
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      corsAvailable: false,
      onCorsFailed,
    });
    await ds.start();
    expect(onCorsFailed).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('corsAvailable 미지정 (default) 시 정상 hydration 진행', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const onCorsFailed = vi.fn();
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onCorsFailed,
      hydrationTokenIntervalMs: 0, // 테스트 가속
      sleep: async () => {},
    });
    await ds.start();
    expect(onCorsFailed).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(8); // 8개 hydration
    ds.stop();
  });
});

describe('LiveDataSource — hydration → cadence 직렬 (critic P0-5)', () => {
  it('hydration pending 중 fake timer 60s advance → cadence fetch 0회. resolve 후 cadence 정상 발사', async () => {
    vi.useFakeTimers();
    let resolveHydration: (() => void) | null = null;
    const hydrationGate = new Promise<void>((r) => {
      resolveHydration = r;
    });
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push(url);
      await hydrationGate; // hydration 모든 호출이 여기서 멈춤
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    const startP = ds.start();
    // hydration 은 8회 fire 사이에 await sleep(0) 7번 + fetch await 8번 — microtask 큐를 충분히 flush.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    // hydration 8건이 모두 fire 됐지만 모두 pending — cadence interval 미등록 상태.
    expect(fetchImpl).toHaveBeenCalledTimes(8);

    // 60s advance — cadence 가 등록됐다면 location 6 + position 6 + … = 26 호출이 추가됐을 것.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl).toHaveBeenCalledTimes(8); // 여전히 8 (cadence 미등록 증거)

    // hydration resolve → cadence 등록.
    resolveHydration!();
    await startP;

    // 10s advance — location + position cadence 1회씩 (10s interval) 추가 발생.
    await vi.advanceTimersByTimeAsync(10_000);
    const locationCalls = fetchImpl.mock.calls.filter((c) =>
      String(c[0]).includes('/v1/location'),
    );
    expect(locationCalls.length).toBeGreaterThanOrEqual(2); // 1 hydration + ≥1 cadence
    ds.stop();
    vi.useRealTimers();
  });
});

describe('LiveDataSource — hydration token-bucket 간격', () => {
  it('hydration 8 endpoint 사이에 sleep(333) 7회 호출', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 333,
      sleep,
    });
    await ds.start();
    // 7번 (8개 사이 간격 = 7)
    expect(sleep).toHaveBeenCalledTimes(7);
    expect(sleep).toHaveBeenCalledWith(333);
    ds.stop();
  });
});

describe('LiveDataSource — cursor 진행 (date>=)', () => {
  it('첫 cadence 는 cursor 없음, 두 번째 cadence URL 에 date> 가 포함됨', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        // hydration / first cadence — 1건 sample 반환.
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:10.000Z', 100, 100, 5)]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    // location cadence fire (10s)
    await vi.advanceTimersByTimeAsync(10_000);
    const locationCalls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/v1/location'));
    expect(locationCalls.length).toBeGreaterThanOrEqual(2);
    const secondCadence = locationCalls[locationCalls.length - 1];
    // OpenF1 query convention (operator-suffix key, not URL-encoded — openf1Client.ts 와 동일).
    expect(secondCadence).toContain('date>');
    expect(secondCadence).toContain('2024-03-02T15%3A00%3A10');
    ds.stop();
    vi.useRealTimers();
  });
});

describe('LiveDataSource — location buffer + sentinel', () => {
  it('sentinel (|x|+|y|+|z| < 50) sample 은 buffer 에 적재 안 됨', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([
          locationRecord(44, '2024-03-02T15:00:00.000Z', 5, 5, 5), // |x|+|y|+|z|=15 < 50 sentinel
        ]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    expect(ds.getSamplePair(44, new Date('2024-03-02T15:00:00.000Z'))).toBeNull();
    ds.stop();
  });

  it('일반 sample 2건 적재 후 getSamplePair 는 path-arc 모드에 적합한 쌍 반환', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([
          locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200, 10),
          locationRecord(44, '2024-03-02T15:00:01.000Z', 120, 210, 10),
        ]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    const t = new Date('2024-03-02T15:00:00.500Z');
    const pair = ds.getSamplePair(44, t);
    expect(pair).not.toBeNull();
    if (pair && pair.s2) {
      expect(pair.s1.date.toISOString()).toBe('2024-03-02T15:00:00.000Z');
      expect(pair.s2.date.toISOString()).toBe('2024-03-02T15:00:01.000Z');
      expect(pair.s1.x).toBe(100);
      expect(pair.s2.y).toBe(210);
    } else {
      throw new Error('expected s1+s2 pair');
    }
    ds.stop();
  });

  it('단일 sample 후 getSamplePair → s2 null (freeze)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200, 10)]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    const pair = ds.getSamplePair(44, new Date('2024-03-02T15:00:00.500Z'));
    expect(pair).toEqual({
      s1: { date: new Date('2024-03-02T15:00:00.000Z'), x: 100, y: 200, z: 10 },
      s2: null,
    });
    ds.stop();
  });
});

describe('LiveDataSource — display_time anchor 모델', () => {
  it('newestDate 수신 후 displayTime ≈ newestDate − 30s (anchorWall 직후)', async () => {
    const wallNow = new Date('2024-03-02T15:00:30.000Z');
    let currentWall = wallNow;
    const now = vi.fn(() => currentWall);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:25.000Z', 100, 200, 10)]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    // anchorDisplay = 15:00:25 − 30s = 14:59:55. wall drift = 0.
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T14:59:55.000Z');

    // 5초 wall 진행 — displayTime 도 5s 전진.
    currentWall = new Date('2024-03-02T15:00:35.000Z');
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T15:00:00.000Z');
    ds.stop();
  });
});

describe('LiveDataSource — getStreamState 전이', () => {
  it('hydration 완료 직후 = live', async () => {
    const wallNow = new Date('2024-03-02T15:00:30.000Z');
    let currentWall = wallNow;
    const now = () => currentWall;
    const fetchImpl = vi.fn(async () =>
      jsonResponse([locationRecord(44, '2024-03-02T15:00:25.000Z', 100, 200, 10)]),
    );
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    expect(ds.getStreamState()).toBe('live');

    // 2s 후 → lagging (>1.5s)
    currentWall = new Date(wallNow.valueOf() + 2_000);
    expect(ds.getStreamState()).toBe('lagging');

    // 6s 후 → stalled (>5s)
    currentWall = new Date(wallNow.valueOf() + 6_000);
    expect(ds.getStreamState()).toBe('stalled');
    ds.stop();
  });
});

describe('LiveDataSource — onDisplayTimeChange', () => {
  it('location 수신 시 listener 호출됨', async () => {
    const listener = vi.fn();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:25.000Z', 100, 200, 10)]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    const unsubscribe = ds.onDisplayTimeChange(listener);
    await ds.start();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    // unsubscribe 후 — 더 이상 호출 없음 (다른 endpoint 응답에서도)
    ds.stop();
  });
});

describe('LiveDataSource — onSample callback (UI bridge hook)', () => {
  it('sentinel 제외 모든 sample 마다 onSample 호출 (driver_number + LocationSample shape)', async () => {
    const calls: Array<{ driver: number; sample: { date: Date; x: number; y: number; z: number } }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([
          locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200, 10),
          locationRecord(44, '2024-03-02T15:00:00.100Z', 5, 5, 5), // sentinel |x|+|y|+|z|=15 < 50
          locationRecord(11, '2024-03-02T15:00:00.200Z', 300, 400, 20),
        ]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
      onSample: (driver, sample) => calls.push({ driver, sample }),
    });
    await ds.start();
    // sentinel 제외 2 sample → onSample 2회
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({
      driver: 44,
      sample: { date: new Date('2024-03-02T15:00:00.000Z'), x: 100, y: 200, z: 10 },
    });
    expect(calls[1]).toEqual({
      driver: 11,
      sample: { date: new Date('2024-03-02T15:00:00.200Z'), x: 300, y: 400, z: 20 },
    });
    ds.stop();
  });

  it('onSample 미지정 시 정상 동작 (옵션, 회귀)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200)]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    // 옵션 미지정에도 sample 정상 적재
    const pair = ds.getSamplePair(44, new Date('2024-03-02T15:00:00.000Z'));
    expect(pair?.s1.x).toBe(100);
    ds.stop();
  });
});

describe('LiveDataSource — ring buffer trim (60s)', () => {
  it('newestDate − 60s 이전 sample 자동 폐기', async () => {
    let firstCall = true;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        if (firstCall) {
          firstCall = false;
          // 오래된 sample + 새로운 sample 같은 응답
          return jsonResponse([
            locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200, 10),
            locationRecord(44, '2024-03-02T15:02:00.000Z', 150, 250, 10), // newestDate
          ]);
        }
        return jsonResponse([]);
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    // newestDate = 15:02:00. cutoff = 15:01:00. 15:00:00 sample 폐기 → 단일 sample 만 남음.
    const pair = ds.getSamplePair(44, new Date('2024-03-02T15:02:00.000Z'));
    expect(pair).toEqual({
      s1: { date: new Date('2024-03-02T15:02:00.000Z'), x: 150, y: 250, z: 10 },
      s2: null,
    });
    ds.stop();
  });
});

describe('LiveDataSource — stop()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stop() 후 cadence interval 정지 (advance 해도 추가 fetch 없음)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
    });
    await ds.start();
    const baseline = fetchImpl.mock.calls.length;
    ds.stop();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchImpl.mock.calls.length).toBe(baseline);
  });
});
