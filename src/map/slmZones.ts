// live-map plan §10 단계 11 — SLM zone 렌더러 (정적 입력).
// activation 구간 polyline arc-segment 강조 + 'SLM ▶' 화살표. DRS 와 유사한 패턴이지만 색상/라벨 구분.
// drawSlmIndicator: 차량 마커 위 SLM 활성 표시 placeholder — 현재 OpenF1 X-mode 필드 없어 항상 noop.

import { color, font } from '../style/tokens.js';
import { sampleAtArcLength } from './arcLength.js';
import { applyViewport, type Point2D, type ViewportTransform } from './viewport.js';
import type { SlmZone, SlmZonesJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

export type { SlmZone, SlmZonesJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

const SLM_HIGHLIGHT_COLOR = '#a855f7'; // purple — visually distinct from DRS cyan
const SLM_HIGHLIGHT_WIDTH = 8;
const SLM_LABEL = 'SLM ▶';

export async function loadSlmZones(
  circuitKey: number,
  year: number,
  fetchImpl?: typeof fetch,
): Promise<SlmZonesJsonBase | null> {
  const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!f) throw new Error('loadSlmZones: fetch not available');
  const url = `/trackOutlines/slmZones_${circuitKey}-${year}.json`;
  const res = await f(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`loadSlmZones: HTTP ${res.status}`);
  return (await res.json()) as SlmZonesJsonBase;
}

export function drawSlmZones(
  ctx: CanvasRenderingContext2D,
  zones: readonly SlmZone[],
  polyline: readonly Point2D[],
  arcLengthTable: readonly number[],
  viewport: ViewportTransform,
): void {
  if (zones.length === 0) return;
  ctx.strokeStyle = SLM_HIGHLIGHT_COLOR;
  ctx.lineWidth = SLM_HIGHLIGHT_WIDTH;
  ctx.lineCap = 'round';
  for (const zone of zones) {
    strokeArcSegment(ctx, zone.s_start, zone.s_end, polyline, arcLengthTable, viewport);
  }
  ctx.fillStyle = color.textPrimary;
  ctx.font = `${font.weight.bold} ${font.size.xs} ${font.family}`;
  ctx.textBaseline = 'middle';
  for (const zone of zones) {
    const [px, py] = sampleAtArcLength(polyline, arcLengthTable, zone.s_start);
    const [cx, cy] = applyViewport([px, py], viewport);
    ctx.fillText(zone.label ?? SLM_LABEL, cx + 6, cy);
  }
}

function strokeArcSegment(
  ctx: CanvasRenderingContext2D,
  sStart: number,
  sEnd: number,
  polyline: readonly Point2D[],
  arcTable: readonly number[],
  viewport: ViewportTransform,
): void {
  if (arcTable.length < 2) return;
  ctx.beginPath();
  const [x0, y0] = sampleAtArcLength(polyline, arcTable, sStart);
  const [cx, cy] = applyViewport([x0, y0], viewport);
  ctx.moveTo(cx, cy);
  // sEnd < sStart 면 start/finish 를 가로지르는 wrap-around zone — start→총길이→0→end 로 walk.
  const wraps = sEnd < sStart;
  for (let i = 0; i < arcTable.length; i++) {
    const s = arcTable[i];
    const inSegment = wraps ? (s > sStart || s < sEnd) : (s > sStart && s < sEnd);
    if (inSegment) {
      const [vx, vy] = applyViewport(polyline[i], viewport);
      ctx.lineTo(vx, vy);
    }
  }
  const [xE, yE] = sampleAtArcLength(polyline, arcTable, sEnd);
  const [cxE, cyE] = applyViewport([xE, yE], viewport);
  ctx.lineTo(cxE, cyE);
  ctx.stroke();
}
