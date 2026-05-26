// src/map/ReplayDataSource.ts — plan §10 단계 13 단위 검증.
//
// 범위:
//  - DataSource 4 메서드 + 6 stub
//  - window grid snap (session.date_start 기준)
//  - 반-개구간 [T, T+W) URL 검증
//  - WindowCache 적중 (재호출 0 fetch)
//  - in-flight dedup
//  - playback clock + speed + lookahead prefetch
//  - seek (cache miss / hit)
//  - sparse vs dense endpoint 분리
//  - location buffer + sentinel + getSamplePair

import { describe, expect, it, vi } from 'vitest';
import {
  DENSE_ENDPOINTS,
  ReplayDataSource,
  SPARSE_ENDPOINTS,
} from '../ReplayDataSource.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function locationRecord(driver: number, dateIso: string, x: number, y: number, z = 0) {
  return { driver_number: driver, session_key: 9472, meeting_key: 1234, date: dateIso, x, y, z };
}

const SESSION_KEY = 9472;
const SESSION_START = new Date('2024-03-02T15:00:23.000Z');

function makeDs(overrides: {
  fetchImpl?: typeof fetch;
  windowMs?: number;
  lookaheadBaseMs?: number;
} = {}) {
  return new ReplayDataSource({
    sessionKey: SESSION_KEY,
    sessionDateStart: SESSION_START,
    fetchImpl: overrides.fetchImpl,
    windowMs: overrides.windowMs,
    lookaheadBaseMs: overrides.lookaheadBaseMs,
  });
}

describe('ReplayDataSource — endpoint 분류 상수', () => {
  it('SPARSE_ENDPOINTS 6개 (laps, weather, race_control, pit, stints, session_result)', () => {
    expect(SPARSE_ENDPOINTS).toEqual([
      'laps',
      'weather',
      'race_control',
      'pit',
      'stints',
      'session_result',
    ]);
  });

  it('DENSE_ENDPOINTS 3개 (location, position, intervals)', () => {
    expect(DENSE_ENDPOINTS).toEqual(['location', 'position', 'intervals']);
  });
});

describe('ReplayDataSource — window grid snap (replay-strategy §3.3)', () => {
  it('session_start=15:00:23 → 윈도우 경계 15:00:23, 15:01:23, 15:02:23, …', () => {
    const ds = makeDs();
    expect(ds.windowStartFor(new Date('2024-03-02T15:00:30.000Z')).toISOString()).toBe(
      '2024-03-02T15:00:23.000Z',
    );
    expect(ds.windowStartFor(new Date('2024-03-02T15:01:22.999Z')).toISOString()).toBe(
      '2024-03-02T15:00:23.000Z',
    );
    expect(ds.windowStartFor(new Date('2024-03-02T15:01:23.000Z')).toISOString()).toBe(
      '2024-03-02T15:01:23.000Z',
    );
  });

  it('session_start 이전 시각도 정확히 snap (음수 offset)', () => {
    const ds = makeDs();
    // 15:00:00 < session_start 15:00:23 → offset = -23000ms → bucket = floor(-23000/60000) = -1 → window = start − 60s = 14:59:23
    expect(ds.windowStartFor(new Date('2024-03-02T15:00:00.000Z')).toISOString()).toBe(
      '2024-03-02T14:59:23.000Z',
    );
  });
});

describe('ReplayDataSource — fetch URL 패턴', () => {
  it('sparse endpoint 는 session_key 만 (date 필터 없음)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([]);
    });
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    const sparseUrls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => SPARSE_ENDPOINTS.some((e) => u.includes(`/v1/${e}?`)));
    expect(sparseUrls.length).toBeGreaterThanOrEqual(6);
    for (const u of sparseUrls) {
      expect(u).toContain(`session_key=${SESSION_KEY}`);
      expect(u).not.toContain('date>=');
      expect(u).not.toContain('date<');
    }
  });

  it('dense endpoint 는 반-개구간 [T, T+W) — date>= 와 date< (date<= 아님)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([]);
    });
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    const locationUrls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/v1/location?'));
    expect(locationUrls.length).toBeGreaterThan(0);
    for (const u of locationUrls) {
      expect(u).toContain('date>=');
      expect(u).toContain('date<');
      expect(u).not.toContain('date<='); // 우-열림 검증
    }
  });

  it('첫 dense window URL 의 date>= 는 session.date_start 와 일치 (playback_clock 시작점)', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      void input;
      return jsonResponse([]);
    });
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    const locationUrls = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/v1/location?'));
    // 첫 윈도우 = sessionStart, snap 그리드라 정확히 session.date_start.
    expect(locationUrls[0]).toContain(encodeURIComponent('2024-03-02T15:00:23.000Z'));
  });
});

describe('ReplayDataSource — WindowCache (replay-strategy §5.1)', () => {
  it('같은 윈도우 두 번째 요청 시 fetch 0회 (cache hit)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000, // 1 window only
    });
    await ds.start();
    const baseline = fetchImpl.mock.calls.length;
    // 같은 위치 재seek → 캐시 적중 → fetch 0회 증가.
    ds.setPlaybackClock(SESSION_START);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchImpl.mock.calls.length).toBe(baseline);
  });

  it('새 윈도우 seek 시 cache miss → 필요한 dense window 만큼 fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000,
    });
    await ds.start();
    const baseline = fetchImpl.mock.calls.length;
    // 15:30:00 (window [15:29:23, 15:30:23) 안) + 60s lookahead → window 2개 cover 필요.
    ds.setPlaybackClock(new Date('2024-03-02T15:30:00.000Z'));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // 2 새 windows × 3 dense endpoint = 6 신규 fetch.
    expect(fetchImpl.mock.calls.length).toBe(baseline + 6);
  });
});

describe('ReplayDataSource — in-flight dedup (replay-strategy §5.2)', () => {
  it('동시 setPlaybackClock 으로 같은 uncached window 호출해도 endpoint 당 fetch 1회', async () => {
    // pending 상태에서 sparse + dense 가 모두 멈춰 있는 동안 같은 윈도우 추가 요청 → dedup.
    const resolvers: Array<() => void> = [];
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolvers.push(() => r(jsonResponse([])));
        }),
    );
    const ds = makeDs({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000,
    });
    const startP = ds.start();
    // start 가 모든 fetch 를 fire 한 직후 (resolver pending) 같은 윈도우 재seek.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    ds.setPlaybackClock(SESSION_START);
    ds.setPlaybackClock(SESSION_START);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // sparse 6 + dense 3 (1 window) = 9. 추가 setPlaybackClock 은 같은 cache_key 라 inflight 합쳐 0 신규.
    expect(fetchImpl).toHaveBeenCalledTimes(9);
    for (const r of resolvers) r();
    await startP;
  });
});

describe('ReplayDataSource — playback clock + speed', () => {
  it('getDisplayTime 은 setPlaybackClock 으로 변경됨', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    expect(ds.getDisplayTime().valueOf()).toBe(SESSION_START.valueOf());
    const newT = new Date('2024-03-02T15:30:00.000Z');
    ds.setPlaybackClock(newT);
    expect(ds.getDisplayTime().valueOf()).toBe(newT.valueOf());
  });

  it('onDisplayTimeChange listener 가 setPlaybackClock 시 호출됨', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    const listener = vi.fn();
    const unsub = ds.onDisplayTimeChange(listener);
    const newT = new Date('2024-03-02T15:10:00.000Z');
    ds.setPlaybackClock(newT);
    expect(listener).toHaveBeenCalledWith(newT);
    unsub();
    ds.setPlaybackClock(new Date('2024-03-02T15:11:00.000Z'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setSpeed(4) → lookahead 240s = 4 windows prefetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      lookaheadBaseMs: 60_000,
    });
    await ds.start();
    const sparseCount = SPARSE_ENDPOINTS.length;
    const oneWindowDense = DENSE_ENDPOINTS.length; // 3
    expect(fetchImpl.mock.calls.length).toBe(sparseCount + oneWindowDense);

    ds.setSpeed(4);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // lookahead = 240s = 4 windows × 3 dense = 12. 첫 윈도우 1개는 캐시됨 → 3 windows × 3 = 9 신규.
    expect(fetchImpl.mock.calls.length).toBe(sparseCount + 3 + 9);
  });

  it('setSpeed(0) 거부 (throws)', () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(() => ds.setSpeed(0)).toThrow();
    expect(() => ds.setSpeed(-1)).toThrow();
  });
});

describe('ReplayDataSource — location buffer + sentinel', () => {
  it('sentinel (|x|+|y|+|z| < 50) sample 은 buffer 적재 안 됨', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:25.000Z', 5, 5, 5)]);
      }
      return jsonResponse([]);
    });
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    expect(ds.getSamplePair(44, new Date('2024-03-02T15:00:25.000Z'))).toBeNull();
  });

  it('일반 sample 2건 → getSamplePair 가 둘러싼 쌍 반환', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        return jsonResponse([
          locationRecord(44, '2024-03-02T15:00:30.000Z', 100, 200, 10),
          locationRecord(44, '2024-03-02T15:00:31.000Z', 120, 210, 10),
        ]);
      }
      return jsonResponse([]);
    });
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await ds.start();
    const pair = ds.getSamplePair(44, new Date('2024-03-02T15:00:30.500Z'));
    expect(pair).not.toBeNull();
    if (pair && pair.s2) {
      expect(pair.s1.x).toBe(100);
      expect(pair.s2.x).toBe(120);
    } else {
      throw new Error('expected s1+s2');
    }
  });
});

describe('ReplayDataSource — getStreamState', () => {
  it('생성 후 = "buffering", start 후 = "live"', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ds.getStreamState()).toBe('buffering');
    await ds.start();
    expect(ds.getStreamState()).toBe('live');
  });
});

describe('ReplayDataSource — dashboard stub', () => {
  it('dashboard 메서드 6종 모두 throw (Synthetic 동등)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([]));
    const ds = makeDs({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const t = new Date('2024-03-02T15:00:00.000Z');
    expect(() => ds.getLatestBefore('laps', t)).toThrow();
    expect(() => ds.getAllBefore('laps', t)).toThrow();
    expect(() => ds.getLapAt(44, t)).toThrow();
    expect(() => ds.getCompletedLapsBefore(44, t)).toThrow();
    expect(() => ds.getStintForLap(44, 1)).toThrow();
    expect(() => ds.getAggregateBefore('fastest_lap', t)).toThrow();
  });
});
