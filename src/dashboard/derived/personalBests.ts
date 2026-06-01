// dashboard §2.5/§2.8/§3.3 — personal best selector. getAggregateBefore('personal_bests', t)
// 결과(Map<driver, PersonalBestRow>) 위의 named accessor. 누적 산정·미래 누설 컷은 DataSource +
// dashboardQueries 가 담당하므로 본 모듈은 순수 selector 만 (sectorColors 와 정합).

import type { AggregateResults, PersonalBestRow } from '../../shared/openf1Types';
import type { SectorIndex } from '../shared/sectorColors';

export function personalBestFor(agg: AggregateResults, driverNumber: number): PersonalBestRow | null {
  return agg.personal_bests.get(driverNumber) ?? null;
}

export function personalBestLap(agg: AggregateResults, driverNumber: number): number | null {
  return agg.personal_bests.get(driverNumber)?.best_lap_duration ?? null;
}

export function personalBestSector(
  agg: AggregateResults,
  driverNumber: number,
  sector: SectorIndex,
): number | null {
  const pb = agg.personal_bests.get(driverNumber);
  if (!pb) return null;
  return sector === 1 ? pb.best_sector_1 : sector === 2 ? pb.best_sector_2 : pb.best_sector_3;
}
