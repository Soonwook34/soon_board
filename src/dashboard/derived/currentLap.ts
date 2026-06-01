// dashboard §2.2 — display_time 기준 leader 의 현재 lap. 진행률 바 "lap N / M" 의 N.
// 리더 = position==1 인 driver (date≤t 최신). 그 driver 의 getLapAt(t).lap_number.
// 모든 시간 컷은 DataSource 메서드가 보장 (인수 18 단일 진입점, §4.5 미래 누설 zero).

import type { DataSource } from '../../shared/DataSource';

/** position==1 인 리더의 driver_number (date≤t 최신). 없으면 null. */
export function leaderDriverNumber(ds: DataSource, t: Date): number | null {
  const leader = ds.getLatestBefore('position', t, { position: 1 });
  return leader ? leader.driver_number : null;
}

/** 리더의 현재 lap 번호. 리더/랩 데이터 없으면 null (UI 는 "L??" 표시). */
export function leaderCurrentLap(ds: DataSource, t: Date): number | null {
  const driver = leaderDriverNumber(ds, t);
  if (driver == null) return null;
  const lap = ds.getLapAt(driver, t);
  return lap ? lap.lap_number : null;
}
