// live-map plan §5.3 — 매 렌더 프레임 path-arc / raw-xy / wrapping / freeze 분기.
// Phase 5 는 순수 함수만 — PerDriverBuffer / RAF / Canvas 의존성 없음.
//
// 분기 우선순위 (plan §5.3 표):
//   1) s2 없음 OR sample 간 gap > GAP_FREEZE_MS → freeze (외삽 금지, plan §5.6)
//   2) 한쪽이라도 |n| > N_OFFTRACK → raw-xy lerp (트랙 밖, 실제 위치 보존)
//   3) s2.s < s1.s - WRAP_THRESHOLD_RATIO × total → wrapping path-arc (결승선 통과)
//   4) 기본 → path-arc lerp (호 따라 흐름)

import { sampleAtArcLength, wrapArcLength } from './arcLength.js';
import type { Point2D } from './viewport.js';

export interface DriverSample {
  /** ms since epoch (OpenF1 location.date). */
  date: number;
  /** SVG viewBox 좌표 (openf1_transform 적용 후). */
  rawXY: Point2D;
  /** projectToPolyline 결과 — 누적 호 길이. */
  s: number;
  /** projectToPolyline 결과 — 부호 있는 횡오프셋. */
  n: number;
}

export interface Thresholds {
  /** 정상 주행 인정 횡오프셋 (SVG viewBox 단위, ≈ 트랙 폭의 1/2). */
  N_TRACK: number;
  /** 오프트랙 fallback 임계 (≈ 트랙 폭). */
  N_OFFTRACK: number;
  /** sample 사이 gap freeze 임계 (ms). */
  GAP_FREEZE_MS: number;
  /** 1랩 wrap 감지 비율 (total_length 의 비율). */
  WRAP_THRESHOLD_RATIO: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  N_TRACK: 8,
  N_OFFTRACK: 15,
  GAP_FREEZE_MS: 1500,
  WRAP_THRESHOLD_RATIO: 0.8,
};

export type InterpolationKind = 'path-arc' | 'raw-xy' | 'wrapping' | 'freeze';

export interface InterpolationResult {
  kind: InterpolationKind;
  position: Point2D;
}

export interface InterpolationContext {
  polyline: readonly Point2D[];
  arcLengthTable: readonly number[];
  totalLength: number;
  thresholds?: Partial<Thresholds>;
}

export function interpolatePosition(
  s1: DriverSample,
  s2: DriverSample | null,
  displayTimeMs: number,
  ctx: InterpolationContext,
): InterpolationResult {
  const th = { ...DEFAULT_THRESHOLDS, ...ctx.thresholds };

  // (1) freeze
  if (s2 === null || s2.date - s1.date > th.GAP_FREEZE_MS) {
    return { kind: 'freeze', position: s1.rawXY };
  }

  const dt = s2.date - s1.date;
  const u = dt <= 0 ? 0 : clamp01((displayTimeMs - s1.date) / dt);

  // (2) raw-xy fallback (오프트랙). 의도적으로 wrapping 보다 우선 — 결승선에서 오프트랙은 실주행 거의 없음.
  if (Math.abs(s1.n) > th.N_OFFTRACK || Math.abs(s2.n) > th.N_OFFTRACK) {
    return { kind: 'raw-xy', position: lerpPoint(s1.rawXY, s2.rawXY, u) };
  }

  // (3) wrapping path-arc
  if (s2.s < s1.s - th.WRAP_THRESHOLD_RATIO * ctx.totalLength) {
    const sNow = wrapArcLength(s1.s + u * (s2.s + ctx.totalLength - s1.s), ctx.totalLength);
    return { kind: 'wrapping', position: sampleAtArcLength(ctx.polyline, ctx.arcLengthTable, sNow) };
  }

  // (4) 기본 path-arc
  const sNow = s1.s + u * (s2.s - s1.s);
  return { kind: 'path-arc', position: sampleAtArcLength(ctx.polyline, ctx.arcLengthTable, sNow) };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function lerpPoint(a: Point2D, b: Point2D, u: number): Point2D {
  return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
}
