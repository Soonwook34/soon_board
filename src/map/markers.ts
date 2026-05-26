// live-map plan §4.1 + §4.5.2 — 마커 그리기 (Phase 6 MVP: normal state 만).
// pit/dim/grayscale 상태별 표현은 Phase 7 (trails + stateBadges).
// SLM 활성화 placeholder 는 plan §4.5.2 — 데이터 입수 전 항상 false.

import { mapStyles } from './mapStyles.js';
import type { DriverState } from './stateBadges.js';
import type { Point2D } from './viewport.js';

export interface MarkerDrawOpts {
  position: Point2D;
  /** F1 팀 색 hex (drivers.team_colour, # prefix 포함). raw hex 예외 — 토큰화 안 함. */
  teamColour: string;
  driverNumber: number;
  nameAcronym: string;
  showLabel: boolean;
  /** 직경 px. 미지정 시 mapStyles.markerSizeMin. */
  size?: number;
  /** plan §4.2 상태별 표현 — Phase 7. default 'normal'. */
  state?: DriverState;
}

export function drawMarker(ctx: CanvasRenderingContext2D, opts: MarkerDrawOpts): void {
  const state = opts.state ?? 'normal';
  const baseSize = opts.size ?? mapStyles.markerSizeMin;
  const size = state === 'pit-stopped' ? baseSize * mapStyles.pitStoppedScale : baseSize;
  const radius = size / 2;
  const [x, y] = opts.position;
  const fillColor = state === 'retired' ? mapStyles.retiredFill : opts.teamColour;

  // disconnected → dim 50% 동안만 (배지/라벨은 일반 alpha 로 그림)
  if (state === 'disconnected') ctx.globalAlpha = mapStyles.disconnectedAlpha;

  // 원 (fill = teamColour/grayscale, stroke = 흰 테두리 / pit-in-progress 면 점선)
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fillColor;
  ctx.fill();
  if (state === 'pit-in-progress') ctx.setLineDash([...mapStyles.pitDashPattern]);
  ctx.strokeStyle = mapStyles.markerBorderColor;
  ctx.lineWidth = mapStyles.markerBorderWidth;
  ctx.stroke();
  if (state === 'pit-in-progress') ctx.setLineDash([]);

  // driver_number (중앙)
  ctx.fillStyle = mapStyles.markerBorderColor; // 흰색
  ctx.font = `${mapStyles.driverNumberFontWeight} ${Math.round(size * 0.55)}px ${mapStyles.driverNumberFontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(opts.driverNumber), x, y);

  // 라벨 (선택)
  if (opts.showLabel) {
    ctx.fillStyle = mapStyles.labelColor;
    ctx.font = `${mapStyles.labelFontSize} ${mapStyles.driverNumberFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.nameAcronym, x, y + radius + mapStyles.labelOffsetPx);
  }

  if (state === 'disconnected') ctx.globalAlpha = 1;
}

/** plan §4.5.2 — OpenF1 X-mode 필드 입수 전까지 항상 false. */
export function drawSlmIndicator(_driverNum: number, _isActive: boolean): boolean {
  return false;
}
