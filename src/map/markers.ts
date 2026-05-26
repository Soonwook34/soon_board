// live-map plan §4.1 + §4.5.2 — 마커 그리기 (Phase 6 MVP: normal state 만).
// pit/dim/grayscale 상태별 표현은 Phase 7 (trails + stateBadges).
// SLM 활성화 placeholder 는 plan §4.5.2 — 데이터 입수 전 항상 false.

import { mapStyles } from './mapStyles.js';
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
}

export function drawMarker(ctx: CanvasRenderingContext2D, opts: MarkerDrawOpts): void {
  const size = opts.size ?? mapStyles.markerSizeMin;
  const radius = size / 2;
  const [x, y] = opts.position;

  // 원 (fill = teamColour, stroke = 흰 테두리)
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = opts.teamColour;
  ctx.fill();
  ctx.strokeStyle = mapStyles.markerBorderColor;
  ctx.lineWidth = mapStyles.markerBorderWidth;
  ctx.stroke();

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
}

/** plan §4.5.2 — OpenF1 X-mode 필드 입수 전까지 항상 false. */
export function drawSlmIndicator(_driverNum: number, _isActive: boolean): boolean {
  return false;
}
