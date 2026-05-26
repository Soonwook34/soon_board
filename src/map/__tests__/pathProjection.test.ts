// src/map/pathProjection.ts — plan §5.2 회귀.
// 부호 규칙: 2D cross (B-A)×(P-A) > 0 → +n. SVG +y down 기준이라 cross > 0 = 시각적 "시계 방향(오른쪽)".

import { describe, expect, it } from 'vitest';
import { projectToPolyline } from '../pathProjection.js';
import type { Point2D } from '../viewport.js';

const SQUARE: readonly Point2D[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];
const SQUARE_S = [0, 100, 200, 300, 400];

describe('projectToPolyline — 기본 케이스', () => {
  it('첫 segment 위 정확히 (50, 0) → s=50, n=0, segIdx=0', () => {
    const r = projectToPolyline([50, 0], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(50);
    expect(r.n).toBeCloseTo(0);
    expect(r.segIdx).toBe(0);
    expect(r.projected[0]).toBeCloseTo(50);
    expect(r.projected[1]).toBeCloseTo(0);
  });
  it('첫 segment 시작점 (0,0) → s=0, n=0, segIdx=0', () => {
    const r = projectToPolyline([0, 0], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(0);
    expect(r.n).toBeCloseTo(0);
    expect(r.segIdx).toBe(0);
  });
  it('마지막 segment 위 (0, 50) → s=350, segIdx=3', () => {
    const r = projectToPolyline([0, 50], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(350);
    expect(r.n).toBeCloseTo(0);
    expect(r.segIdx).toBe(3);
  });
});

describe('projectToPolyline — 횡오프셋 부호', () => {
  it('첫 segment (0,0)-(100,0) 위쪽 (50, +5): cross = 100*5 - 0*50 = +500 > 0 → +n', () => {
    const r = projectToPolyline([50, 5], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(50);
    expect(r.n).toBeCloseTo(5);
    expect(r.segIdx).toBe(0);
  });
  it('같은 segment 아래쪽 (50, -5): cross < 0 → -n', () => {
    const r = projectToPolyline([50, -5], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(50);
    expect(r.n).toBeCloseTo(-5);
    expect(r.segIdx).toBe(0);
  });
  it('두 번째 segment (100,0)-(100,100) 오른쪽 (105, 50): polyline 진행방향 (남쪽으로) 기준 왼쪽 → cross 부호', () => {
    const r = projectToPolyline([105, 50], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(150);
    expect(Math.abs(r.n)).toBeCloseTo(5);
    expect(r.segIdx).toBe(1);
  });
});

describe('projectToPolyline — clamping (segment 양 끝 외부)', () => {
  it('(-10, 0) → segment 시작점에 clamp, n = 10 (좌측 외삽 거리)', () => {
    const r = projectToPolyline([-10, 0], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(0);
    expect(Math.abs(r.n)).toBeCloseTo(10);
    expect(r.projected[0]).toBeCloseTo(0);
    expect(r.projected[1]).toBeCloseTo(0);
  });
  it('endpoint (100, 0) — segment[0] end 또는 segment[1] start 둘 다 가능, n=0', () => {
    const r = projectToPolyline([100, 0], SQUARE, SQUARE_S);
    expect(r.s).toBeCloseTo(100);
    expect(r.n).toBeCloseTo(0);
  });
});

describe('projectToPolyline — 시케인 (Z 모양) 코너 안쪽 projection', () => {
  // Z 모양: (0,0) → (100,0) → (100,50) → (200,50) → (200, 100)
  const Z: readonly Point2D[] = [
    [0, 0],
    [100, 0],
    [100, 50],
    [200, 50],
    [200, 100],
  ];
  const Z_S = [0, 100, 150, 250, 300];
  it('코너 안쪽 (110, 40) — 가장 가까운 segment 는 (100,0)-(100,50) 또는 (100,50)-(200,50)', () => {
    const r = projectToPolyline([110, 40], Z, Z_S);
    // (110, 40) 의 가장 가까운 점은 segment 2 (100,50)-(200,50) 위 (110, 50) — 거리 10
    // segment 1 (100,0)-(100,50) 위 (100, 40) — 거리 10
    // 두 segment 모두 거리 10 → bestD2 는 먼저 발견한 segment 1 을 유지 (early exit 없음, < 비교)
    expect(r.segIdx === 1 || r.segIdx === 2).toBe(true);
    expect(Math.sqrt((110 - r.projected[0]) ** 2 + (40 - r.projected[1]) ** 2)).toBeCloseTo(10);
  });
  it('Z 코너 정중앙 (150, 50) — segment 2 위 (150, 50), n=0', () => {
    const r = projectToPolyline([150, 50], Z, Z_S);
    expect(r.s).toBeCloseTo(200);
    expect(r.n).toBeCloseTo(0);
    expect(r.segIdx).toBe(2);
  });
});

describe('projectToPolyline — 잘못된 입력', () => {
  it('polyline 길이 < 2 → throw', () => {
    expect(() => projectToPolyline([0, 0], [[0, 0]], [0])).toThrow();
  });
  it('arcLengthTable 길이 불일치 → throw', () => {
    expect(() => projectToPolyline([0, 0], SQUARE, [0, 100, 200])).toThrow();
  });
});
