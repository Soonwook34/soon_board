import { describe, expect, it } from 'vitest';
import {
  deriveSectorBoundaries,
  type CarDataSpeedInput,
  type LapInput,
  type LocationInput,
} from '../_lib/sectorBoundariesDeriver.js';
import type { OpenF1Transform } from '../../src/map/transform.js';

// 정사각형 polyline (0,0)→(400,0)→(400,400)→(0,400)→(0,0). Perimeter = 1600.
const POLYLINE: Array<[number, number]> = [
  [0, 0],
  [400, 0],
  [400, 400],
  [0, 400],
  [0, 0],
];
const ARC = [0, 400, 800, 1200, 1600];
const TRANSFORM: OpenF1Transform = {
  scale: 1,
  rotation_deg: 0,
  translate: [0, 0],
  reflection: false,
};

const SESSION_START = new Date('2024-03-02T15:00:00Z').valueOf();
const LAP_DURATION_SEC = 90;

function makeLap(driver: number, lapIdx: number): LapInput {
  return {
    driver_number: driver,
    date_start: new Date(SESSION_START + lapIdx * LAP_DURATION_SEC * 1000),
    lap_duration: LAP_DURATION_SEC,
    i1_speed: 320,
    i2_speed: 250,
  };
}

/** car_data: lap window 동안 sec=30 peak 320 (i1), sec=60 peak 250 (i2). 두 peak 의 speed 대역이 disjoint. */
function makeCarData(driver: number, lapIdx: number): CarDataSpeedInput[] {
  const start = SESSION_START + lapIdx * LAP_DURATION_SEC * 1000;
  const rows: CarDataSpeedInput[] = [];
  for (let i = 0; i <= 900; i++) {
    const t = start + i * 100;
    const sec = i * 0.1;
    let speed = 100;
    if (sec >= 25 && sec <= 35) speed = 320 - Math.abs(30 - sec) * 5; // 295..320..295
    else if (sec >= 55 && sec <= 65) speed = 250 - Math.abs(60 - sec) * 5; // 225..250..225
    rows.push({ driver_number: driver, date: new Date(t), speed });
  }
  return rows;
}

/** location: lap 동안 트랙 한 바퀴 (polyline 따라). i1 timestamp 시 ~(200,0), i2 timestamp 시 ~(400,200). */
function makeLocations(driver: number, lapIdx: number): LocationInput[] {
  const start = SESSION_START + lapIdx * LAP_DURATION_SEC * 1000;
  const rows: LocationInput[] = [];
  for (let i = 0; i <= 900; i++) {
    const t = start + i * 100;
    const sec = i * 0.1;
    let x = 0;
    let y = 0;
    // 0~30s on top edge (0,0) → (400,0)
    // 30~60s on right edge (400,0) → (400,400)
    // 60~90s on bottom + left edges
    if (sec <= 30) {
      x = (sec / 30) * 400;
      y = 0;
    } else if (sec <= 60) {
      x = 400;
      y = ((sec - 30) / 30) * 400;
    } else {
      x = 400 - ((sec - 60) / 30) * 400;
      y = 400;
    }
    rows.push({ driver_number: driver, date: new Date(t), x, y, z: 1 });
  }
  return rows;
}

describe('deriveSectorBoundaries', () => {
  it('derives S1/S2/S3 boundaries via speed-trap matching + median clustering', () => {
    const laps: LapInput[] = [];
    const carData: CarDataSpeedInput[] = [];
    const locations: LocationInput[] = [];
    for (const drv of [1, 2, 3]) {
      for (let lap = 0; lap < 5; lap++) {
        laps.push(makeLap(drv, lap));
        carData.push(...makeCarData(drv, lap));
        locations.push(...makeLocations(drv, lap));
      }
    }
    const result = deriveSectorBoundaries({
      laps,
      carData,
      locations,
      transform: TRANSFORM,
      polyline: POLYLINE,
      arcLengthTable: ARC,
    });
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.boundaries).toHaveLength(3);
    // i1 speed peaks at sec=30, location at corner (400, 0) → arc_length ~400.
    const s1 = r.boundaries.find((b) => b.sector === 1)!;
    expect(s1.arc_length_s).toBeGreaterThan(350);
    expect(s1.arc_length_s).toBeLessThan(450);
    // i2 speed peaks at sec=60, location at corner (400, 400) → arc_length ~800.
    const s2 = r.boundaries.find((b) => b.sector === 2)!;
    expect(s2.arc_length_s).toBeGreaterThan(750);
    expect(s2.arc_length_s).toBeLessThan(850);
    // S3 end always 0.
    const s3 = r.boundaries.find((b) => b.sector === 3)!;
    expect(s3.arc_length_s).toBe(0);
    expect(r.meta.driver_count).toBe(3);
    expect(r.meta.lap_count).toBe(15);
    expect(r.meta.i1_sample_count).toBeGreaterThanOrEqual(12);
  });

  it('returns null when no laps have i1_speed populated', () => {
    const laps: LapInput[] = [{ ...makeLap(1, 0), i1_speed: null, i2_speed: null }];
    const result = deriveSectorBoundaries({
      laps,
      carData: makeCarData(1, 0),
      locations: makeLocations(1, 0),
      transform: TRANSFORM,
      polyline: POLYLINE,
      arcLengthTable: ARC,
    });
    expect(result).toBeNull();
  });

  it('returns null when car_data missing for the lap window', () => {
    const result = deriveSectorBoundaries({
      laps: [makeLap(1, 0)],
      carData: [], // empty
      locations: makeLocations(1, 0),
      transform: TRANSFORM,
      polyline: POLYLINE,
      arcLengthTable: ARC,
    });
    expect(result).toBeNull();
  });

  it('filters out sentinel locations (|x|+|y|+|z| < 50)', () => {
    // car_data peaks at i1 within sentinel window — should reject location, return null
    const lap = makeLap(1, 0);
    const sentinels: LocationInput[] = [];
    for (let i = 0; i <= 900; i++) {
      sentinels.push({
        driver_number: 1,
        date: new Date(SESSION_START + i * 100),
        x: 1,
        y: 1,
        z: 1,
      });
    }
    const result = deriveSectorBoundaries({
      laps: [lap],
      carData: makeCarData(1, 0),
      locations: sentinels,
      transform: TRANSFORM,
      polyline: POLYLINE,
      arcLengthTable: ARC,
    });
    expect(result).toBeNull();
  });
});
