// knockout 단위 테스트 — US-005. 컷라인이 상수가 아니라 멤버십(데이터)에서 파생됨을 단정.

import { describe, expect, it } from 'vitest';
import { cutlineFor, knockoutZone, gapToCutline } from '../knockout';
import type { QualiPart, SegmentModel } from '../qualifyingSegments';

/** 멤버십 크기만으로 합성 SegmentModel 생성 (driver_number = 1..size, 단조 포함). */
function modelWithSizes(s1: number, s2: number, s3: number): SegmentModel {
  const membership = new Map<QualiPart, Set<number>>();
  membership.set(1, new Set(Array.from({ length: s1 }, (_, i) => i + 1)));
  membership.set(2, new Set(Array.from({ length: s2 }, (_, i) => i + 1)));
  membership.set(3, new Set(Array.from({ length: s3 }, (_, i) => i + 1)));
  return { boundaries: [], confidence: 'phase', membership };
}

describe('cutlineFor — 데이터 파생 (하드코딩 금지)', () => {
  it('표준 20-엔트리(20→15→10): 컷라인/탈락 인원이 멤버십에서 파생', () => {
    const m = modelWithSizes(20, 15, 10);
    expect(cutlineFor(m, 1)).toMatchObject({ participants: 20, advancing: 15, cutlinePosition: 15, eliminated: 5 });
    expect(cutlineFor(m, 2)).toMatchObject({ participants: 15, advancing: 10, cutlinePosition: 10, eliminated: 5 });
    expect(cutlineFor(m, 3)).toMatchObject({ participants: 10, advancing: null, cutlinePosition: null, eliminated: null });
  });

  it('2026 22-엔트리(22→15→10): 컷라인 15 유지하되 Q1 탈락 인원이 7로 자동 증가(상수 5 아님)', () => {
    const m = modelWithSizes(22, 15, 10);
    const q1 = cutlineFor(m, 1);
    expect(q1.participants).toBe(22);
    expect(q1.advancing).toBe(15);
    expect(q1.cutlinePosition).toBe(15);
    expect(q1.eliminated).toBe(7); // 데이터 파생 — 20-엔트리의 5와 다름
  });

  it('임의 포맷(예 24→16→8)도 멤버십대로 파생', () => {
    const m = modelWithSizes(24, 16, 8);
    expect(cutlineFor(m, 1).cutlinePosition).toBe(16);
    expect(cutlineFor(m, 2).cutlinePosition).toBe(8);
  });

  it('다음 세그먼트 멤버십이 비면(라이브 getSessionResult=null) 컷라인 미확정 → 전원 탈락권 표시 안 함', () => {
    const m = modelWithSizes(20, 0, 0); // 라이브: 아직 진출자 데이터 없음
    const cut = cutlineFor(m, 1);
    expect(cut.advancing).toBeNull();
    expect(cut.cutlinePosition).toBeNull();
    expect(cut.eliminated).toBeNull();
    const ordered = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(knockoutZone(ordered, cut.cutlinePosition).size).toBe(0); // 전원 red 아님
  });
});

describe('knockoutZone', () => {
  it('컷라인 아래 드라이버 집합 (20-엔트리 → 마지막 5명)', () => {
    const ordered = Array.from({ length: 20 }, (_, i) => i + 1); // P1..P20 순
    const zone = knockoutZone(ordered, 15);
    expect(zone.size).toBe(5);
    expect([...zone].sort((a, b) => a - b)).toEqual([16, 17, 18, 19, 20]);
  });

  it('2026 22-엔트리 → 마지막 7명', () => {
    const ordered = Array.from({ length: 22 }, (_, i) => i + 1);
    expect(knockoutZone(ordered, 15).size).toBe(7);
  });

  it('컷라인 null(Q3) → 빈 집합', () => {
    expect(knockoutZone([1, 2, 3], null).size).toBe(0);
  });
});

describe('gapToCutline', () => {
  it('컷라인 보유자 대비 갭 — 진출권 음수, 탈락권 양수', () => {
    const ordered = [
      { driver_number: 1, bestSec: 89.0 },
      { driver_number: 2, bestSec: 89.5 }, // 컷라인(2위까지 진출)
      { driver_number: 3, bestSec: 90.1 }, // 탈락권
    ];
    const g = gapToCutline(ordered, 2);
    expect(g.get(1)!).toBeCloseTo(-0.5, 3);
    expect(g.get(2)!).toBeCloseTo(0, 3);
    expect(g.get(3)!).toBeCloseTo(0.6, 3);
  });

  it('컷라인 null → 빈 맵', () => {
    expect(gapToCutline([{ driver_number: 1, bestSec: 89 }], null).size).toBe(0);
  });
});
