// live-map plan §4.1 + §4.5.2 — 마커 그리기.
// 디자인: 단색 팀 컬러 원 + 흰 테두리 + 부드러운 드롭 섀도우 (깊이),
// 중앙에 굵은 driver_number, 라벨은 다크 chip 위에 흰 텍스트.

import { mapStyles } from './mapStyles.js';
import type { DriverState } from './stateBadges.js';
import type { Point2D } from './viewport.js';

export interface MarkerDrawOpts {
  position: Point2D;
  /** F1 팀 색 hex (drivers.team_colour, # prefix 포함). */
  teamColour: string;
  driverNumber: number;
  nameAcronym: string;
  showLabel: boolean;
  /** 직경 px. 미지정 시 mapStyles.markerSizeMin. */
  size?: number;
  /** plan §4.2 상태별 표현. default 'normal'. */
  state?: DriverState;
}

export function drawMarker(ctx: CanvasRenderingContext2D, opts: MarkerDrawOpts): void {
  const state = opts.state ?? 'normal';
  const baseSize = opts.size ?? mapStyles.markerSizeMin;
  const size = state === 'pit-stopped' ? baseSize * mapStyles.pitStoppedScale : baseSize;
  const radius = size / 2;
  const [x, y] = opts.position;
  const fillColor = state === 'retired' ? mapStyles.retiredFill : opts.teamColour;

  // save/restore 로 모든 ctx state (alpha/shadow/font/textAlign/baseline/lineDash) 격리 —
  // disconnected/pit-in-progress 분기에서 cleanup 누락 가능성 (예외/리팩터링) 차단.
  ctx.save();
  try {
    if (state === 'disconnected') ctx.globalAlpha = mapStyles.disconnectedAlpha;

    // 드롭 섀도우는 fill 에만 적용 → stroke/text 는 선명하게 (shadow 끄고 다시 그림).
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fillColor;
    ctx.shadowColor = mapStyles.markerShadowColor;
    ctx.shadowBlur = mapStyles.markerShadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = mapStyles.markerShadowOffsetY;
    ctx.fill();
    // 섀도우 해제 (테두리·텍스트는 깨끗하게). restore 가 잡아주지만, stroke/text 가
    // 같은 save() 안에서 shadow 없이 그려져야 하므로 명시적 reset 도 필요.
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    if (state === 'pit-in-progress') ctx.setLineDash([...mapStyles.pitDashPattern]);
    ctx.strokeStyle = mapStyles.markerBorderColor;
    ctx.lineWidth = mapStyles.markerBorderWidth;
    ctx.stroke();
    if (state === 'pit-in-progress') ctx.setLineDash([]);

    // driver_number (중앙) — fill 위 contrast 위해 항상 흰색.
    ctx.fillStyle = mapStyles.driverNumberColor;
    ctx.font = `${mapStyles.driverNumberFontWeight} ${Math.round(size * 0.55)}px ${mapStyles.driverNumberFontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(opts.driverNumber), x, y);

    // 라벨 chip — 다크 배경 + 흰 텍스트로 다크 트랙 위에서도 가독성 확보.
    if (opts.showLabel) {
      const labelPx = parseInt(mapStyles.labelFontSize, 10) || 11;
      ctx.font = `${mapStyles.driverNumberFontWeight} ${labelPx}px ${mapStyles.driverNumberFontFamily}`;
      // measureText 가 미구현(테스트 Proxy)일 때 fallback — 평균 글자 폭 0.6em 추정.
      const measured = ctx.measureText?.(opts.nameAcronym);
      const textWidth = measured?.width ?? opts.nameAcronym.length * labelPx * 0.6;
      const chipW = textWidth + mapStyles.labelChipPaddingX * 2;
      const chipH = labelPx + mapStyles.labelChipPaddingY * 2;
      const chipX = x - chipW / 2;
      const chipY = y + radius + mapStyles.labelOffsetPx;
      drawRoundRect(ctx, chipX, chipY, chipW, chipH, chipH / 2, mapStyles.labelChipFill);
      ctx.fillStyle = mapStyles.labelColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(opts.nameAcronym, x, chipY + mapStyles.labelChipPaddingY);
    }
  } finally {
    ctx.restore();
  }
}

/** Pill-shaped chip 배경. ctx.roundRect 가 없는 환경(jsdom)에서 fallback 호환. */
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** plan §4.5.2 — OpenF1 X-mode 필드 입수 전까지 항상 false. */
export function drawSlmIndicator(_driverNum: number, _isActive: boolean): boolean {
  return false;
}
