// live-map plan §3.2 + §4 — LiveScreen 과 LiveMapRenderer 사이 React bridge.
// 책임:
//  1. /trackOutlines/{key}-{year}.json + pitlane_{key}-{year}.json + OpenF1 /v1/drivers fetch (병렬)
//  2. canvas mount + computeViewport
//  3. LiveDataSource start (onSample 콜백이 raw → projected → PerDriverBuffer push)
//  4. LiveMapRenderer start (RAF loop)
//  5. unmount 시 모든 리소스 정리
//
// dataSourceFactory + fetchImpl 은 테스트 seam — production 은 default 사용.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LiveDataSource, type LiveDataSourceOptions } from '../map/LiveDataSource.js';
import { LiveMapRenderer } from '../map/LiveMapRenderer.js';
import { PerDriverBuffer } from '../map/PerDriverBuffer.js';
import { applyOpenF1Transform } from '../map/transform.js';
import { projectToPolyline } from '../map/pathProjection.js';
import { computeViewport, type Point2D } from '../map/viewport.js';
import { useMarkerLabel } from '../map/markerLabelToggle.js';
import { loadSectorBoundaries } from '../map/sectorBoundaries.js';
import { loadDrsZones } from '../map/drsZones.js';
import { loadSlmZones } from '../map/slmZones.js';
import type { DataSource } from '../shared/DataSource.js';
import type {
  DrsZonesJsonBase,
  PitlaneJsonBase,
  SectorsJsonBase,
  SlmZonesJsonBase,
  TrackOutlineJson,
} from '../../scripts/_lib/trackOutlinesSchema.js';

/**
 * LiveMap 의 dataSource seam 이 받는 최소 표면. DataSource 인터페이스 + lifecycle.
 * SyntheticDataSource (test-rig) 와 LiveDataSource (production) 둘 다 만족.
 */
export type LiveMapDataSource = DataSource & {
  start(): void | Promise<void>;
  stop(): void;
  /** B1: optional — replay-only. live source 는 wall-clock 시간이라 제어 불가. */
  pause?(): void;
  resume?(): void;
  isPaused?(): boolean;
};

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const OPENF1_BASE = 'https://api.openf1.org';
/** A3: asset fetch (track+pitlane+drivers+overlays) timeout — hang 방지. */
const ASSET_FETCH_TIMEOUT_MS = 15_000;

interface DriverMetaRow {
  teamColour: string;
  nameAcronym: string;
}

interface LoadedAssets {
  track: TrackOutlineJson;
  pitlane: PitlaneJsonBase | null;
  drivers: Map<number, DriverMetaRow>;
  sectors: SectorsJsonBase | null;
  drsZones: DrsZonesJsonBase | null;
  slmZones: SlmZonesJsonBase | null;
}

export interface LiveMapProps {
  sessionKey: number;
  circuitKey: number;
  year: number;
  onBack?: () => void;
  /** 테스트 seam — fetch override (assets + drivers). default globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** 테스트 seam — DataSource constructor override. default new LiveDataSource(opts). */
  dataSourceFactory?: (opts: LiveDataSourceOptions) => LiveMapDataSource;
  /** Phase 10 게이트 — true 시 DRS zone 렌더링 (ReplayScreen 만). default false. */
  isReplay?: boolean;
}

export function LiveMap({
  sessionKey,
  circuitKey,
  year,
  onBack,
  fetchImpl,
  dataSourceFactory,
  isReplay = false,
}: LiveMapProps) {
  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // B1: ds 가 pause() 를 지원하는지 — render 결정용. ref 만으론 re-render 안 트리거.
  const [supportsPause, setSupportsPause] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // B1: ds ref — toolbar 가 pause/resume 호출. renderer effect 안에서 set.
  const dataSourceRef = useRef<LiveMapDataSource | null>(null);
  const { showLabel } = useMarkerLabel();
  const showLabelRef = useRef(showLabel);
  useEffect(() => {
    showLabelRef.current = showLabel;
  }, [showLabel]);

  const fetcher = useMemo(
    () => fetchImpl ?? globalThis.fetch.bind(globalThis),
    [fetchImpl],
  );
  const factory = useMemo(
    () =>
      dataSourceFactory ??
      ((opts: LiveDataSourceOptions): LiveMapDataSource => new LiveDataSource(opts)),
    [dataSourceFactory],
  );

  // ── asset load ───────────────────────────────────────────────────────
  useEffect(() => {
    setAssets(null);
    setError(null);
    const ctrl = new AbortController();
    // A3: 15s 후 abort — 무한 "Loading track…" 방지. 정상 응답 시 cleanup 으로 cancel.
    const timeoutId = setTimeout(() => {
      ctrl.abort(new DOMException('Asset fetch timeout', 'TimeoutError'));
    }, ASSET_FETCH_TIMEOUT_MS);
    const trackUrl = `/trackOutlines/${circuitKey}-${year}.json`;
    const pitlaneUrl = `/trackOutlines/pitlane_${circuitKey}-${year}.json`;
    const driversUrl = `${OPENF1_BASE}/v1/drivers?session_key=${sessionKey}`;

    // dev server SPA fallback (`index.html`, status 200, text/html) 을 missing 으로 통합 처리 —
    // 그대로 두면 r.json() 이 "Unexpected token '<'" 로 크래시. content-type 으로 sniff.
    const isHtmlFallback = (r: Response) =>
      (r.headers.get('content-type') ?? '').toLowerCase().includes('text/html');

    Promise.all([
      fetcher(trackUrl, { signal: ctrl.signal }).then((r) => {
        if (r.status === 404 || isHtmlFallback(r)) {
          return Promise.reject(
            new Error(
              `트랙 데이터 없음 (${trackUrl}) — \`npm run build:all:base\` 를 실행해 circuit ${circuitKey}/${year} 트랙 아웃라인을 생성하세요.`,
            ),
          );
        }
        if (!r.ok) return Promise.reject(new Error(`track HTTP ${r.status}`));
        return r.json() as Promise<TrackOutlineJson>;
      }),
      fetcher(pitlaneUrl, { signal: ctrl.signal }).then((r) => {
        if (r.status === 404 || isHtmlFallback(r)) return null;
        if (!r.ok) return Promise.reject(new Error(`pitlane HTTP ${r.status}`));
        return r.json() as Promise<PitlaneJsonBase>;
      }),
      fetcher(driversUrl, { signal: ctrl.signal }).then(
        (r) =>
          r.ok
            ? (r.json() as Promise<Array<Record<string, unknown>>>)
            : Promise.reject(new Error(`drivers HTTP ${r.status}`)),
      ),
      // Phase 9/10/11 — 모두 optional (404 → null). 실패 (5xx) 는 null 로 흡수해 라이브맵 차단 안 함.
      loadSectorBoundaries(circuitKey, year, fetcher).catch(() => null),
      loadDrsZones(circuitKey, year, fetcher).catch(() => null),
      loadSlmZones(circuitKey, year, fetcher).catch(() => null),
    ])
      .then(([track, pitlane, driversList, sectors, drsZones, slmZones]) => {
        if (!track.openf1_transform) {
          setError(
            `이 트랙 (circuit ${circuitKey}/${year}) 의 OpenF1 좌표 매핑이 아직 준비되지 않았습니다. ` +
              `터미널에서 \`npx tsx scripts/extract-openf1-transform.ts --key=${circuitKey} --year=${year}\` ` +
              `또는 \`npm run build:all -- --key=${circuitKey} --year=${year}\` 를 실행하세요. ` +
              `이게 끝나면 Retry 를 누르세요.`,
          );
          return;
        }
        const drivers = new Map<number, DriverMetaRow>();
        for (const d of driversList) {
          const num = Number(d.driver_number);
          if (!Number.isFinite(num)) continue;
          const colour = typeof d.team_colour === 'string' && d.team_colour.length > 0
            ? `#${d.team_colour}`
            : '#ffffff';
          const acronym = typeof d.name_acronym === 'string' ? d.name_acronym : `D${num}`;
          drivers.set(num, { teamColour: colour, nameAcronym: acronym });
        }
        setAssets({ track, pitlane, drivers, sectors, drsZones, slmZones });
      })
      .catch((err: Error & { name?: string }) => {
        if (err.name === 'TimeoutError') {
          setError(
            `자산 로드 시간 초과 (${ASSET_FETCH_TIMEOUT_MS / 1000}s) — 네트워크 확인 후 Retry 를 누르세요.`,
          );
          return;
        }
        if (err.name === 'AbortError') return;
        setError(err.message ?? String(err));
      })
      .finally(() => clearTimeout(timeoutId));

    return () => {
      clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [sessionKey, circuitKey, year, reloadKey, fetcher]);

  // ── renderer mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!assets || !canvasRef.current || !assets.track.openf1_transform) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // A2: silent fallback 제거 — 브라우저가 2D context 미지원 시 사용자에 알림.
      setError('이 브라우저는 Canvas 2D 를 지원하지 않습니다 — 다른 브라우저에서 다시 시도하세요.');
      return;
    }

    // DPR (device pixel ratio) 스케일링 — 레티나에서 마커가 흐릿하게 보이는 문제 해결.
    // canvas 내부 픽셀은 DPR 배수, CSS 크기는 logical (DEFAULT_CANVAS_WIDTH/HEIGHT).
    // ctx.scale(dpr, dpr) 이후 모든 draw 는 logical 좌표로 호출 — viewport 도 logical 사이즈 기준.
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const logicalW = DEFAULT_CANVAS_WIDTH;
    const logicalH = DEFAULT_CANVAS_HEIGHT;
    if (canvas.width !== logicalW * dpr) canvas.width = logicalW * dpr;
    if (canvas.height !== logicalH * dpr) canvas.height = logicalH * dpr;
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const polyline = assets.track.polyline.map((p) => [p[0], p[1]] as Point2D);
    const arcTable = [...assets.track.arc_length_table];
    const viewport = computeViewport({
      viewBox: assets.track.viewBox,
      canvasWidth: logicalW,
      canvasHeight: logicalH,
    });
    const buffer = new PerDriverBuffer();
    const transform = assets.track.openf1_transform;

    const ds = factory({
      sessionKey,
      // fetchImpl 미지정 시 LiveDataSource 가 globalThis.fetch 사용 — production 정상 경로.
      // 본 컴포넌트의 asset fetch (assets useEffect) 와 LiveDataSource 의 OpenF1 fetch 는
      // 같은 globalThis.fetch 를 공유. 테스트 시에만 prop 으로 격리된 mock 주입.
      fetchImpl,
      onSample: (driver, sample) => {
        const [x, y] = applyOpenF1Transform(sample.x, sample.y, transform);
        const proj = projectToPolyline([x, y], polyline, arcTable);
        buffer.push(driver, {
          date: sample.date.valueOf(),
          rawXY: [x, y],
          s: proj.s,
          n: proj.n,
        });
      },
    });

    const pitlanePolyline = assets.pitlane
      ? assets.pitlane.polyline.map((p) => [p[0], p[1]] as Point2D)
      : undefined;
    // C2 — 정적 레이어 (트랙/오버레이) offscreen cache. 같은 DPR 비율로 buffer.
    let staticLayerCanvas: HTMLCanvasElement | undefined;
    if (typeof document !== 'undefined') {
      staticLayerCanvas = document.createElement('canvas');
      staticLayerCanvas.width = logicalW * dpr;
      staticLayerCanvas.height = logicalH * dpr;
      const offCtx = staticLayerCanvas.getContext('2d');
      if (offCtx) offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const renderer = new LiveMapRenderer({
      ctx,
      canvasWidth: logicalW,
      canvasHeight: logicalH,
      polyline,
      arcLengthTable: arcTable,
      totalLength: assets.track.total_length,
      viewport,
      dataSource: ds,
      buffer,
      getDriverMeta: (n) => assets.drivers.get(n) ?? null,
      showLabel: () => showLabelRef.current,
      pitlanePolyline,
      pitlaneArcLengthTable: assets.pitlane ? [...assets.pitlane.arc_length_table] : undefined,
      pitlaneTotalLength: assets.pitlane?.total_length,
      sectorBoundaries: assets.sectors?.boundaries,
      drsZones: assets.drsZones?.zones,
      drsEnabled: isReplay,
      slmZones: assets.slmZones?.zones,
      staticLayerCanvas,
    });

    dataSourceRef.current = ds;
    setIsPaused(false);
    setSupportsPause(typeof ds.pause === 'function');
    void ds.start();
    renderer.start();

    return () => {
      renderer.stop();
      ds.stop();
      dataSourceRef.current = null;
      setSupportsPause(false);
    };
  }, [assets, sessionKey, factory, fetchImpl, isReplay]);

  const onTogglePause = useCallback(() => {
    const ds = dataSourceRef.current;
    if (!ds?.pause || !ds.resume || !ds.isPaused) return;
    if (ds.isPaused()) {
      ds.resume();
      setIsPaused(false);
    } else {
      ds.pause();
      setIsPaused(true);
    }
  }, []);

  const onRetry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (error) {
    return (
      <main
        role="alert"
        style={{ padding: '32px', color: 'var(--color-text-primary)' }}
      >
        <div style={{ marginBottom: '12px' }}>Error loading live map: {error}</div>
        <button onClick={onRetry}>Retry</button>
        {onBack && (
          <button onClick={onBack} style={{ marginLeft: '8px' }}>
            Back
          </button>
        )}
      </main>
    );
  }
  if (!assets) {
    return (
      <main style={{ padding: '32px', color: 'var(--color-text-secondary)' }}>
        Loading track…
      </main>
    );
  }
  // B1: replay 일 때만 toolbar 노출 (ds.pause 존재로 판단 — LiveDataSource 는 안 가짐).
  const showPauseButton = isReplay && supportsPause;

  return (
    <main style={{ padding: '0', background: 'var(--color-bg-base)', position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={DEFAULT_CANVAS_WIDTH}
        height={DEFAULT_CANVAS_HEIGHT}
        data-testid="live-map-canvas"
        style={{ display: 'block', margin: '0 auto' }}
      />
      {onBack && (
        <button
          onClick={onBack}
          style={{ position: 'absolute', top: '12px', left: '12px' }}
        >
          Back
        </button>
      )}
      {showPauseButton && (
        <button
          onClick={onTogglePause}
          data-testid="replay-pause-toggle"
          aria-label={isPaused ? 'Resume' : 'Pause'}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            padding: '6px 14px',
            background: 'rgba(15, 17, 22, 0.78)',
            color: 'var(--color-text-primary)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '13px',
          }}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      )}
    </main>
  );
}
