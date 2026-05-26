// live-map plan §1.4 — (circuit_key, year) → layout_file 조회.
// OpenF1 circuit_key 는 물리적 venue 단위이므로 레이아웃 변경 시에도 같은 key 유지.
// 미등록 circuit_key 또는 미매칭 year 는 null 반환 → caller 가 기본 {key}-{year}.json convention 으로 fallback.

import rawLayoutVersions from './layoutVersions.json';

export interface LayoutRange {
  year_start: number;
  /** null 은 open-ended (현재 진행 중). */
  year_end: number | null;
  layout_file: string;
}

export interface LayoutVersionsEntry {
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  ranges: LayoutRange[];
}

export const LAYOUT_VERSIONS: readonly LayoutVersionsEntry[] =
  rawLayoutVersions as readonly LayoutVersionsEntry[];

export function resolveLayout(circuitKey: number, year: number): string | null {
  const entry = LAYOUT_VERSIONS.find((e) => e.circuit_key === circuitKey);
  if (!entry) return null;
  const range = entry.ranges.find(
    (r) => year >= r.year_start && (r.year_end === null || year <= r.year_end),
  );
  return range?.layout_file ?? null;
}
