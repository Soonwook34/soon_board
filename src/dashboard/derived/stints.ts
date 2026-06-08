// dashboard — stints 는 undated lap-keyed endpoint → getStintForLap 을 1..currentLap 순회해 거쳐온
// 스틴트를 stint_number 로 dedup 수집. currentLap 이 시간 컷이라 미래 누설 zero (lap_start > currentLap
// 스틴트는 조회되지 않음). TyreStrategy(⑥) · StintHistory(§3.5) 공용. 정렬은 호출처가 담당.

import type { DataSource } from '../../shared/DataSource';
import type { StintRecord } from '../../shared/openf1Types';

/** 드라이버가 1..currentLap 동안 거쳐온 스틴트(stint_number dedup, 미정렬). currentLap ≤ 0 이면 빈 배열. */
export function collectStints(
  ds: DataSource,
  driverNumber: number,
  currentLap: number,
): StintRecord[] {
  const byStint = new Map<number, StintRecord>();
  for (let lap = 1; lap <= currentLap; lap++) {
    const s = ds.getStintForLap(driverNumber, lap);
    if (s && !byStint.has(s.stint_number)) byStint.set(s.stint_number, s);
  }
  return [...byStint.values()];
}
