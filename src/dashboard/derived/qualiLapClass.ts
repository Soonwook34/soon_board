// 퀄리파잉 랩 분류 — qualifying-session-dashboard.md §3.3 / US-006.
// OpenF1 laps.is_pit_out_lap(아웃랩) + /pit(인랩=핏 진입 랩) 으로 랩 종류를 판정한다.
// 세그먼트 베스트 비교는 'flying'(아웃/인/미완 제외) 만 대상으로 한다.

import type { LapRecord, PitRecord } from '../../shared/openf1Types';

export type QualiLapClass = 'out' | 'in' | 'flying' | 'incomplete';

/** 드라이버의 핏 진입 랩 번호 집합 — in-lap 판정용. */
export function pitLapSet(pitRecords: readonly PitRecord[], driverNumber: number): Set<number> {
  const s = new Set<number>();
  for (const p of pitRecords) if (p.driver_number === driverNumber) s.add(p.lap_number);
  return s;
}

/** 드라이버별 핏 진입 랩 번호 맵 (number → Set<lap_number>). */
export function pitLapsByDriver(pitRecords: readonly PitRecord[]): Map<number, Set<number>> {
  const m = new Map<number, Set<number>>();
  for (const p of pitRecords) {
    let s = m.get(p.driver_number);
    if (!s) {
      s = new Set<number>();
      m.set(p.driver_number, s);
    }
    s.add(p.lap_number);
  }
  return m;
}

/**
 * 랩 종류 판정. 우선순위: out(아웃랩) → in(핏 진입 랩) → flying(유효 랩타임) → incomplete(미완/null).
 * pitLaps 는 해당 드라이버의 핏 진입 랩 번호 집합(없으면 빈 집합 전달).
 */
export function classifyLap(lap: LapRecord, pitLaps: ReadonlySet<number>): QualiLapClass {
  if (lap.is_pit_out_lap) return 'out';
  if (pitLaps.has(lap.lap_number)) return 'in';
  if (typeof lap.lap_duration === 'number' && lap.lap_duration > 0) return 'flying';
  return 'incomplete';
}

/** 세그먼트 베스트 비교 대상(플라잉 랩)인지 — out/in/incomplete 제외. */
export function isComparableLap(lap: LapRecord, pitLaps: ReadonlySet<number>): boolean {
  return classifyLap(lap, pitLaps) === 'flying';
}
