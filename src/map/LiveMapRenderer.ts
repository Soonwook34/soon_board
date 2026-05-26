// live-map plan §5.8 — RAF 루프 메인 렌더러.
// 각 frame: clearRect → renderStaticTrack → buffer.drivers() iterate → findPair → interpolatePosition → drawMarker.
//
// renderFrame(displayTimeMs) 는 순수 함수 — RAF 의존성 없음, node 테스트 가능.
// start()/stop() 만 requestAnimationFrame 의존.

import type { DataSource } from '../shared/DataSource.js';
import { interpolatePosition, type InterpolationContext } from './interpolation.js';
import { drawMarker } from './markers.js';
import { PerDriverBuffer } from './PerDriverBuffer.js';
import { renderStaticTrack } from './trackRenderer.js';
import { applyViewport, type Point2D, type ViewportTransform } from './viewport.js';

export interface DriverMeta {
  teamColour: string;
  nameAcronym: string;
}

export interface LiveMapRendererConfig {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  polyline: readonly Point2D[];
  arcLengthTable: readonly number[];
  totalLength: number;
  viewport: ViewportTransform;
  dataSource: Pick<DataSource, 'getDisplayTime'>;
  buffer: PerDriverBuffer;
  /** driverNumber → 팀색·이니셜 조회. */
  getDriverMeta: (driverNumber: number) => DriverMeta | null;
  /** 라벨 표시 — 매 frame 평가 (Provider 반응성). */
  showLabel: () => boolean;
  /** 선택: Phase 8 핏레인 polyline 등 정적 트랙 옵션. */
  pitlane?: readonly Point2D[];
}

export class LiveMapRenderer {
  private rafId: number | null = null;
  private readonly interpolationCtx: InterpolationContext;

  constructor(private readonly config: LiveMapRendererConfig) {
    this.interpolationCtx = {
      polyline: config.polyline,
      arcLengthTable: config.arcLengthTable,
      totalLength: config.totalLength,
    };
  }

  /** 순수 frame 함수 — 테스트 가능. RAF 콜백에서도 동일하게 호출됨. */
  renderFrame(displayTimeMs: number): void {
    const { ctx, canvasWidth, canvasHeight, polyline, viewport, buffer, getDriverMeta, showLabel, pitlane } = this.config;

    // 정적 트랙 재렌더 (Phase 6 MVP — offscreen cache 는 Phase 14)
    renderStaticTrack({ ctx, canvasWidth, canvasHeight, polyline, viewport, pitlane });

    const labelOn = showLabel();
    for (const driverNumber of buffer.drivers()) {
      const pair = buffer.findPair(driverNumber, displayTimeMs);
      if (pair === null) continue;
      const meta = getDriverMeta(driverNumber);
      if (!meta) continue;
      const interp = interpolatePosition(pair.s1, pair.s2, displayTimeMs, this.interpolationCtx);
      const canvasPos = applyViewport(interp.position, viewport);
      drawMarker(ctx, {
        position: canvasPos,
        teamColour: meta.teamColour,
        driverNumber,
        nameAcronym: meta.nameAcronym,
        showLabel: labelOn,
      });
    }
  }

  start(): void {
    if (this.rafId !== null) return;
    const tick = () => {
      this.renderFrame(this.config.dataSource.getDisplayTime().valueOf());
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
