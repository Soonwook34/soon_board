// dashboard §2.5 — 섹터 색 판정 **단일 정의(SSOT)**. 리더보드 LAST, 디테일 §3.2/§3.3,
// 빠른 랩 배지 ⑧ 네 곳이 모두 본 함수를 사용 (인수 13: 4곳 색 일관성).
//
// 색 의미:
//  - 보라(#A855F7): 그 섹터의 세션 전체 최고 (overall best)
//  - 초록(#10B981): 그 드라이버 본인 최고 (personal best) 단, overall best 는 아님
//  - 노랑(#F59E0B): 그 외 (본인 베스트보다 느림)
//  - 회색(#374151): 미주행/데이터 없음 (null) — 인수 16
//
// raw hex 는 F1 방송 표준색이라 인수 19 예외. 판정은 getAggregateBefore(t) 결과만 사용하므로
// 시크해도 t 까지의 누적으로 일관 (인수 14).

import type { AggregateResults } from '../../shared/openf1Types';

export const SECTOR_COLORS = {
  overall: '#A855F7',
  personal: '#10B981',
  other: '#F59E0B',
  none: '#374151',
} as const;

export type SectorColorKind = keyof typeof SECTOR_COLORS;
export type SectorIndex = 1 | 2 | 3;

/** float 동등 비교 — best 는 같은 lap 의 같은 float 이라 정확히 일치하지만 재파생 대비 epsilon. */
function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

function overallSector(agg: AggregateResults, s: SectorIndex) {
  return s === 1 ? agg.purple_sectors.s1 : s === 2 ? agg.purple_sectors.s2 : agg.purple_sectors.s3;
}

function personalSector(agg: AggregateResults, driver: number, s: SectorIndex): number | null {
  const pb = agg.personal_bests.get(driver);
  if (!pb) return null;
  return s === 1 ? pb.best_sector_1 : s === 2 ? pb.best_sector_2 : pb.best_sector_3;
}

export function sectorColorKind(
  agg: AggregateResults,
  driverNumber: number,
  sector: SectorIndex,
  value: number | null | undefined,
): SectorColorKind {
  if (value == null) return 'none';
  const overall = overallSector(agg, sector);
  if (overall && approxEq(value, overall.sector_duration)) return 'overall';
  const pb = personalSector(agg, driverNumber, sector);
  if (pb != null && approxEq(value, pb)) return 'personal';
  return 'other';
}

export function sectorColor(
  agg: AggregateResults,
  driverNumber: number,
  sector: SectorIndex,
  value: number | null | undefined,
): string {
  return SECTOR_COLORS[sectorColorKind(agg, driverNumber, sector, value)];
}
