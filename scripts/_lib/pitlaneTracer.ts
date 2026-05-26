// live-map plan §1.3.2 — 핏레인 polyline self-trace.
//
// 단계:
//   1. /v1/pit?session_key=N → 핏 진입 목록 (driver_number, date_start, lane_duration)
//   2. 각 진입의 [date_start - pad, date_start + lane_duration + pad] 윈도우에서
//      /v1/location?driver_number=D&date>=&date<= 로 RawPitLocation 수집
//   3. applyOpenF1Transform 으로 SVG viewBox 좌표로 변환 + sentinel |x|+|y|+|z|<50 필터
//   4. tracePitlanePolyline: 모든 점을 main polyline 에 project → s 로 sort →
//      bucketWidth 단위 bucket → 각 bucket median XY → smooth polyline + arc-length
//
// plan §11 한계: location 횡방향 정밀도 한계로 핏레인 폭(10~15m) 좌우 구분 없이 뭉개짐 —
// 단일 라인 표현으로 충분 (인수 13번).

import { applyOpenF1Transform, type OpenF1Transform } from '../../src/map/transform.js';
import type { Point2D } from '../../src/map/viewport.js';
import { projectToPolyline } from '../../src/map/pathProjection.js';
import type { OpenF1Client } from './openf1Client.js';

export interface PitStop {
  driver_number: number;
  date_start: Date;
  lane_duration: number;
}

export interface RawPitLocation {
  date: Date;
  x: number;
  y: number;
  z: number;
  driver_number: number;
}

interface RawPitRecord {
  driver_number: number;
  date: string;
  lap_number: number;
  pit_duration?: number | null;
}

interface RawLocationRecord {
  date: string;
  driver_number: number;
  x: number;
  y: number;
  z: number;
}

const SENTINEL_THRESHOLD = 50;

export async function fetchPitStops(opts: {
  client: OpenF1Client;
  session_key: number;
}): Promise<PitStop[]> {
  const raw = await opts.client.get<RawPitRecord[]>('/v1/pit', {
    session_key: opts.session_key,
  });
  const out: PitStop[] = [];
  for (const r of raw) {
    if (r.pit_duration == null || !Number.isFinite(r.pit_duration)) continue;
    out.push({
      driver_number: r.driver_number,
      date_start: new Date(r.date),
      lane_duration: r.pit_duration,
    });
  }
  return out;
}

export async function fetchPitLocations(opts: {
  client: OpenF1Client;
  session_key: number;
  pitStops: readonly PitStop[];
  padSec?: number;
}): Promise<RawPitLocation[]> {
  const pad = opts.padSec ?? 5;
  const out: RawPitLocation[] = [];
  for (const stop of opts.pitStops) {
    const startMs = stop.date_start.getTime() - pad * 1000;
    const endMs = stop.date_start.getTime() + stop.lane_duration * 1000 + pad * 1000;
    const records = await opts.client.get<RawLocationRecord[]>('/v1/location', {
      session_key: opts.session_key,
      driver_number: stop.driver_number,
      'date>=': new Date(startMs).toISOString(),
      'date<=': new Date(endMs).toISOString(),
    });
    for (const r of records) {
      out.push({
        date: new Date(r.date),
        x: r.x,
        y: r.y,
        z: r.z,
        driver_number: r.driver_number,
      });
    }
  }
  return out;
}

/** plan §1.3.2 단계 4 — affine 적용 + sentinel 필터. */
export function applyTransformAndFilter(
  locations: readonly RawPitLocation[],
  transform: OpenF1Transform,
): Point2D[] {
  const out: Point2D[] = [];
  for (const loc of locations) {
    if (Math.abs(loc.x) + Math.abs(loc.y) + Math.abs(loc.z) < SENTINEL_THRESHOLD) continue;
    const [sx, sy] = applyOpenF1Transform(loc.x, loc.y, transform);
    out.push([sx, sy]);
  }
  return out;
}

export interface TracePitlaneResult {
  polyline: Point2D[];
  arcLengthTable: number[];
  totalLength: number;
}

/**
 * plan §1.3.2 단계 5-6 — bucket-median smoothing 으로 폴리라인 추출.
 * 각 점을 main polyline 에 project → s 별 bucket → bucket median XY.
 * arc-length 는 결과 polyline 의 segment 길이 누적.
 */
export function tracePitlanePolyline(
  svgPoints: readonly Point2D[],
  mainPolyline: readonly Point2D[],
  mainArcTable: readonly number[],
  opts?: { bucketWidth?: number },
): TracePitlaneResult {
  if (svgPoints.length === 0) {
    return { polyline: [], arcLengthTable: [], totalLength: 0 };
  }
  const bucketWidth = opts?.bucketWidth ?? 5;
  const projected = svgPoints.map((p) => {
    const proj = projectToPolyline(p, mainPolyline, mainArcTable);
    return { s: proj.s, xy: p };
  });
  projected.sort((a, b) => a.s - b.s);

  // bucket by s
  const buckets = new Map<number, Point2D[]>();
  for (const item of projected) {
    const key = Math.floor(item.s / bucketWidth);
    const arr = buckets.get(key) ?? [];
    arr.push(item.xy);
    buckets.set(key, arr);
  }
  const polyline: Point2D[] = [];
  const sortedKeys = Array.from(buckets.keys()).sort((a, b) => a - b);
  for (const key of sortedKeys) {
    const xys = buckets.get(key)!;
    polyline.push(medianPoint(xys));
  }
  if (polyline.length === 0) return { polyline: [], arcLengthTable: [], totalLength: 0 };

  // arc length
  const arc: number[] = [0];
  let total = 0;
  for (let i = 1; i < polyline.length; i++) {
    const dx = polyline[i][0] - polyline[i - 1][0];
    const dy = polyline[i][1] - polyline[i - 1][1];
    total += Math.sqrt(dx * dx + dy * dy);
    arc.push(total);
  }
  return { polyline, arcLengthTable: arc, totalLength: total };
}

function medianPoint(points: readonly Point2D[]): Point2D {
  const xs = points.map((p) => p[0]).sort((a, b) => a - b);
  const ys = points.map((p) => p[1]).sort((a, b) => a - b);
  const mid = Math.floor(points.length / 2);
  const mx = points.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  const my = points.length % 2 === 1 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
  return [mx, my];
}
