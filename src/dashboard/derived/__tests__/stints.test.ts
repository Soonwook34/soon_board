// collectStints 단위 테스트 — getStintForLap 1..currentLap 순회 dedup + currentLap 컷 (미래 누설 zero).
import { describe, expect, it } from 'vitest';
import { collectStints } from '../stints';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { StintRecord } from '../../../shared/openf1Types';

function stint(p: Partial<StintRecord>): StintRecord {
  return { session_key: 1, meeting_key: 1, driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 1, compound: 'SOFT', tyre_age_at_start: 0, ...p };
}

function stintForLapOf(all: StintRecord[]) {
  return (driverNum: number, lap: number): StintRecord | null =>
    all.find((s) => s.driver_number === driverNum && lap >= s.lap_start && lap <= s.lap_end) ?? null;
}

const stints = [
  stint({ stint_number: 1, lap_start: 1, lap_end: 18, compound: 'SOFT' }),
  stint({ stint_number: 2, lap_start: 19, lap_end: 40, compound: 'HARD' }),
  stint({ stint_number: 3, lap_start: 41, lap_end: 55, compound: 'MEDIUM' }),
];
const ds = makeFakeDs({ getStintForLap: stintForLapOf(stints) }).ds;

describe('collectStints', () => {
  it('거쳐온 스틴트를 stint_number 로 dedup (lap 마다 반복돼도 1회)', () => {
    const result = collectStints(ds, 1, 18);
    expect(result).toHaveLength(1);
    expect(result[0].stint_number).toBe(1);
  });

  it('currentLap 컷: lap_start > currentLap 스틴트는 미수집', () => {
    expect(collectStints(ds, 1, 30).map((s) => s.stint_number)).toEqual([1, 2]); // 3 은 lap_start 41 > 30
    expect(collectStints(ds, 1, 55).map((s) => s.stint_number)).toEqual([1, 2, 3]);
  });

  it('currentLap <= 0 이면 빈 배열', () => {
    expect(collectStints(ds, 1, 0)).toEqual([]);
    expect(collectStints(ds, 1, -5)).toEqual([]);
  });
});
