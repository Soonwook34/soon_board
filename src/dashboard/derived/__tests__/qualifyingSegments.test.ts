// qualifyingSegments 단위 테스트 — US-004. 실 OpenF1 fixture(SK 9468 = 2024 Bahrain Qualifying).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  reconstructSegments,
  lapPhaseOf,
  progressiveSegmentBests,
  reachedPart,
} from '../qualifyingSegments';
import type { LapRecord, RaceControlRecord, SessionResultRecord } from '../../../shared/openf1Types';

function loadFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8')) as T;
}

// DataSource 가 fetch 직후 하듯 date/date_start 를 Date 로 정규화.
const raceControl: RaceControlRecord[] = loadFixture<Array<Record<string, unknown>>>(
  'quali-9468-race_control.json',
).map((r) => ({ ...r, date: new Date(r.date as string) }) as unknown as RaceControlRecord);

const sessionResult = loadFixture<SessionResultRecord[]>('quali-9468-session_result.json');

const laps: LapRecord[] = loadFixture<Array<Record<string, unknown>>>('quali-9468-laps.json').map(
  (r) => ({ ...r, date_start: r.date_start ? new Date(r.date_start as string) : null }) as unknown as LapRecord,
);

const MIN = 60_000;

describe('reconstructSegments — 경계(race_control)', () => {
  const model = reconstructSegments(raceControl, sessionResult);

  it('정확히 3개 세그먼트(Q1/Q2/Q3)를 phase-tagged 이벤트로 도출', () => {
    expect(model.boundaries.map((b) => b.part)).toEqual([1, 2, 3]);
    expect(model.confidence).toBe('phase');
  });

  it('각 세그먼트 start<end, 길이가 표준(18/15/12분)에 근접', () => {
    const lens = model.boundaries.map((b) => (b.endMs! - b.startMs!) / MIN);
    expect(model.boundaries.every((b) => b.startMs! < b.endMs!)).toBe(true);
    // 18/15/12 (±1분 허용 — CHEQUERED 가 초 단위로 약간 늦음)
    expect(lens[0]).toBeCloseTo(18, 0);
    expect(lens[1]).toBeCloseTo(15, 0);
    expect(lens[2]).toBeCloseTo(12, 0);
  });
});

describe('reconstructSegments — 멤버십(session_result non-null 수)', () => {
  const model = reconstructSegments(raceControl, sessionResult);

  it('도달 인원 = 20 / 15 / 10 (배열 길이가 아니라 non-null 수 기반)', () => {
    expect(model.membership.get(1)!.size).toBe(20);
    expect(model.membership.get(2)!.size).toBe(15);
    expect(model.membership.get(3)!.size).toBe(10);
  });

  it('Q3 진출자 ⊂ Q2 진출자 ⊂ Q1 진출자 (단조 포함)', () => {
    const m1 = model.membership.get(1)!;
    const m2 = model.membership.get(2)!;
    const m3 = model.membership.get(3)!;
    expect([...m2].every((d) => m1.has(d))).toBe(true);
    expect([...m3].every((d) => m2.has(d))).toBe(true);
  });
});

describe('reachedPart', () => {
  const byNum = new Map(sessionResult.map((r) => [r.driver_number, r]));

  it('reachedPart: P1(#1)=3, 어떤 Q2 탈락자=2, 어떤 Q1 탈락자=1', () => {
    expect(reachedPart(byNum.get(1)!)).toBe(3); // 폴포지션 — Q3 도달
    // 도달 단계 분포가 {3:10, 2:5, 1:5}
    const dist = sessionResult.reduce<Record<number, number>>((acc, r) => {
      const n = reachedPart(r);
      acc[n] = (acc[n] ?? 0) + 1;
      return acc;
    }, {});
    expect(dist).toEqual({ 1: 5, 2: 5, 3: 10 });
  });
});

describe('lapPhaseOf', () => {
  const { boundaries } = reconstructSegments(raceControl, sessionResult);
  const mk = (iso: string): LapRecord =>
    ({ date_start: new Date(iso), is_pit_out_lap: false, lap_duration: 90 }) as unknown as LapRecord;

  it('세그먼트 윈도우 안의 랩 → 해당 part, 사이 공백 → null', () => {
    expect(lapPhaseOf(mk('2024-03-01T16:10:00Z'), boundaries)).toBe(1);
    expect(lapPhaseOf(mk('2024-03-01T16:30:00Z'), boundaries)).toBe(2);
    expect(lapPhaseOf(mk('2024-03-01T16:55:00Z'), boundaries)).toBe(3);
    expect(lapPhaseOf(mk('2024-03-01T16:21:00Z'), boundaries)).toBeNull(); // Q1↔Q2 사이
    expect(lapPhaseOf(mk('2024-03-01T15:30:00Z'), boundaries)).toBeNull(); // 세션 전
  });
});

describe('progressiveSegmentBests — 미래 누설 zero', () => {
  const { boundaries } = reconstructSegments(raceControl, sessionResult);

  it('Q1 종료 시점(t)에는 Q1 베스트만, Q2/Q3 데이터는 전무', () => {
    const tQ1End = new Date('2024-03-01T16:18:00Z');
    const best = progressiveSegmentBests(laps, boundaries, tQ1End);
    expect(best.size).toBeGreaterThan(0);
    let part2or3 = 0;
    let part1 = 0;
    for (const byPart of best.values()) {
      if (byPart.has(1)) part1 += 1;
      if (byPart.has(2) || byPart.has(3)) part2or3 += 1;
    }
    expect(part1).toBeGreaterThan(0);
    expect(part2or3).toBe(0); // 미래(Q2/Q3) 누설 없음
  });

  it('세션 종료 시점에는 part 별 베스트가 멤버십과 정합(누적)', () => {
    const tEnd = new Date('2024-03-01T17:30:00Z');
    const best = progressiveSegmentBests(laps, boundaries, tEnd);
    const withQ3 = [...best.values()].filter((m) => m.has(3)).length;
    // Q3 에서 플라잉 랩을 기록한 드라이버는 Q3 멤버십(10) 이하
    expect(withQ3).toBeLessThanOrEqual(10);
    expect(withQ3).toBeGreaterThan(0);
  });
});
