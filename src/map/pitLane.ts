// live-map plan §5.5 — runtime 핏레인 polyline 로드 + 진입/퇴출 판정.
// Phase 8: scripts/trace-pitlane.ts 산출물 (pitlane_{key}-{year}.json) 을 brower 에서 fetch.

import { projectToPolyline } from './pathProjection.js';
import type { PitlaneJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';
import type { Point2D } from './viewport.js';

/** browser-facing pitlane JSON — scripts 의 PitlaneJson (meta 포함) 의 상위 type. */
export type PitlaneJson = PitlaneJsonBase;
export type { PitlaneJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

/**
 * plan §5.5 — 정상 트랙 polyline projection 시 |n| > N_OFFTRACK 이고 핏 이벤트가 진행 중이면
 * 핏레인 polyline 으로 전환. PITLANE_PROXIMITY 는 핏레인 polyline 에 가깝다고 판정할 임계 (≈ N_OFFTRACK 의 2/3).
 */
export const PITLANE_PROXIMITY = 10;

export async function loadPitlane(
  circuitKey: number,
  year: number,
  fetchImpl?: typeof fetch,
): Promise<PitlaneJson | null> {
  const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!f) throw new Error('loadPitlane: fetch not available');
  const url = `/trackOutlines/pitlane_${circuitKey}-${year}.json`;
  const res = await f(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`loadPitlane: HTTP ${res.status}`);
  return (await res.json()) as PitlaneJson;
}

/** projectToPolyline 결과 |n| < threshold 이면 핏레인 위 (또는 인접) 로 판정. */
export function isInPitlane(
  point: Point2D,
  pitlanePolyline: readonly Point2D[],
  pitlaneArcTable: readonly number[],
  threshold: number = PITLANE_PROXIMITY,
): boolean {
  if (pitlanePolyline.length < 2) return false;
  const proj = projectToPolyline(point, pitlanePolyline, pitlaneArcTable);
  return Math.abs(proj.n) < threshold;
}
