// live-map plan §10 단계 9 — Sector boundary 렌더러 (browser).
// 작은 캔버스 (< 400px) 자동 숨김 (§4.5.3). 색상: S1 red, S2 blue, S3 yellow.

import { color } from '../style/tokens.js';
import { applyViewport, type Point2D, type ViewportTransform } from './viewport.js';
import type { SectorBoundary, SectorsJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

export type { SectorBoundary, SectorsJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

const SMALL_CANVAS_THRESHOLD = 400;
const BOUNDARY_MARK_RADIUS_PX = 6;
const BOUNDARY_STROKE_WIDTH = 2;

export const sectorColors: Record<1 | 2 | 3, string> = {
  1: color.live, // red
  2: color.upcoming, // blue
  3: '#fbbf24', // yellow (start/finish)
};

export async function loadSectorBoundaries(
  circuitKey: number,
  year: number,
  fetchImpl?: typeof fetch,
): Promise<SectorsJsonBase | null> {
  const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!f) throw new Error('loadSectorBoundaries: fetch not available');
  const url = `/trackOutlines/sectors_${circuitKey}-${year}.json`;
  const res = await f(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`loadSectorBoundaries: HTTP ${res.status}`);
  return (await res.json()) as SectorsJsonBase;
}

export interface DrawSectorBoundariesOptions {
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * 각 경계 위치에 색상 원 + 짧은 stroke 선 — track polyline 위에 마커처럼.
 * 캔버스 한 변이 SMALL_CANVAS_THRESHOLD 미만이면 그리지 않음.
 */
export function drawSectorBoundaries(
  ctx: CanvasRenderingContext2D,
  boundaries: readonly SectorBoundary[],
  viewport: ViewportTransform,
  opts: DrawSectorBoundariesOptions,
): void {
  if (opts.canvasWidth < SMALL_CANVAS_THRESHOLD || opts.canvasHeight < SMALL_CANVAS_THRESHOLD) {
    return;
  }
  for (const b of boundaries) {
    const [px, py] = applyViewport(b.end_xy as Point2D, viewport);
    ctx.fillStyle = sectorColors[b.sector];
    ctx.strokeStyle = color.textPrimary;
    ctx.lineWidth = BOUNDARY_STROKE_WIDTH;
    ctx.beginPath();
    ctx.arc(px, py, BOUNDARY_MARK_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
