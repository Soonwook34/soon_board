// live-map plan §10 단계 10 — DRS zone 렌더러 (historical 전용).
// activation 구간을 polyline arc-segment 강조 + detection 위치 'DRS ▶' 화살표.
// LiveMapRenderer 가 drsEnabled=false 일 때 호출하지 않음 (live mode 게이트).

import { color, font } from '../style/tokens.js';
import { sampleAtArcLength } from './arcLength.js';
import { applyViewport, type Point2D, type ViewportTransform } from './viewport.js';
import type { DrsZone, DrsZonesJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

export type { DrsZone, DrsZonesJsonBase } from '../../scripts/_lib/trackOutlinesSchema.js';

const DRS_HIGHLIGHT_COLOR = '#22d3ee'; // cyan — visible against bgElevated track
const DRS_HIGHLIGHT_WIDTH = 8;
const DRS_LABEL = 'DRS ▶';

export async function loadDrsZones(
  circuitKey: number,
  year: number,
  fetchImpl?: typeof fetch,
): Promise<DrsZonesJsonBase | null> {
  const f = fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!f) throw new Error('loadDrsZones: fetch not available');
  const url = `/trackOutlines/drsZones_${circuitKey}-${year}.json`;
  const res = await f(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`loadDrsZones: HTTP ${res.status}`);
  return (await res.json()) as DrsZonesJsonBase;
}

export interface DrawDrsZonesOptions {
  showDetection?: boolean;
}

export function drawDrsZones(
  ctx: CanvasRenderingContext2D,
  zones: readonly DrsZone[],
  polyline: readonly Point2D[],
  arcLengthTable: readonly number[],
  viewport: ViewportTransform,
  opts: DrawDrsZonesOptions = {},
): void {
  if (zones.length === 0) return;
  ctx.strokeStyle = DRS_HIGHLIGHT_COLOR;
  ctx.lineWidth = DRS_HIGHLIGHT_WIDTH;
  ctx.lineCap = 'round';
  for (const zone of zones) {
    strokeArcSegment(ctx, zone.activation_s_start, zone.activation_s_end, polyline, arcLengthTable, viewport);
  }
  if (opts.showDetection !== false) {
    ctx.fillStyle = color.textPrimary;
    ctx.font = `${font.weight.bold} ${font.size.xs} ${font.family}`;
    ctx.textBaseline = 'middle';
    for (const zone of zones) {
      const [px, py] = sampleAtArcLength(polyline, arcLengthTable, zone.detection_s);
      const [cx, cy] = applyViewport([px, py], viewport);
      ctx.fillText(DRS_LABEL, cx + 6, cy);
    }
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
  // sEnd < sStart 면 start/finish 라인을 가로지르는 wrap-around zone — start→총길이→0→end 로 walk.
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
