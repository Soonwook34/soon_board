// live-map plan §5.8 — RAF 루프 메인 렌더러.
// 각 frame: clearRect → renderStaticTrack → buffer.drivers() iterate → findPair → interpolatePosition → drawMarker.
//
// renderFrame(displayTimeMs) 는 순수 함수 — RAF 의존성 없음, node 테스트 가능.
// start()/stop() 만 requestAnimationFrame 의존.

import type { DataSource } from '../shared/DataSource.js';
import { interpolatePosition, type DriverSample, type InterpolationContext } from './interpolation.js';
import { mapStyles } from './mapStyles.js';
import { drawMarker } from './markers.js';
import { PerDriverBuffer } from './PerDriverBuffer.js';
import { projectToPolyline } from './pathProjection.js';
import { classifyDriverState, drawStateBadge, type ClassifyOpts } from './stateBadges.js';
import { renderStaticTrack } from './trackRenderer.js';
import { collectTrailPoints, drawTrail } from './trails.js';
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
  /** 선택: 정적 트랙 회색 파선 (Phase 3 trackRenderer 의 pitlane param). Phase 8 는 pitlanePolyline 으로 자동 채움. */
  pitlane?: readonly Point2D[];
  /** Phase 8 — 핏레인 polyline (path-arc 보간 + 정적 트랙 회색 파선 둘 다용). 3개 필드 같이 제공 시 핏 보간 활성. */
  pitlanePolyline?: readonly Point2D[];
  pitlaneArcLengthTable?: readonly number[];
  pitlaneTotalLength?: number;
  /** Phase 7 — 트레일 ON/OFF (default true). plan §4.3 '비활성화 가능한 옵션'. */
  trailsEnabled?: boolean;
  /** Phase 12+ — dnf/pit hint. Phase 7 default 는 undefined (모두 normal/disconnected 만 판정). */
  getDriverHints?: (driverNumber: number) => ClassifyOpts | undefined;
}

export class LiveMapRenderer {
  private rafId: number | null = null;
  private readonly interpolationCtx: InterpolationContext;
  private readonly pitlaneCtx: InterpolationContext | null;

  constructor(private readonly config: LiveMapRendererConfig) {
    this.interpolationCtx = {
      polyline: config.polyline,
      arcLengthTable: config.arcLengthTable,
      totalLength: config.totalLength,
    };
    this.pitlaneCtx =
      config.pitlanePolyline && config.pitlaneArcLengthTable && config.pitlaneTotalLength != null
        ? {
            polyline: config.pitlanePolyline,
            arcLengthTable: config.pitlaneArcLengthTable,
            totalLength: config.pitlaneTotalLength,
          }
        : null;
  }

  /** 순수 frame 함수 — 테스트 가능. RAF 콜백에서도 동일하게 호출됨. */
  renderFrame(displayTimeMs: number): void {
    const {
      ctx,
      canvasWidth,
      canvasHeight,
      polyline,
      viewport,
      buffer,
      getDriverMeta,
      showLabel,
      pitlane,
      trailsEnabled = true,
      getDriverHints,
    } = this.config;

    // 정적 트랙 재렌더 (Phase 6 MVP — offscreen cache 는 Phase 14). Phase 8 pitlanePolyline 우선.
    const staticPitlane = this.config.pitlanePolyline ?? pitlane;
    renderStaticTrack({ ctx, canvasWidth, canvasHeight, polyline, viewport, pitlane: staticPitlane });

    const labelOn = showLabel();
    for (const driverNumber of buffer.drivers()) {
      const pair = buffer.findPair(driverNumber, displayTimeMs);
      if (pair === null) continue;
      const meta = getDriverMeta(driverNumber);
      if (!meta) continue;
      const state = classifyDriverState(buffer, driverNumber, displayTimeMs, getDriverHints?.(driverNumber));

      // 트레일 (Phase 7 §4.3) — 마커 전에 그려야 마커가 위에 표시됨
      if (trailsEnabled && state !== 'retired') {
        const trailPoints = collectTrailPoints(buffer, driverNumber, displayTimeMs, viewport);
        drawTrail(ctx, trailPoints, {
          color: meta.teamColour,
          lineWidth: mapStyles.trailLineWidth,
          alphaStart: mapStyles.trailAlphaStart,
          alphaEnd: mapStyles.trailAlphaEnd,
        });
      }

      // Phase 8 — 핏 진행/정차 상태 + pitlane ctx 가 있으면 마커가 pitlane polyline 위로 흐름.
      const usePitlane =
        (state === 'pit-in-progress' || state === 'pit-stopped') && this.pitlaneCtx !== null;
      const interpCtx = usePitlane ? this.pitlaneCtx! : this.interpolationCtx;
      const s1ForInterp = usePitlane ? reproject(pair.s1, interpCtx) : pair.s1;
      const s2ForInterp = usePitlane && pair.s2 ? reproject(pair.s2, interpCtx) : pair.s2;
      const interp = interpolatePosition(s1ForInterp, s2ForInterp, displayTimeMs, interpCtx);
      const canvasPos = applyViewport(interp.position, viewport);
      drawMarker(ctx, {
        position: canvasPos,
        teamColour: meta.teamColour,
        driverNumber,
        nameAcronym: meta.nameAcronym,
        showLabel: labelOn,
        state,
      });

      // 상태 배지 (disconnected 만 '?' 그림)
      drawStateBadge(ctx, canvasPos, state, { markerRadius: mapStyles.markerSizeMin / 2 });
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

/** Phase 8 — pit 진입 시 rawXY 를 pitlane polyline 에 재투영해 s/n 재계산. */
function reproject(sample: DriverSample, ctx: InterpolationContext): DriverSample {
  const proj = projectToPolyline(sample.rawXY, ctx.polyline, ctx.arcLengthTable);
  return { date: sample.date, rawXY: sample.rawXY, s: proj.s, n: proj.n };
}
