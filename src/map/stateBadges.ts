// live-map plan §4.2 — driver 상태 분류 + 시각 인디케이터.
// Phase 7 MVP: normal / disconnected / retired (외부 hint 기반). pit-* 은 Phase 8 wire.
// 인수 7번: "연결 끊김 UI — 마지막 sample 1.5s 후 마커 dim 50% + ? 배지".

import { color } from '../style/tokens.js';
import type { PerDriverBuffer } from './PerDriverBuffer.js';
import type { Point2D } from './viewport.js';

export type DriverState =
  | 'normal'
  | 'disconnected'
  | 'retired'
  | 'pit-in-progress'
  | 'pit-stopped';

/** plan §4.2 '최근 sample 이 1.5s 이상 전' → 연결 끊김. */
export const GAP_DISCONNECT_MS = 1500;

/** Phase 12+ LiveDataSource 가 wire — Phase 7 default 는 모두 undefined. */
export interface ClassifyOpts {
  isDnf?: boolean;
  isInPit?: boolean;
  isPitStopped?: boolean;
}

export function classifyDriverState(
  buffer: PerDriverBuffer,
  driverNumber: number,
  displayTimeMs: number,
  opts?: ClassifyOpts,
): DriverState {
  // 우선순위 — 가장 결정적인 상태부터.
  if (opts?.isDnf) return 'retired';
  if (opts?.isPitStopped) return 'pit-stopped';
  if (opts?.isInPit) return 'pit-in-progress';

  const latestDate = buffer.latestSampleDate(driverNumber);
  if (latestDate === null) return 'normal'; // sample 0건 — drawMarker 호출 안 됨
  if (displayTimeMs - latestDate > GAP_DISCONNECT_MS) return 'disconnected';
  return 'normal';
}

/** '?' 배지 (disconnected 만). 마커 우상단 오프셋. 다른 state 는 no-op. */
export function drawStateBadge(
  ctx: CanvasRenderingContext2D,
  markerPosition: Point2D,
  state: DriverState,
  opts?: { markerRadius?: number },
): void {
  if (state !== 'disconnected') return;
  const r = (opts?.markerRadius ?? 9) * 0.55; // 배지 크기 — 마커 절반쯤
  const [x, y] = markerPosition;
  const bx = x + (opts?.markerRadius ?? 9) * 0.7;
  const by = y - (opts?.markerRadius ?? 9) * 0.7;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = color.textPrimary;
  ctx.fill();
  ctx.fillStyle = color.bgBase;
  ctx.font = `bold ${Math.round(r * 1.4)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', bx, by);
}
