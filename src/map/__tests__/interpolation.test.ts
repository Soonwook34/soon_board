// src/map/interpolation.ts — plan §5.3 분기표 회귀.
// 시케인 (코너 안쪽으로 잘리지 않음) + wrapping + 오프트랙 fallback + freeze.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  interpolatePosition,
  type DriverSample,
  type InterpolationContext,
} from '../interpolation.js';
import type { Point2D } from '../viewport.js';

// 직선 polyline (0,0)→(1000,0). total=1000.
const STRAIGHT: readonly Point2D[] = [
  [0, 0],
  [1000, 0],
];
const STRAIGHT_S = [0, 1000];
const STRAIGHT_CTX: InterpolationContext = {
  polyline: STRAIGHT,
  arcLengthTable: STRAIGHT_S,
  totalLength: 1000,
};

// 사각형 perimeter 400. wrapping 테스트용.
const SQUARE: readonly Point2D[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];
const SQUARE_S = [0, 100, 200, 300, 400];
const SQUARE_CTX: InterpolationContext = {
  polyline: SQUARE,
  arcLengthTable: SQUARE_S,
  totalLength: 400,
};

// Z-shape chicane: (0,0)→(100,0)→(100,50)→(200,50)→(200,100)
const Z: readonly Point2D[] = [
  [0, 0],
  [100, 0],
  [100, 50],
  [200, 50],
  [200, 100],
];
const Z_S = [0, 100, 150, 250, 300];
const Z_CTX: InterpolationContext = {
  polyline: Z,
  arcLengthTable: Z_S,
  totalLength: 300,
};

function sample(date: number, s: number, n: number, rawXY: Point2D): DriverSample {
  return { date, rawXY, s, n };
}

describe('interpolatePosition — freeze 분기 (외삽 금지, plan §5.6)', () => {
  it('s2 가 null → freeze, s1.rawXY 반환', () => {
    const s1 = sample(1000, 100, 0, [100, 0]);
    const r = interpolatePosition(s1, null, 2000, STRAIGHT_CTX);
    expect(r.kind).toBe('freeze');
    expect(r.position).toEqual([100, 0]);
  });
  it('s2.date - s1.date > GAP_FREEZE_MS → freeze', () => {
    const s1 = sample(0, 100, 0, [100, 0]);
    const s2 = sample(2000, 300, 0, [300, 0]); // gap=2000 > 1500
    const r = interpolatePosition(s1, s2, 1000, STRAIGHT_CTX);
    expect(r.kind).toBe('freeze');
    expect(r.position).toEqual([100, 0]);
  });
});

describe('interpolatePosition — path-arc 기본 분기', () => {
  it('직선 polyline 중간 displayTime → path-arc lerp 결과가 polyline 위 정확한 좌표', () => {
    const s1 = sample(0, 200, 0, [200, 0]);
    const s2 = sample(1000, 800, 0, [800, 0]);
    const r = interpolatePosition(s1, s2, 500, STRAIGHT_CTX);
    expect(r.kind).toBe('path-arc');
    expect(r.position[0]).toBeCloseTo(500);
    expect(r.position[1]).toBeCloseTo(0);
  });
  it('u 가 정확히 0 일 때 (displayTime === s1.date) → s1 위치', () => {
    const s1 = sample(0, 200, 0, [200, 0]);
    const s2 = sample(1000, 800, 0, [800, 0]);
    const r = interpolatePosition(s1, s2, 0, STRAIGHT_CTX);
    expect(r.position[0]).toBeCloseTo(200);
  });
  it('displayTime > s2.date → u clamp 되어 s2 위치 (외삽 금지)', () => {
    const s1 = sample(0, 200, 0, [200, 0]);
    const s2 = sample(1000, 800, 0, [800, 0]);
    const r = interpolatePosition(s1, s2, 1500, STRAIGHT_CTX);
    expect(r.position[0]).toBeCloseTo(800);
  });
});

describe('interpolatePosition — 시케인 (path-arc 가 코너 안쪽으로 잘리지 않음)', () => {
  it('Z 모양 u=0.25 — path-arc 가 polyline 위(87.5, 0), 직선 lerp(75, 12.5) 와 다름', () => {
    const s1 = sample(0, 50, 0, [50, 0]);
    const s2 = sample(1000, 200, 0, [150, 50]);
    const r = interpolatePosition(s1, s2, 250, Z_CTX);
    expect(r.kind).toBe('path-arc');
    expect(r.position[0]).toBeCloseTo(87.5);
    expect(r.position[1]).toBeCloseTo(0);
    const linearLerpX = 50 + 0.25 * (150 - 50);
    const linearLerpY = 0 + 0.25 * (50 - 0);
    expect(Math.hypot(r.position[0] - linearLerpX, r.position[1] - linearLerpY)).toBeGreaterThan(10);
  });
});

describe('interpolatePosition — wrapping 분기 (결승선 통과)', () => {
  it('s1.s=380, s2.s=20, total=400, u=0.5 → wrapping path-arc, sNow=0 (start/finish)', () => {
    const s1 = sample(0, 380, 0, [0, 80]); // 사각형 4번째 segment 위 (0,80)
    const s2 = sample(1000, 20, 0, [20, 0]); // 사각형 1번째 segment 위 (20,0)
    const r = interpolatePosition(s1, s2, 500, SQUARE_CTX);
    expect(r.kind).toBe('wrapping');
    // sNow = wrap(380 + 0.5*(20 + 400 - 380), 400) = wrap(380 + 0.5*40, 400) = wrap(400, 400) = 0
    // → polyline[0] = (0, 0)
    expect(r.position[0]).toBeCloseTo(0);
    expect(r.position[1]).toBeCloseTo(0);
  });
});

describe('interpolatePosition — raw-xy fallback (오프트랙)', () => {
  it('s1.n=20 (>N_OFFTRACK=15) → raw-xy lerp', () => {
    const s1 = sample(0, 100, 20, [100, 20]); // 트랙 위쪽 20 (오프트랙)
    const s2 = sample(1000, 200, 0, [200, 0]);
    const r = interpolatePosition(s1, s2, 500, STRAIGHT_CTX);
    expect(r.kind).toBe('raw-xy');
    // (100, 20) → (200, 0) 의 중점 = (150, 10)
    expect(r.position[0]).toBeCloseTo(150);
    expect(r.position[1]).toBeCloseTo(10);
  });
  it('s2.n=-20 (|n|>N_OFFTRACK) → raw-xy lerp (양쪽 중 한쪽만 오프트랙이어도)', () => {
    const s1 = sample(0, 100, 0, [100, 0]);
    const s2 = sample(1000, 200, -20, [200, -20]);
    const r = interpolatePosition(s1, s2, 500, STRAIGHT_CTX);
    expect(r.kind).toBe('raw-xy');
  });
});

describe('interpolatePosition — thresholds 오버라이드', () => {
  it('N_OFFTRACK 을 100 으로 올리면 n=20 도 path-arc 유지', () => {
    const s1 = sample(0, 100, 20, [100, 20]);
    const s2 = sample(1000, 200, 0, [200, 0]);
    const r = interpolatePosition(s1, s2, 500, {
      ...STRAIGHT_CTX,
      thresholds: { N_OFFTRACK: 100 },
    });
    expect(r.kind).toBe('path-arc');
  });
  it('GAP_FREEZE_MS 를 3000 으로 올리면 gap=2000 도 freeze 안 됨', () => {
    const s1 = sample(0, 100, 0, [100, 0]);
    const s2 = sample(2000, 300, 0, [300, 0]); // gap=2000
    const r = interpolatePosition(s1, s2, 1000, {
      ...STRAIGHT_CTX,
      thresholds: { GAP_FREEZE_MS: 3000 },
    });
    expect(r.kind).toBe('path-arc');
  });
});

describe('DEFAULT_THRESHOLDS — plan §5.4 값 동결', () => {
  it('N_TRACK=8, N_OFFTRACK=15, GAP_FREEZE_MS=1500, WRAP_THRESHOLD_RATIO=0.8', () => {
    expect(DEFAULT_THRESHOLDS.N_TRACK).toBe(8);
    expect(DEFAULT_THRESHOLDS.N_OFFTRACK).toBe(15);
    expect(DEFAULT_THRESHOLDS.GAP_FREEZE_MS).toBe(1500);
    expect(DEFAULT_THRESHOLDS.WRAP_THRESHOLD_RATIO).toBe(0.8);
  });
});
