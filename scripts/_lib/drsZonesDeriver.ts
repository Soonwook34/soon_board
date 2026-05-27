// live-map plan §1.3.4 + §10 단계 10 — DRS zone derive (car_data.drs 전이 클러스터링).
//
// drs 인코딩 (OpenF1):
//   0, 1  → DRS off
//   8     → detection point 통과 (자격 판정)
//   10/12/14 → activation start (zone 진입)
// 알고리즘:
//   1. 각 driver 의 car_data.drs 시계열에서 전이 timestamp 추출:
//        prev=0|1 → curr=8  → detection 이벤트
//        prev<10  → curr>=10 → activation start
//        prev>=10 → curr=0|1  → activation end
//   2. 각 전이 timestamp 의 location nearest-neighbor (±150ms)
//   3. arc-length projection → s
//   4. 다드라이버 × 다랩 s 값을 zone 별로 1D DBSCAN (threshold = polyline 5%)
//   5. cluster median → DrsZone (detection/activation_start/activation_end)
//      cluster pair (start, end) 를 인접도 기반으로 매칭

import { applyOpenF1Transform, type OpenF1Transform } from '../../src/map/transform.js';
import { projectToPolyline } from '../../src/map/pathProjection.js';
import type { Point2D } from '../../src/map/viewport.js';
import type { DrsZone } from './trackOutlinesSchema.js';

export interface CarDataDrsInput {
  driver_number: number;
  date: Date;
  drs: number;
}

export interface DrsLocationInput {
  driver_number: number;
  date: Date;
  x: number;
  y: number;
  z: number;
}

export interface DeriveDrsZonesOptions {
  carData: readonly CarDataDrsInput[];
  locations: readonly DrsLocationInput[];
  transform: OpenF1Transform;
  polyline: readonly Point2D[];
  arcLengthTable: readonly number[];
  totalLength: number;
  /** location 매칭 윈도우 (ms). default 150. */
  locationNearestWindowMs?: number;
  /** cluster threshold — polyline 길이 대비 비율. default 0.05 (5%). */
  clusterThresholdRatio?: number;
}

export interface DrsZoneDerivation {
  zones: readonly DrsZone[];
  meta: {
    driver_count: number;
    detection_count: number;
    activation_start_count: number;
    activation_end_count: number;
  };
}

type TransitionType = 'detection' | 'activation_start' | 'activation_end';

interface TransitionSample {
  type: TransitionType;
  driver: number;
  ms: number;
  s: number;
}

const DEFAULT_LOC_WINDOW = 150;
const DEFAULT_CLUSTER_RATIO = 0.05;
const SENTINEL_THRESHOLD = 50;

export function deriveDrsZones(opts: DeriveDrsZonesOptions): DrsZoneDerivation | null {
  const locWindow = opts.locationNearestWindowMs ?? DEFAULT_LOC_WINDOW;
  const clusterThresh = opts.totalLength * (opts.clusterThresholdRatio ?? DEFAULT_CLUSTER_RATIO);

  const carByDriver = groupByDriver(opts.carData);
  const locByDriver = groupByDriver(opts.locations);
  for (const arr of carByDriver.values()) arr.sort((a, b) => a.date.valueOf() - b.date.valueOf());
  for (const arr of locByDriver.values()) arr.sort((a, b) => a.date.valueOf() - b.date.valueOf());

  const transitions: TransitionSample[] = [];
  const driverSet = new Set<number>();

  for (const [driver, carRows] of carByDriver) {
    const locRows = locByDriver.get(driver);
    if (!locRows || locRows.length === 0) continue;
    driverSet.add(driver);
    let prev = carRows[0].drs;
    for (let i = 1; i < carRows.length; i++) {
      const curr = carRows[i].drs;
      const type = classifyTransition(prev, curr);
      prev = curr;
      if (!type) continue;
      const ms = carRows[i].date.valueOf();
      const loc = nearestLocation(locRows, ms, locWindow);
      if (!loc) continue;
      if (Math.abs(loc.x) + Math.abs(loc.y) + Math.abs(loc.z) < SENTINEL_THRESHOLD) continue;
      const [sx, sy] = applyOpenF1Transform(loc.x, loc.y, opts.transform);
      const proj = projectToPolyline([sx, sy], opts.polyline, opts.arcLengthTable);
      transitions.push({ type, driver, ms, s: proj.s });
    }
  }

  if (transitions.length === 0) return null;

  const detectionClusters = cluster1D(
    transitions.filter((t) => t.type === 'detection').map((t) => t.s),
    clusterThresh,
  );
  const startClusters = cluster1D(
    transitions.filter((t) => t.type === 'activation_start').map((t) => t.s),
    clusterThresh,
  );
  const endClusters = cluster1D(
    transitions.filter((t) => t.type === 'activation_end').map((t) => t.s),
    clusterThresh,
  );

  // pair each detection with closest activation start (forward), then start with closest end.
  const sortedDetections = detectionClusters.slice().sort((a, b) => a - b);
  const sortedStarts = startClusters.slice().sort((a, b) => a - b);
  const sortedEnds = endClusters.slice().sort((a, b) => a - b);

  const zones: DrsZone[] = [];
  for (let i = 0; i < sortedDetections.length; i++) {
    const det = sortedDetections[i];
    const start = sortedStarts.find((s) => s >= det || zoneWraps(s, det, opts.totalLength));
    if (start == null) continue;
    const end = sortedEnds.find((e) => e >= start || zoneWraps(e, start, opts.totalLength));
    if (end == null) continue;
    zones.push({
      id: zones.length + 1,
      detection_s: det,
      activation_s_start: start,
      activation_s_end: end,
    });
  }

  return {
    zones,
    meta: {
      driver_count: driverSet.size,
      detection_count: transitions.filter((t) => t.type === 'detection').length,
      activation_start_count: transitions.filter((t) => t.type === 'activation_start').length,
      activation_end_count: transitions.filter((t) => t.type === 'activation_end').length,
    },
  };
}

function classifyTransition(prev: number, curr: number): TransitionType | null {
  const prevOff = prev === 0 || prev === 1;
  const currOff = curr === 0 || curr === 1;
  const prevActive = prev >= 10;
  const currActive = curr >= 10;
  if (prevOff && curr === 8) return 'detection';
  if (!prevActive && currActive) return 'activation_start';
  if (prevActive && currOff) return 'activation_end';
  return null;
}

function nearestLocation(
  locRows: ReadonlyArray<DrsLocationInput>,
  targetMs: number,
  windowMs: number,
): DrsLocationInput | null {
  let best: DrsLocationInput | null = null;
  let bestDelta = Infinity;
  for (const loc of locRows) {
    const delta = Math.abs(loc.date.valueOf() - targetMs);
    if (delta > windowMs) continue;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = loc;
    }
  }
  return best;
}

/** 1D DBSCAN-ish — sorted scan, gap > threshold 면 새 cluster. cluster median 반환. */
function cluster1D(values: readonly number[], threshold: number): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    if (sorted[i] - last[last.length - 1] <= threshold) last.push(sorted[i]);
    else clusters.push([sorted[i]]);
  }
  return clusters.map((c) => median1D(c));
}

function median1D(arr: readonly number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * detection→start (또는 start→end) 가 트랙 한 바퀴를 가로지르는지 판정.
 * 한계: F1 트랙의 DRS zone 은 일반적으로 트랙 길이의 5~15% 차지. detection 과 activation_start 간격은
 * 그보다 짧음. total/4 (25%) 는 wrap 판정의 conservative threshold 로, 두 zone 이 매우 가까운 경우
 * false positive 가능 — 다만 cluster1D 가 zone 별 single cluster 를 보장하므로 실용적 영향은 낮음.
 */
function zoneWraps(later: number, earlier: number, total: number): boolean {
  return Math.abs(later + total - earlier) < total / 4;
}

function groupByDriver<T extends { driver_number: number }>(rows: readonly T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const r of rows) {
    const arr = out.get(r.driver_number) ?? [];
    arr.push(r);
    out.set(r.driver_number, arr);
  }
  return out;
}
