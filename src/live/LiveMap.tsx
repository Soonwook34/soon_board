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
};

const DEFAULT_CANVAS_WIDTH = 800;
const DEFAULT_CANVAS_HEIGHT = 600;
const OPENF1_BASE = 'https://api.openf1.org';

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const trackUrl = `/trackOutlines/${circuitKey}-${year}.json`;
    const pitlaneUrl = `/trackOutlines/pitlane_${circuitKey}-${year}.json`;
    const driversUrl = `${OPENF1_BASE}/v1/drivers?session_key=${sessionKey}`;

    Promise.all([
      fetcher(trackUrl, { signal: ctrl.signal }).then(
        (r) =>
          r.ok ? (r.json() as Promise<TrackOutlineJson>) : Promise.reject(new Error(`track HTTP ${r.status}`)),
      ),
      fetcher(pitlaneUrl, { signal: ctrl.signal }).then((r) =>
        r.status === 404
          ? null
          : r.ok
            ? (r.json() as Promise<PitlaneJsonBase>)
            : Promise.reject(new Error(`pitlane HTTP ${r.status}`)),
      ),
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
            'Track is missing openf1_transform — re-run extract-openf1-transform for this circuit.',
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
        if (err.name === 'AbortError') return;
        setError(err.message ?? String(err));
      });

    return () => ctrl.abort();
  }, [sessionKey, circuitKey, year, reloadKey, fetcher]);

  // ── renderer mount ──────────────────────────────────────────────────
  useEffect(() => {
    if (!assets || !canvasRef.current || !assets.track.openf1_transform) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const polyline = assets.track.polyline.map((p) => [p[0], p[1]] as Point2D);
    const arcTable = [...assets.track.arc_length_table];
    const viewport = computeViewport({
      viewBox: assets.track.viewBox,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
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
    const renderer = new LiveMapRenderer({
      ctx,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
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
    });

    void ds.start();
    renderer.start();

    return () => {
      renderer.stop();
      ds.stop();
    };
  }, [assets, sessionKey, factory, fetchImpl, isReplay]);

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
  return (
    <main style={{ padding: '0', background: 'var(--color-bg-base)' }}>
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
    </main>
  );
}
