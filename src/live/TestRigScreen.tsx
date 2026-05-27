// /test-rig — Playwright e2e + 60min memory profile 용 결정론적 LiveMap 마운트.
// 실 OpenF1 fetch 없이 in-memory trackOutlines + drivers + SyntheticDataSource 만으로 동작.
// URL query: ?driverCount=5&sps=4&durationSec=600
//
// 본 컴포넌트는 production bundle 에 포함되지만 /test-rig 라우트로만 도달 가능 — 부가 비용 micro.

import { useMemo } from 'react';
import { LiveMap, type LiveMapDataSource } from './LiveMap';
import { SyntheticDataSource, buildArcTable } from './SyntheticDataSource';
import type { LiveDataSourceOptions } from '../map/LiveDataSource';

const DEFAULT_DRIVER_COUNT = 5;
const DEFAULT_SPS = 4;
const DEFAULT_DURATION_SEC = 600;
const VIEWBOX_SIZE = 500;
const SQUARE_INSET = 50;

// 정사각형 트랙 (4 점 closed). OpenF1 좌표계로 사용.
const SQUARE_POLYLINE: Array<[number, number]> = [
  [SQUARE_INSET, SQUARE_INSET],
  [VIEWBOX_SIZE - SQUARE_INSET, SQUARE_INSET],
  [VIEWBOX_SIZE - SQUARE_INSET, VIEWBOX_SIZE - SQUARE_INSET],
  [SQUARE_INSET, VIEWBOX_SIZE - SQUARE_INSET],
  [SQUARE_INSET, SQUARE_INSET],
];
const SQUARE_PERIMETER = (VIEWBOX_SIZE - 2 * SQUARE_INSET) * 4;

interface RigOpts {
  driverCount: number;
  sps: number;
  durationSec: number;
}

function parseQuery(search: string): RigOpts {
  const sp = new URLSearchParams(search);
  const n = (k: string, def: number, min: number, max: number) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) && v >= min && v <= max ? v : def;
  };
  return {
    driverCount: Math.floor(n('driverCount', DEFAULT_DRIVER_COUNT, 1, 30)),
    sps: n('sps', DEFAULT_SPS, 1, 60),
    durationSec: Math.floor(n('durationSec', DEFAULT_DURATION_SEC, 5, 3600 * 2)),
  };
}

const ARC_TABLE: number[] = buildArcTable(SQUARE_POLYLINE);

export function TestRigScreen() {
  const opts = useMemo(() => parseQuery(window.location.search), []);
  const driverNumbers = useMemo(
    () => Array.from({ length: opts.driverCount }, (_, i) => i + 1),
    [opts.driverCount],
  );

  // 합성 trackOutlines + drivers JSON in-memory 응답 — LiveMap 의 globalThis.fetch 대체.
  const fetchImpl: typeof fetch = useMemo(
    () =>
      ((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('/trackOutlines/63-')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                circuit_key: 63,
                year: 2024,
                circuit_short_name: 'TestRig',
                country_name: 'Synthetic',
                source: 'test-rig',
                source_file: 'synthetic-square.svg',
                license: 'N/A',
                viewBox: [0, 0, VIEWBOX_SIZE, VIEWBOX_SIZE],
                polyline: SQUARE_POLYLINE.map(([x, y]) => [x, y]),
                arc_length_table: [...ARC_TABLE],
                total_length: SQUARE_PERIMETER,
                start_finish_index: 0,
                direction: 'clockwise',
                generated_at: new Date().toISOString(),
                openf1_transform: {
                  scale: 1,
                  rotation_deg: 0,
                  translate: [0, 0],
                  reflection: false,
                },
              }),
              { status: 200 },
            ),
          );
        }
        if (url.includes('/trackOutlines/pitlane_')) {
          return Promise.resolve(new Response('', { status: 404 }));
        }
        if (url.includes('/v1/drivers')) {
          const drivers = driverNumbers.map((n) => ({
            driver_number: n,
            name_acronym: `D${String(n).padStart(2, '0')}`,
            team_colour: ['ff0000', '00ff00', '0000ff', 'ffff00', 'ff00ff'][n % 5],
          }));
          return Promise.resolve(new Response(JSON.stringify(drivers), { status: 200 }));
        }
        return Promise.reject(new Error(`[test-rig] unexpected fetch: ${url}`));
      }) as unknown as typeof fetch,
    [driverNumbers],
  );

  const dataSourceFactory = useMemo(
    () =>
      (dsOpts: LiveDataSourceOptions): LiveMapDataSource =>
        new SyntheticDataSource({
          driverNumbers,
          samplesPerSecond: opts.sps,
          polyline: SQUARE_POLYLINE,
          totalArcLength: SQUARE_PERIMETER,
          startEpochMs: Date.now(),
          onSample: dsOpts.onSample,
        }),
    [driverNumbers, opts.sps],
  );

  return (
    <main data-testid="test-rig">
      <LiveMap
        sessionKey={99999}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl}
        dataSourceFactory={dataSourceFactory}
      />
    </main>
  );
}
