// 시즌 picker 기본값 결정 — plan main-page-implementation.md §16 미해결 1번 정책.
// 정책:
//   1. URL/사용자가 명시한 ui.season이 있으면 그것 (off-season 보존 의도 존중)
//   2. index의 가용 시즌 중 max year (현재 시즌이 빌드되어 있으면 그것)
//   3. 둘 다 없으면 null (시즌 picker 비활성, 그리드 빈 상태)

import type { SeasonsIndex } from '../shared/seasonData';

export function selectInitialSeason(
  index: SeasonsIndex | null,
  uiSeason: number | null,
): number | null {
  if (uiSeason !== null) return uiSeason;
  if (!index || index.seasons.length === 0) return null;
  return index.seasons.reduce((max, s) => (s.year > max ? s.year : max), -Infinity);
}
