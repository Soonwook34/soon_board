// dashboard §2.5/§2.8/§3.3 — personal best selector. getAggregateBefore('personal_bests', t)
// 결과(Map<driver, PersonalBestRow>) 위의 named accessor. 누적 산정·미래 누설 컷은 DataSource +
// dashboardQueries 가 담당하므로 본 모듈은 순수 selector 만 (sectorColors 와 정합).

import type { AggregateResults } from '../../shared/openf1Types';

export function personalBestLap(agg: AggregateResults, driverNumber: number): number | null {
  return agg.personal_bests.get(driverNumber)?.best_lap_duration ?? null;
}
