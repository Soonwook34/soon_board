// src/map/ReplayDataSource.ts — plan §10 단계 13 단위 검증.
// + openf1-client.md Step 5: fetch 디테일을 OpenF1Client 에 위임 (client mock 으로 테스트).
//
// 범위:
//  - DataSource 4 메서드 + 6 stub
//  - window grid snap (session.date_start 기준)
//  - 반-개구간 [T, T+W) URL 검증
//  - WindowCache 적중 (재호출 0 fetch)
//  - in-flight dedup (window-level — client dedup 과 별개 layer)
//  - playback clock + speed + lookahead prefetch
//  - seek (cache miss / hit)
//  - sparse vs dense endpoint 분리
//  - location buffer + sentinel + getSamplePair
//
// burst spread (구 requestSpreadMs) 은 client token bucket 책임으로 이전 — 해당 단위
// 검증은 openf1Client.test.ts (AC1) 가 cover 하므로 본 파일에서 제거.

import { describe, expect, it, vi } from 'vitest';
import {
  DENSE_ENDPOINTS,
  ReplayDataSource,
  SPARSE_ENDPOINTS,
} from '../ReplayDataSource.js';
import {
  createMockOpenF1Client,
  type MockRoute,
} from '../../shared/__tests__/createMockOpenF1Client.js';

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

/**
 * fetch 를 client 에 위임하므로 테스트는 mock client 를 주입한다. fallback(respond) 하나로 기존 단일
 * fetchImpl switch 패턴을 보존하고, maxConcurrent=100 으로 둬 start burst(sparse 6 + dense 3 = 9)
 * 가 in-flight cap 없이 한 번에 나가게 한다 (gated dedup 테스트에서 9건 모두 관찰 가능).
 */
function makeDs(overrides: {
  respond?: MockRoute;
  windowMs?: number;
  lookaheadBaseMs?: number;
  clockTickIntervalMs?: number;
  sessionDateEnd?: Date;
} = {}) {
  const { client, fetchMock } = createMockOpenF1Client(
    {},
    { fallback: overrides.respond ?? (() => jsonResponse([])), maxConcurrent: 100 },
  );
  const ds = new ReplayDataSource({
    sessionKey: SESSION_KEY,
    sessionDateStart: SESSION_START,
    sessionDateEnd: overrides.sessionDateEnd,
    client,
    windowMs: overrides.windowMs,
    lookaheadBaseMs: overrides.lookaheadBaseMs,
    // 기본은 0 — 기존 단위 테스트가 자동 tick 으로 영향받지 않게.
    clockTickIntervalMs: overrides.clockTickIntervalMs ?? 0,
  });
  return { ds, fetchMock };
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
    const { ds } = makeDs();
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
    const { ds } = makeDs();
    // 15:00:00 < session_start 15:00:23 → offset = -23000ms → bucket = floor(-23000/60000) = -1 → window = start − 60s = 14:59:23
    expect(ds.windowStartFor(new Date('2024-03-02T15:00:00.000Z')).toISOString()).toBe(
      '2024-03-02T14:59:23.000Z',
    );
  });
});

describe('ReplayDataSource — fetch URL 패턴', () => {
  it('sparse endpoint 는 session_key 만 (date 필터 없음)', async () => {
    const { ds, fetchMock } = makeDs();
    await ds.start();
    const sparseUrls = fetchMock.mock.calls
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
    const { ds, fetchMock } = makeDs();
    await ds.start();
    const locationUrls = fetchMock.mock.calls
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
    const { ds, fetchMock } = makeDs();
    await ds.start();
    const locationUrls = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/v1/location?'));
    // 첫 윈도우 = sessionStart, snap 그리드라 정확히 session.date_start.
    expect(locationUrls[0]).toContain(encodeURIComponent('2024-03-02T15:00:23.000Z'));
  });
});

describe('ReplayDataSource — WindowCache (replay-strategy §5.1)', () => {
  it('같은 윈도우 두 번째 요청 시 fetch 0회 (cache hit)', async () => {
    const { ds, fetchMock } = makeDs({ lookaheadBaseMs: 60_000 }); // 1 window only
    await ds.start();
    const baseline = fetchMock.mock.calls.length;
    // 같은 위치 재seek → 캐시 적중 → fetch 0회 증가.
    ds.setPlaybackClock(SESSION_START);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock.mock.calls.length).toBe(baseline);
  });

  it('새 윈도우 seek 시 cache miss → 필요한 dense window 만큼 fetch', async () => {
    const { ds, fetchMock } = makeDs({ lookaheadBaseMs: 60_000 });
    await ds.start();
    const baseline = fetchMock.mock.calls.length;
    // 15:30:00 (window [15:29:23, 15:30:23) 안) + 60s lookahead → window 2개 cover 필요.
    ds.setPlaybackClock(new Date('2024-03-02T15:30:00.000Z'));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // 2 새 windows × 3 dense endpoint = 6 신규 fetch.
    expect(fetchMock.mock.calls.length).toBe(baseline + 6);
  });
});

describe('ReplayDataSource — in-flight dedup (replay-strategy §5.2)', () => {
  it('동시 setPlaybackClock 으로 같은 uncached window 호출해도 endpoint 당 fetch 1회', async () => {
    // pending 상태에서 sparse + dense 가 모두 멈춰 있는 동안 같은 윈도우 추가 요청 → window-level dedup.
    const resolvers: Array<() => void> = [];
    const respond: MockRoute = () =>
      new Promise<Response>((r) => {
        resolvers.push(() => r(jsonResponse([])));
      });
    const { ds, fetchMock } = makeDs({ respond, lookaheadBaseMs: 60_000 });
    const startP = ds.start();
    // start 가 sparse 6 를 fire (gated) → ensureLookahead 는 sparse Promise.all 뒤라 미실행.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // setPlaybackClock 이 ensureLookahead 를 직접 trigger → dense 3 fire. 2번째는 inflight 합쳐 0 신규.
    ds.setPlaybackClock(SESSION_START);
    ds.setPlaybackClock(SESSION_START);
    for (let i = 0; i < 5; i++) await Promise.resolve();
    // sparse 6 + dense 3 (1 window) = 9. 추가 setPlaybackClock 은 같은 cache_key 라 inflight 합쳐 0 신규.
    expect(fetchMock).toHaveBeenCalledTimes(9);
    for (const r of resolvers) r();
    await startP;
  });
});

describe('ReplayDataSource — playback clock + speed', () => {
  it('getDisplayTime 은 setPlaybackClock 으로 변경됨', async () => {
    const { ds } = makeDs();
    await ds.start();
    expect(ds.getDisplayTime().valueOf()).toBe(SESSION_START.valueOf());
    const newT = new Date('2024-03-02T15:30:00.000Z');
    ds.setPlaybackClock(newT);
    expect(ds.getDisplayTime().valueOf()).toBe(newT.valueOf());
  });

  it('onDisplayTimeChange listener 가 setPlaybackClock 시 호출됨', async () => {
    const { ds } = makeDs();
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
    const { ds, fetchMock } = makeDs({ lookaheadBaseMs: 60_000 });
    await ds.start();
    const sparseCount = SPARSE_ENDPOINTS.length;
    const oneWindowDense = DENSE_ENDPOINTS.length; // 3
    expect(fetchMock.mock.calls.length).toBe(sparseCount + oneWindowDense);

    ds.setSpeed(4);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    // lookahead = 240s = 4 windows × 3 dense = 12. 첫 윈도우 1개는 캐시됨 → 3 windows × 3 = 9 신규.
    expect(fetchMock.mock.calls.length).toBe(sparseCount + 3 + 9);
  });

  it('setSpeed(0) 거부 (throws)', () => {
    const { ds } = makeDs();
    expect(() => ds.setSpeed(0)).toThrow();
    expect(() => ds.setSpeed(-1)).toThrow();
  });
});

describe('ReplayDataSource — location buffer + sentinel', () => {
  it('sentinel (|x|+|y|+|z| < 50) sample 은 buffer 적재 안 됨', async () => {
    const respond: MockRoute = (url) => {
      if (url.includes('/v1/location')) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:25.000Z', 5, 5, 5)]);
      }
      return jsonResponse([]);
    };
    const { ds } = makeDs({ respond });
    await ds.start();
    expect(ds.getSamplePair(44, new Date('2024-03-02T15:00:25.000Z'))).toBeNull();
  });

  it('일반 sample 2건 → getSamplePair 가 둘러싼 쌍 반환', async () => {
    const respond: MockRoute = (url) => {
      if (url.includes('/v1/location')) {
        return jsonResponse([
          locationRecord(44, '2024-03-02T15:00:30.000Z', 100, 200, 10),
          locationRecord(44, '2024-03-02T15:00:31.000Z', 120, 210, 10),
        ]);
      }
      return jsonResponse([]);
    };
    const { ds } = makeDs({ respond });
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
    const { ds } = makeDs();
    expect(ds.getStreamState()).toBe('buffering');
    await ds.start();
    expect(ds.getStreamState()).toBe('live');
  });
});

describe('ReplayDataSource — dashboard 메서드 (cache 위임 + 미래 누설 컷)', () => {
  // sparse(laps/stints) + dense(position) 를 mock 으로 적재한 뒤 display_time 컷 검증.
  const LAPS = [
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, lap_number: 1, date_start: '2024-03-02T15:00:23.000Z', lap_duration: 90, duration_sector_1: 30, duration_sector_2: 30, duration_sector_3: 30 },
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, lap_number: 2, date_start: '2024-03-02T15:01:53.000Z', lap_duration: 88, duration_sector_1: 29, duration_sector_2: 29, duration_sector_3: 30 },
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, lap_number: 3, date_start: '2024-03-02T15:03:21.000Z', lap_duration: null, duration_sector_1: null, duration_sector_2: null, duration_sector_3: null },
  ];
  const STINTS = [
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, stint_number: 1, lap_start: 1, lap_end: 2, compound: 'MEDIUM', tyre_age_at_start: 0 },
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, stint_number: 2, lap_start: 3, lap_end: 30, compound: 'HARD', tyre_age_at_start: 1 },
  ];
  const POSITIONS = [
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, date: '2024-03-02T15:00:30.000Z', position: 5 },
    { driver_number: 44, session_key: SESSION_KEY, meeting_key: 1234, date: '2024-03-02T15:01:30.000Z', position: 2 },
  ];

  /** dense 윈도우 fetch URL 의 date>= / date< 경계를 파싱 (operator-suffix 규약). */
  function denseBounds(url: string): { start: number; end: number } {
    const ge = url.match(/date>=([^&]+)/);
    const lt = url.match(/date<([^&]+)/);
    return {
      start: ge ? Date.parse(decodeURIComponent(ge[1])) : Number.NEGATIVE_INFINITY,
      end: lt ? Date.parse(decodeURIComponent(lt[1])) : Number.POSITIVE_INFINITY,
    };
  }

  const respond: MockRoute = (url) => {
    if (url.includes('/v1/laps')) return jsonResponse(LAPS);
    if (url.includes('/v1/stints')) return jsonResponse(STINTS);
    if (url.includes('/v1/position')) {
      const { start, end } = denseBounds(url);
      return jsonResponse(POSITIONS.filter((p) => {
        const ms = Date.parse(p.date);
        return ms >= start && ms < end;
      }));
    }
    return jsonResponse([]);
  };

  async function setup() {
    // lookaheadBaseMs 120s → start 시 윈도우 2개(15:00:23, 15:01:23) prefetch → POSITION 둘 다 cache.
    const { ds } = makeDs({ respond, lookaheadBaseMs: 120_000 });
    await ds.start();
    return ds;
  }

  it('6 메서드 모두 throw 하지 않고 결과 반환', async () => {
    const ds = await setup();
    const t = new Date('2024-03-02T15:02:00.000Z');
    expect(() => ds.getLatestBefore('position', t)).not.toThrow();
    expect(() => ds.getAllBefore('position', t)).not.toThrow();
    expect(() => ds.getLapAt(44, t)).not.toThrow();
    expect(() => ds.getCompletedLapsBefore(44, t)).not.toThrow();
    expect(() => ds.getStintForLap(44, 1)).not.toThrow();
    expect(() => ds.getAggregateBefore('fastest_lap', t)).not.toThrow();
  });

  it('completedLapsBefore — t=15:02:00 면 lap1 만 (lap2 미완)', async () => {
    const ds = await setup();
    const laps = ds.getCompletedLapsBefore(44, new Date('2024-03-02T15:02:00.000Z'));
    expect(laps.map((l) => l.lap_number)).toEqual([1]);
  });

  it('getLapAt — 진행 중 lap 도 시작했으면 반환', async () => {
    const ds = await setup();
    expect(ds.getLapAt(44, new Date('2024-03-02T15:04:00.000Z'))?.lap_number).toBe(3);
  });

  it('getStintForLap — lap 포함 stint', async () => {
    const ds = await setup();
    expect(ds.getStintForLap(44, 2)?.stint_number).toBe(1);
    expect(ds.getStintForLap(44, 3)?.stint_number).toBe(2);
  });

  it('미래 누설 zero — lookahead 가 미리 적재한 미래 position(15:01:30)이 t=15:01:00 에 안 보임', async () => {
    const ds = await setup();
    const early = ds.getLatestBefore('position', new Date('2024-03-02T15:01:00.000Z'));
    expect(early?.position).toBe(5); // 15:00:30 record (미래 15:01:30 아님)
    const later = ds.getLatestBefore('position', new Date('2024-03-02T15:01:40.000Z'));
    expect(later?.position).toBe(2);
  });
});

describe('ReplayDataSource — playback_clock 자동 진행 (replay-strategy §4.1)', () => {
  it('clockTickIntervalMs > 0 → start() 후 시간이 흐르면 playbackClock 이 전진하고 listener 가 호출됨', async () => {
    const { ds } = makeDs({ clockTickIntervalMs: 20 });
    const observed: number[] = [];
    ds.onDisplayTimeChange((t) => observed.push(t.valueOf()));
    const initial = ds.getDisplayTime().valueOf();
    await ds.start();
    await new Promise((r) => setTimeout(r, 80)); // ~3-4 tick
    ds.stop();
    const final = ds.getDisplayTime().valueOf();
    expect(final).toBeGreaterThan(initial);
    expect(observed.length).toBeGreaterThan(0);
    // 마지막 listener 값이 최종 playbackClock 과 일치
    expect(observed[observed.length - 1]).toBe(final);
  });

  it('sessionDateEnd 를 넘지 않게 clamp', async () => {
    // 100ms 짧은 세션 → tick 으로 즉시 끝에 도달.
    const sessionEnd = new Date(SESSION_START.valueOf() + 100);
    const { ds } = makeDs({ clockTickIntervalMs: 20, sessionDateEnd: sessionEnd });
    await ds.start();
    await new Promise((r) => setTimeout(r, 200));
    ds.stop();
    expect(ds.getDisplayTime().valueOf()).toBeLessThanOrEqual(sessionEnd.valueOf());
  });

  it('stop() 후 clock 이 더 이상 전진하지 않음', async () => {
    const { ds } = makeDs({ clockTickIntervalMs: 20 });
    await ds.start();
    await new Promise((r) => setTimeout(r, 60));
    ds.stop();
    const afterStop = ds.getDisplayTime().valueOf();
    await new Promise((r) => setTimeout(r, 60));
    expect(ds.getDisplayTime().valueOf()).toBe(afterStop);
  });

  it('B1 pause() — clock 전진 멈춤, isPaused=true', async () => {
    const { ds } = makeDs({ clockTickIntervalMs: 20 });
    await ds.start();
    await new Promise((r) => setTimeout(r, 60));
    ds.pause();
    expect(ds.isPaused()).toBe(true);
    const afterPause = ds.getDisplayTime().valueOf();
    await new Promise((r) => setTimeout(r, 60));
    expect(ds.getDisplayTime().valueOf()).toBe(afterPause);
  });

  it('B1 resume() — pause 후 resume 시 clock 다시 진행', async () => {
    const { ds } = makeDs({ clockTickIntervalMs: 20 });
    await ds.start();
    await new Promise((r) => setTimeout(r, 60));
    ds.pause();
    const afterPause = ds.getDisplayTime().valueOf();
    ds.resume();
    expect(ds.isPaused()).toBe(false);
    await new Promise((r) => setTimeout(r, 60));
    expect(ds.getDisplayTime().valueOf()).toBeGreaterThan(afterPause);
    ds.stop();
  });

  it('clockTickIntervalMs=0 (default in test helper) → start() 후에도 clock 전진 없음', async () => {
    const { ds } = makeDs();
    const initial = ds.getDisplayTime().valueOf();
    await ds.start();
    await new Promise((r) => setTimeout(r, 60));
    expect(ds.getDisplayTime().valueOf()).toBe(initial);
  });
});

describe('ReplayDataSource — abort-on-stop (Step 5)', () => {
  it('stop() 이 in-flight client 요청을 abort + start() 정상 종료 (lookahead 미발사)', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let captured: AbortSignal | undefined;
    const respond: MockRoute = async (_url, init) => {
      captured = init.signal; // client 가 fetch 에 넘긴 abort signal
      await gate; // sparse 를 in-flight 로 묶어둠
      return jsonResponse([]);
    };
    const { ds } = makeDs({ respond, lookaheadBaseMs: 60_000 });
    const startP = ds.start();
    // sparse dispatch (pump microtask) 까지 진행 → signal 캡처.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(captured?.aborted).toBe(false);

    ds.stop(); // queued/in-flight client 요청 취소
    expect(captured?.aborted).toBe(true);

    // sparse 가 AbortError 로 reject → swallow → Promise.all resolve → abortController===null guard
    // → ensureLookahead/tick 미등록 → start() resolve.
    await startP;
    release!();
  });
});
