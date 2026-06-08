// scripts/_lib/dataUtils.ts — 공용 유틸 회귀 (최적화 감사 step 5).

import { describe, expect, it } from 'vitest';
import {
  SENTINEL_THRESHOLD,
  groupByDriver,
  medianPoint,
  isSentinelLocation,
  sessionWindowEnd,
} from '../_lib/dataUtils.js';
import type { Point2D } from '../../src/map/viewport.js';

describe('groupByDriver', () => {
  it('driver_number 별로 묶고 입력 순서를 보존한다', () => {
    const rows = [
      { driver_number: 44, v: 1 },
      { driver_number: 1, v: 2 },
      { driver_number: 44, v: 3 },
    ];
    const grouped = groupByDriver(rows);
    expect(grouped.get(44)).toEqual([
      { driver_number: 44, v: 1 },
      { driver_number: 44, v: 3 },
    ]);
    expect(grouped.get(1)).toEqual([{ driver_number: 1, v: 2 }]);
    expect(grouped.size).toBe(2);
  });

  it('빈 입력은 빈 맵', () => {
    expect(groupByDriver([]).size).toBe(0);
  });
});

describe('medianPoint', () => {
  it('홀수 개수: 좌표별 가운데 값', () => {
    const pts: Point2D[] = [
      [3, 30],
      [1, 10],
      [2, 20],
    ];
    expect(medianPoint(pts)).toEqual([2, 20]);
  });

  it('짝수 개수: 좌표별 중앙 두 값의 평균', () => {
    const pts: Point2D[] = [
      [1, 10],
      [3, 30],
      [2, 20],
      [4, 40],
    ];
    expect(medianPoint(pts)).toEqual([2.5, 25]);
  });
});

describe('isSentinelLocation', () => {
  it('|x|+|y|+|z| < 50 이면 sentinel(true), >= 50 이면 false', () => {
    expect(SENTINEL_THRESHOLD).toBe(50);
    expect(isSentinelLocation({ x: 20, y: 20, z: 9 })).toBe(true); // 49
    expect(isSentinelLocation({ x: 20, y: 20, z: 10 })).toBe(false); // 50
    expect(isSentinelLocation({ x: -30, y: -30, z: 0 })).toBe(false); // 60, 절댓값
  });
});

describe('sessionWindowEnd', () => {
  it('시작 + minutes분 (종료 이전이면 그 값)', () => {
    const start = new Date('2024-03-02T15:00:00Z');
    const end = new Date('2024-03-02T16:00:00Z');
    expect(sessionWindowEnd(start, end).toISOString()).toBe('2024-03-02T15:10:00.000Z');
  });

  it('시작 + minutes분 이 종료를 넘으면 종료로 클램프', () => {
    const start = new Date('2024-03-02T15:00:00Z');
    const end = new Date('2024-03-02T15:04:00Z');
    expect(sessionWindowEnd(start, end).toISOString()).toBe('2024-03-02T15:04:00.000Z');
  });

  it('minutes 인자를 존중한다', () => {
    const start = new Date('2024-03-02T15:00:00Z');
    const end = new Date('2024-03-02T18:00:00Z');
    expect(sessionWindowEnd(start, end, 30).toISOString()).toBe('2024-03-02T15:30:00.000Z');
  });
});
