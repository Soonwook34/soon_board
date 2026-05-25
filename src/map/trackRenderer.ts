// Canvas 2D 정적 트랙 렌더 — live-map §2.3 + §2.4.
//
// Phase 3 에서는 매 프레임 호출하지 않음 — viewport 가 변경(resize)될 때만 재호출.
// Phase 6 LiveMapRenderer 가 도착하면 본 함수의 결과를 offscreen canvas 에 캐시해
// 매 프레임 blit + 마커만 dynamic 으로 다시 그림 (live-map §2.4 더블 버퍼링).
//
// pitlane 은 optional — Phase 8 산출물. Phase 3 에서는 메인 트랙만 그리고 pitlane 미사용.

import { mapStyles } from './mapStyles.js';
import { applyViewport, type Point2D, type ViewportTransform } from './viewport.js';

export interface RenderStaticTrackInput {
  /** canvas 2D context. */
  ctx: CanvasRenderingContext2D;
  /** canvas 픽셀 크기. clearRect/fillRect 범위 결정. */
  canvasWidth: number;
  canvasHeight: number;
  /** SVG viewBox 좌표의 메인 트랙 polyline. trackOutlines/{key}-{year}.json 의 polyline 필드. */
  polyline: readonly Point2D[];
  /** SVG → canvas 변환. computeViewport 산출. */
  viewport: ViewportTransform;
  /** optional 핏레인 polyline (Phase 8 산출물). */
  pitlane?: readonly Point2D[];
  /** Styles override (테스트용). 기본 mapStyles. */
  styles?: typeof mapStyles;
}

/**
 * canvas 에 정적 트랙 (+ 옵션 핏레인) 을 렌더한다.
 * 호출 순서: clearRect → fillRect(배경) → stroke(트랙) → (옵션) stroke(핏레인 dashed)
 */
export function renderStaticTrack(input: RenderStaticTrackInput): void {
  const styles = input.styles ?? mapStyles;
  const { ctx, canvasWidth, canvasHeight, polyline, viewport, pitlane } = input;

  if (polyline.length < 2) {
    throw new Error(`renderStaticTrack: polyline length < 2 (got ${polyline.length})`);
  }

  // 1) 배경
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = styles.bgPrimary;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2) 메인 트랙
  strokePolyline(ctx, polyline, viewport, {
    stroke: styles.trackStroke,
    strokeWidth: styles.trackStrokeWidth,
    dash: null,
  });

  // 3) 핏레인 (optional)
  if (pitlane && pitlane.length >= 2) {
    strokePolyline(ctx, pitlane, viewport, {
      stroke: styles.pitlaneStroke,
      strokeWidth: styles.pitlaneStrokeWidth,
      dash: [...styles.pitlaneDashPattern],
    });
  }
}

interface StrokeStyle {
  stroke: string;
  strokeWidth: number;
  dash: number[] | null;
}

function strokePolyline(
  ctx: CanvasRenderingContext2D,
  polyline: readonly Point2D[],
  viewport: ViewportTransform,
  style: StrokeStyle,
): void {
  ctx.beginPath();
  const first = applyViewport(polyline[0], viewport);
  ctx.moveTo(first[0], first[1]);
  for (let i = 1; i < polyline.length; i++) {
    const p = applyViewport(polyline[i], viewport);
    ctx.lineTo(p[0], p[1]);
  }
  ctx.lineWidth = style.strokeWidth;
  ctx.strokeStyle = style.stroke;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(style.dash ?? []);
  ctx.stroke();
  ctx.setLineDash([]); // 다음 호출에 영향 없도록 reset
}
