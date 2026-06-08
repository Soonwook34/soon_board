// scripts/_lib 공용 데이터 유틸 — derive/trace 스크립트 간 중복 제거 (최적화 감사 step 5).
// 모두 순수 함수 — scripts/__tests__/dataUtils.test.ts 로 동작 고정.

import type { Point2D } from '../../src/map/viewport.js';

/** OpenF1 location sentinel 임계 — |x|+|y|+|z| 가 이 값 미만이면 무효 좌표(피트/그리드 정차 등). */
export const SENTINEL_THRESHOLD = 50;

/** driver_number 별로 행을 그룹핑 (sectorBoundaries/drsZones derive 공용). */
export function groupByDriver<T extends { driver_number: number }>(rows: readonly T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const r of rows) {
    const arr = out.get(r.driver_number) ?? [];
    arr.push(r);
    out.set(r.driver_number, arr);
  }
  return out;
}

/** 점 집합의 좌표별 median 점 (sectorBoundaries/pitlane 공용). */
export function medianPoint(points: readonly Point2D[]): Point2D {
  const xs = points.map((p) => p[0]).sort((a, b) => a - b);
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  const mx = points.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  const my = points.length % 2 === 1 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
  return [mx, my];
}

/** sentinel(무효) 좌표 판정 — |x|+|y|+|z| < SENTINEL_THRESHOLD. */
export function isSentinelLocation(loc: { x: number; y: number; z: number }): boolean {
  return Math.abs(loc.x) + Math.abs(loc.y) + Math.abs(loc.z) < SENTINEL_THRESHOLD;
}

/**
 * session 시작 후 minutes분 (단 session 종료 초과 금지) 끝나는 시점.
 * OpenF1 /v1/location·/v1/car_data 의 session-wide 422 ("too much data") 회피용 윈도우.
 */
export function sessionWindowEnd(sessionStart: Date, sessionEnd: Date, minutes = 10): Date {
  return new Date(Math.min(sessionStart.getTime() + minutes * 60 * 1000, sessionEnd.getTime()));
}
