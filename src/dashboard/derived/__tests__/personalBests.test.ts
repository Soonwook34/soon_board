// US-7 보강 — personalBests selector (getAggregateBefore 결과 위 접근자).
import { describe, expect, it } from 'vitest';
import { personalBestFor, personalBestLap, personalBestSector } from '../personalBests';
import type { AggregateResults } from '../../../shared/openf1Types';

const agg: AggregateResults = {
  fastest_lap: null,
  purple_sectors: { s1: null, s2: null, s3: null },
  personal_bests: new Map([
    [44, { driver_number: 44, best_lap_duration: 88.1, best_sector_1: 29, best_sector_2: 29.5, best_sector_3: 30 }],
  ]),
};

describe('personalBests selectors', () => {
  it('personalBestFor — 존재/미존재', () => {
    expect(personalBestFor(agg, 44)?.best_lap_duration).toBe(88.1);
    expect(personalBestFor(agg, 1)).toBeNull();
  });

  it('personalBestLap', () => {
    expect(personalBestLap(agg, 44)).toBe(88.1);
    expect(personalBestLap(agg, 1)).toBeNull();
  });

  it('personalBestSector — 섹터별', () => {
    expect(personalBestSector(agg, 44, 1)).toBe(29);
    expect(personalBestSector(agg, 44, 2)).toBe(29.5);
    expect(personalBestSector(agg, 44, 3)).toBe(30);
    expect(personalBestSector(agg, 1, 1)).toBeNull();
  });
});
