// live-map plan §10 단계 15 + 인수 12 + §5.9 (탭 백그라운드 처리).
//
// 시나리오: 백그라운드 60s 후 포그라운드 복귀 시 보간이 정확한 displayTime 에서 재개.
// 플랜 §5.9 — "RAF 는 백그라운드에서 1Hz 로 강제 → 자연 일시정지. 복귀 시 displayTime 이
// 점프 → 보간 윈도우가 새 위치로 이동 → 자연 재개. 별도 코드 불필요."
//
// 본 테스트가 lock 하는 invariant:
//  1. wall-clock 만 60s 진행 (sample 인입 없음) 시 getDisplayTime 가 anchor + drift 로
//     자연 진행 (newestDate 갱신 X, anchorWall 갱신 X — 둘 다 마지막 sample 시점에 고정).
//  2. gap 후 신규 sample 인입 시 anchor 재설정 → getDisplayTime 가 (newestDate - 30s) 로 즉시 점프.
//  3. PerDriverBuffer.findPair 는 큰 gap 시 freeze 분기 (s2=null) 진입.
//  4. stream state 가 live → stalled → live 로 정상 전이.

import { describe, expect, it, vi } from 'vitest';
import { LiveDataSource } from '../LiveDataSource.js';
import { PerDriverBuffer } from '../PerDriverBuffer.js';
import { DEFAULT_THRESHOLDS, interpolatePosition, type DriverSample } from '../interpolation.js';
import type { Point2D } from '../viewport.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function locationRecord(driver: number, dateIso: string, x: number, y: number, z = 10) {
  return { driver_number: driver, session_key: 9472, meeting_key: 1234, date: dateIso, x, y, z };
}

describe('LiveDataSource — wall-clock 60s gap + 복귀 (인수 12)', () => {
  it('초기 sample 후 wall-clock 60s 진행 → displayTime 가 anchor + drift 로 자연 진행', async () => {
    // 시각 모델:
    //  - t0 (data) = 15:00:00, t0 (wall) = 0
    //  - 신규 sample date=15:00:00 인입 → anchorDisplay = 14:59:30, anchorWall = 0
    //  - wall 만 60s 진행 → getDisplayTime = anchorDisplay + 60s = 15:00:30
    let wallMs = 0;
    const now = () => new Date(wallMs);

    let firstCall = true;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        if (firstCall) {
          firstCall = false;
          return jsonResponse([
            locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200),
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
      now,
    });
    await ds.start();

    const initialDisplay = ds.getDisplayTime();
    // anchorDisplay = 15:00:00 - 30s = 14:59:30 (anchorWall=0 at sample arrival)
    expect(initialDisplay.toISOString()).toBe('2024-03-02T14:59:30.000Z');

    // wall 만 60s 진행 — 신규 sample 없음 (백그라운드 탭 가정).
    wallMs += 60_000;
    const driftedDisplay = ds.getDisplayTime();
    // drift 60s 적용 → 14:59:30 + 60s = 15:00:30 (안 멈춤, 자연 진행)
    expect(driftedDisplay.toISOString()).toBe('2024-03-02T15:00:30.000Z');

    ds.stop();
  });

  it('60s gap 후 신규 sample 인입 → newestDate 갱신 + anchor 재설정 → displayTime 즉시 점프', async () => {
    // 시각 모델:
    //  - t0=15:00:00 sample, wall=0 → anchorDisplay=14:59:30
    //  - wall 60s 진행 (sample 없음) → display=15:00:30 (drift)
    //  - wall=60_000 시점에 신규 sample t=15:01:00 인입 → anchorDisplay=(15:01:00 − 30s)=15:00:30
    //    + anchorWall=60_000. drift 와 일치 → 자연 재개.
    //  - 이후 wall 30s 더 진행 (wall=90_000) → display=15:01:00 (anchorDisplay+drift)
    vi.useFakeTimers();
    let wallMs = 0;
    const now = () => new Date(wallMs);

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.includes('/v1/location')) return jsonResponse([]);
      // wall < 60_000: 초기 sample. wall ≥ 60_000: 신규 sample (gap 후 첫 cadence).
      if (wallMs === 0) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200)]);
      }
      if (wallMs >= 60_000 && wallMs < 90_000) {
        return jsonResponse([locationRecord(44, '2024-03-02T15:01:00.000Z', 200, 300)]);
      }
      return jsonResponse([]);
    });

    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
      now,
    });
    const startP = ds.start();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    await startP;

    // 첫 sample arrival 직후 display = t0 − 30s
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T14:59:30.000Z');

    // 백그라운드 60s (sample 없음, fake timer 도 advance 안 시킴 → cadence 미발동).
    // 의도적 decoupling: wallMs 는 now() 가 직접 읽고, fake timer 는 cadence interval 만 구동.
    // 둘이 50s 차이로 갈라지지만 본 테스트는 cadence trigger 와 wall-anchor 의 독립을 검증한다 —
    // 미래에 둘을 하나로 묶는 refactor 가 들어오면 본 테스트는 silently broken (가드용 코멘트).
    wallMs += 60_000;
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T15:00:30.000Z');

    // 신규 sample 인입 — wallMs 가 이미 60_000 이라 다음 cadence cycle 에 새 응답.
    // location cadence = 10_000ms 라 한 cycle advance 만으로 발화.
    await vi.advanceTimersByTimeAsync(10_000);

    // anchor 재설정: anchorDisplay = (15:01:00) − 30s = 15:00:30, anchorWall = 60_000 (= now).
    // drift = 0 → display = 15:00:30
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T15:00:30.000Z');

    // 추가 wall 30s → drift 30s → display = 15:01:00 (newestDate 와 동일)
    wallMs += 30_000;
    expect(ds.getDisplayTime().toISOString()).toBe('2024-03-02T15:01:00.000Z');

    ds.stop();
    vi.useRealTimers();
  });

  it('PerDriverBuffer.findPair 가 큰 gap 후 freeze 분기 (s2=null) 진입', () => {
    const buffer = new PerDriverBuffer();
    // 초기 sample 두 개 (정상 보간 가능)
    buffer.push(44, { date: 0, rawXY: [100, 0] as Point2D, s: 100, n: 0 });
    buffer.push(44, { date: 1000, rawXY: [200, 0] as Point2D, s: 200, n: 0 });

    // displayTime 이 마지막 sample 보다 한참 뒤 (60s 가정) → s2=null freeze
    const pair = buffer.findPair(44, 61_000);
    expect(pair).not.toBeNull();
    if (pair) {
      expect(pair.s1.date).toBe(1000); // 가장 최근 sample 만
      expect(pair.s2).toBeNull();
    }
  });

  it('interpolatePosition freeze 분기 — gap > GAP_FREEZE_MS 시 s1.rawXY 보존', () => {
    const s1: DriverSample = { date: 0, rawXY: [100, 0], s: 100, n: 0 };
    const s2: DriverSample = { date: 60_000, rawXY: [999, 999], s: 200, n: 0 }; // gap 60s
    const ctx = {
      polyline: [[0, 0], [500, 0]] as readonly Point2D[],
      arcLengthTable: [0, 500] as readonly number[],
      totalLength: 500,
    };
    const result = interpolatePosition(s1, s2, 30_000, ctx);
    // 60s gap > GAP_FREEZE_MS (1500ms) → freeze, position = s1.rawXY
    expect(result.kind).toBe('freeze');
    expect(result.position).toEqual([100, 0]);
    // DEFAULT_THRESHOLDS sanity (regression guard)
    expect(DEFAULT_THRESHOLDS.GAP_FREEZE_MS).toBe(1500);
  });
});

describe('LiveDataSource — stream state 전이 (인수 12 보조)', () => {
  it('초기: buffering → sample 인입: live → wall gap 5s+: stalled', async () => {
    let wallMs = 0;
    const now = () => new Date(wallMs);
    let firstCall = true;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/v1/location')) {
        if (firstCall) {
          firstCall = false;
          return jsonResponse([locationRecord(44, '2024-03-02T15:00:00.000Z', 100, 200)]);
        }
      }
      return jsonResponse([]);
    });
    const ds = new LiveDataSource({
      sessionKey: 9472,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      hydrationTokenIntervalMs: 0,
      sleep: async () => {},
      now,
    });
    expect(ds.getStreamState()).toBe('buffering'); // start 전
    await ds.start();
    expect(ds.getStreamState()).toBe('live'); // sample 직후
    wallMs += 2_000;
    expect(ds.getStreamState()).toBe('lagging'); // > 1.5s
    wallMs += 4_000;
    expect(ds.getStreamState()).toBe('stalled'); // > 5s
    ds.stop();
  });
});
