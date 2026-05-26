// live-map plan §5.3 — 매 렌더 프레임 arc-length lookup (20대 × log(600) × ~0.001 ms ≈ 0.2 ms/frame).
// binary search 로 s 가 속한 segment 구간을 찾아 polyline 위 정확한 좌표 lerp.

import type { Point2D } from './viewport.js';

/**
 * 누적 호 길이 s 에 해당하는 polyline 위 점 반환.
 * s ≤ 0 → polyline[0], s ≥ total_length → polyline[last] 로 clamp.
 */
export function sampleAtArcLength(
  polyline: readonly Point2D[],
  arcLengthTable: readonly number[],
  s: number,
): Point2D {
  if (polyline.length < 2) {
    throw new Error('sampleAtArcLength: polyline 은 최소 2 점 필요');
  }
  if (arcLengthTable.length !== polyline.length) {
    throw new Error('sampleAtArcLength: arcLengthTable.length 는 polyline.length 와 일치해야 함');
  }
  const last = polyline.length - 1;
  if (s <= arcLengthTable[0]) return polyline[0];
  if (s >= arcLengthTable[last]) return polyline[last];

  // binary search: 가장 큰 i 중 arcLengthTable[i] ≤ s 인 것
  let lo = 0;
  let hi = last;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (arcLengthTable[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segStart = arcLengthTable[lo];
  const segEnd = arcLengthTable[lo + 1];
  const segLen = segEnd - segStart;
  const t = segLen === 0 ? 0 : (s - segStart) / segLen;
  const [ax, ay] = polyline[lo];
  const [bx, by] = polyline[lo + 1];
  return [ax + t * (bx - ax), ay + t * (by - ay)];
}

/**
 * s 를 [0, totalLength) 로 정규화. 음수/초과 모두 modulo wrap.
 * 1랩 wrapping path-arc (plan §5.3) 에서 사용.
 */
export function wrapArcLength(s: number, totalLength: number): number {
  if (totalLength <= 0) throw new Error('wrapArcLength: totalLength > 0 필요');
  const r = s % totalLength;
  return r < 0 ? r + totalLength : r;
}
