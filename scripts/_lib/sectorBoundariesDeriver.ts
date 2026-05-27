// live-map plan §1.3.3 + §10 단계 9 — Sector boundary derive (i1/i2 speed trap matching).
//
// 알고리즘:
//   각 (driver, lap) 마다:
//     1. car_data 시계열 (lap window 내, 해당 driver) 에서 |speed - lap.i1_speed| 최소 sample
//     2. 그 sample 의 timestamp ± locationNearestWindowMs 내 location 가장 가까운 것 선택
//     3. location.x/y 에 openf1_transform 적용 → SVG viewBox 좌표
//   모든 (driver, lap) 의 SVG XY 의 median → projectToPolyline → arc_length_s
//
// i1, i2 같은 패턴. S3 end = arc 0 (출발선).

import { applyOpenF1Transform, type OpenF1Transform } from '../../src/map/transform.js';
import { projectToPolyline } from '../../src/map/pathProjection.js';
import type { Point2D } from '../../src/map/viewport.js';
import type { SectorBoundary } from './trackOutlinesSchema.js';

export interface LapInput {
  driver_number: number;
  date_start: Date | null;
  lap_duration: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
}

export interface CarDataSpeedInput {
  driver_number: number;
  date: Date;
  speed: number;
}

export interface LocationInput {
  driver_number: number;
  date: Date;
  x: number;
  y: number;
  z: number;
}

export interface DeriveSectorBoundariesOptions {
  laps: readonly LapInput[];
  carData: readonly CarDataSpeedInput[];
  locations: readonly LocationInput[];
  transform: OpenF1Transform;
  polyline: readonly Point2D[];
  arcLengthTable: readonly number[];
  /** location 매칭 윈도우 (ms). default 200. */
  locationNearestWindowMs?: number;
}

export interface SectorBoundaryDerivation {
  boundaries: readonly SectorBoundary[];
  meta: {
    driver_count: number;
    lap_count: number;
    i1_sample_count: number;
    i2_sample_count: number;
  };
}

const DEFAULT_LOCATION_WINDOW_MS = 200;
const SENTINEL_THRESHOLD = 50;

export function deriveSectorBoundaries(
  opts: DeriveSectorBoundariesOptions,
): SectorBoundaryDerivation | null {
  const locWindow = opts.locationNearestWindowMs ?? DEFAULT_LOCATION_WINDOW_MS;

  // group car_data + location by driver for fast lookup.
  const carByDriver = groupByDriver(opts.carData);
  const locByDriver = groupByDriver(opts.locations);
  for (const arr of carByDriver.values()) arr.sort((a, b) => a.date.valueOf() - b.date.valueOf());
  for (const arr of locByDriver.values()) arr.sort((a, b) => a.date.valueOf() - b.date.valueOf());

  const i1Points: Point2D[] = [];
  const i2Points: Point2D[] = [];
  const driverSet = new Set<number>();
  let lapCount = 0;

  for (const lap of opts.laps) {
    if (lap.date_start === null || lap.lap_duration === null) continue;
    driverSet.add(lap.driver_number);
    lapCount += 1;
    const lapStart = lap.date_start.valueOf();
    const lapEnd = lapStart + lap.lap_duration * 1000;
    const carRows = carByDriver.get(lap.driver_number);
    const locRows = locByDriver.get(lap.driver_number);
    if (!carRows || !locRows) continue;

    const i1Xy = matchLocationForSpeed(
      lap.i1_speed,
      carRows,
      locRows,
      lapStart,
      lapEnd,
      locWindow,
      opts.transform,
    );
    if (i1Xy) i1Points.push(i1Xy);

    const i2Xy = matchLocationForSpeed(
      lap.i2_speed,
      carRows,
      locRows,
      lapStart,
      lapEnd,
      locWindow,
      opts.transform,
    );
    if (i2Xy) i2Points.push(i2Xy);
  }

  const i1Median = i1Points.length > 0 ? medianPoint(i1Points) : null;
  const i2Median = i2Points.length > 0 ? medianPoint(i2Points) : null;
  if (!i1Median || !i2Median) return null;

  const i1Proj = projectToPolyline(i1Median, opts.polyline, opts.arcLengthTable);
  const i2Proj = projectToPolyline(i2Median, opts.polyline, opts.arcLengthTable);

  const boundaries: SectorBoundary[] = [
    { sector: 1, end_xy: [i1Median[0], i1Median[1]], arc_length_s: i1Proj.s },
    { sector: 2, end_xy: [i2Median[0], i2Median[1]], arc_length_s: i2Proj.s },
    {
      sector: 3,
      end_xy: [opts.polyline[0][0], opts.polyline[0][1]],
      arc_length_s: 0,
    },
  ];

  return {
    boundaries,
    meta: {
      driver_count: driverSet.size,
      lap_count: lapCount,
      i1_sample_count: i1Points.length,
      i2_sample_count: i2Points.length,
    },
  };
}

function matchLocationForSpeed(
  targetSpeed: number | null,
  carRows: ReadonlyArray<CarDataSpeedInput>,
  locRows: ReadonlyArray<LocationInput>,
  lapStartMs: number,
  lapEndMs: number,
  locWindowMs: number,
  transform: OpenF1Transform,
): Point2D | null {
  if (targetSpeed === null || !Number.isFinite(targetSpeed)) return null;
  let bestMs = 0;
  let bestDelta = Infinity;
  let found = false;
  for (const row of carRows) {
    const ms = row.date.valueOf();
    if (ms < lapStartMs || ms > lapEndMs) continue;
    const delta = Math.abs(row.speed - targetSpeed);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestMs = ms;
      found = true;
    }
  }
  if (!found) return null;
  // nearest location within ±locWindowMs.
  let bestLoc: LocationInput | null = null;
  let bestLocDelta = Infinity;
  for (const loc of locRows) {
    const ms = loc.date.valueOf();
    const delta = Math.abs(ms - bestMs);
    if (delta > locWindowMs) continue;
    if (delta < bestLocDelta) {
      bestLocDelta = delta;
      bestLoc = loc;
    }
  }
  if (!bestLoc) return null;
  if (Math.abs(bestLoc.x) + Math.abs(bestLoc.y) + Math.abs(bestLoc.z) < SENTINEL_THRESHOLD) {
    return null;
  }
  const [sx, sy] = applyOpenF1Transform(bestLoc.x, bestLoc.y, transform);
  return [sx, sy];
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

function medianPoint(points: readonly Point2D[]): Point2D {
  const xs = points.map((p) => p[0]).sort((a, b) => a - b);
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  const mx = points.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  const my = points.length % 2 === 1 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
  return [mx, my];
}
