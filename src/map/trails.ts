// live-map plan §4.3 — 차량 트레일 (1.5초 alpha fade-out 윈도우).
//
// 두 함수:
//   - collectTrailPoints: PerDriverBuffer 의 최근 1.5s sample 들을 canvas 좌표로 변환
//   - drawTrail: points 배열을 segment 별 alpha gradient 로 stroke (순수 렌더)

import type { PerDriverBuffer } from './PerDriverBuffer.js';
import type { Point2D, ViewportTransform } from './viewport.js';
import { applyViewport } from './viewport.js';

/** plan §4.3 '직전 ~1.5초 경로'. */
export const TRAIL_WINDOW_MS = 1500;

export interface TrailDrawOpts {
  color: string;
  lineWidth: number;
  /** 가장 오래된 점의 alpha (보통 0). */
  alphaStart: number;
  /** 가장 최근 점의 alpha (보통 0.3). */
  alphaEnd: number;
}

/**
 * 트레일 polyline 그리기. points 가 < 2 면 no-op.
 * segment 마다 globalAlpha 를 linear interpolate.
 * 종료 시 globalAlpha 를 1.0 으로 복원.
 */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  points: readonly Point2D[],
  opts: TrailDrawOpts,
): void {
  if (points.length < 2) return;
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.lineWidth;
  ctx.lineCap = 'round';
  const n = points.length - 1; // segment 수
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[i + 1];
    // segment 의 alpha = 두 점 alpha 의 평균. point i 의 alpha = lerp(alphaStart, alphaEnd, i/n).
    const alphaA = lerp(opts.alphaStart, opts.alphaEnd, i / n);
    const alphaB = lerp(opts.alphaStart, opts.alphaEnd, (i + 1) / n);
    ctx.globalAlpha = (alphaA + alphaB) / 2;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/**
 * 최근 TRAIL_WINDOW_MS 안의 sample 들을 canvas 좌표로 변환.
 * projectSamplePosition: DriverSample → SVG viewBox Point2D (caller 가 interpolation 와 동일한 좌표 공간 사용).
 */
export function collectTrailPoints(
  buffer: PerDriverBuffer,
  driverNumber: number,
  displayTimeMs: number,
  viewport: ViewportTransform,
  /** SVG viewBox 좌표 추출 함수. 보통 sample.rawXY (이미 viewBox 공간). */
  projectSamplePosition: (s: import('./interpolation.js').DriverSample) => Point2D = (s) => s.rawXY,
): readonly Point2D[] {
  const recent = buffer.recentSamples(driverNumber, displayTimeMs, TRAIL_WINDOW_MS);
  return recent.map((s) => applyViewport(projectSamplePosition(s), viewport));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
