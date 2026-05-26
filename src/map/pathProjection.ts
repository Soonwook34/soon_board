// live-map plan §5.2 — sample 수신 시 closest-point on polyline projection.
// brute-force O(N segments), N ~ 600 → 0.01~0.03 ms (V8). KD-tree 등 spatial index 불필요 (plan §5.7).
//
// 출력 (s, n):
//   s — polyline 진행 방향 누적 호 길이 (arc_length_table 기반)
//   n — 부호 있는 횡오프셋. 2D cross product (B-A) × (P-A) > 0 인 쪽이 +n.
//       SVG viewBox (+y down) 좌표계에서는 cross > 0 가 polyline 진행 방향 기준 "시계 방향 (시각적으로 오른쪽)".
//       부호 자체는 일관되기만 하면 fallback 분기(|n| > N_OFFTRACK)는 동작 — 시각적 좌/우 의미는 test 에서 명시.

import type { Point2D } from './viewport.js';

export interface ProjectionResult {
  /** polyline 진행 방향 누적 호 길이 (arc_length_table 단위). */
  s: number;
  /** 부호 있는 횡오프셋. 시계방향 = +, 반시계 = - (SVG +y down 기준). */
  n: number;
  /** 가장 가까운 segment 의 시작 index (polyline[segIdx] - polyline[segIdx+1]). */
  segIdx: number;
  /** polyline 위 closest-point 좌표. */
  projected: Point2D;
}

export function projectToPolyline(
  point: Point2D,
  polyline: readonly Point2D[],
  arcLengthTable: readonly number[],
): ProjectionResult {
  if (polyline.length < 2) {
    throw new Error('projectToPolyline: polyline 은 최소 2 점 필요');
  }
  if (arcLengthTable.length !== polyline.length) {
    throw new Error('projectToPolyline: arcLengthTable.length 는 polyline.length 와 일치해야 함');
  }
  const [px, py] = point;
  let bestD2 = Infinity;
  let bestSegIdx = 0;
  let bestT = 0;
  let bestSegLen = 0;
  let bestProjX = polyline[0][0];
  let bestProjY = polyline[0][1];
  let bestCross = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [ax, ay] = polyline[i];
    const [bx, by] = polyline[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    if (len2 === 0) continue;
    const apx = px - ax;
    const apy = py - ay;
    const tRaw = (apx * abx + apy * aby) / len2;
    const t = tRaw < 0 ? 0 : tRaw > 1 ? 1 : tRaw;
    const projX = ax + t * abx;
    const projY = ay + t * aby;
    const dx = px - projX;
    const dy = py - projY;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestSegIdx = i;
      bestT = t;
      bestSegLen = Math.sqrt(len2);
      bestProjX = projX;
      bestProjY = projY;
      bestCross = abx * apy - aby * apx;
    }
  }

  const s = arcLengthTable[bestSegIdx] + bestT * bestSegLen;
  const distance = Math.sqrt(bestD2);
  const n = bestCross >= 0 ? distance : -distance;
  return { s, n, segIdx: bestSegIdx, projected: [bestProjX, bestProjY] };
}
