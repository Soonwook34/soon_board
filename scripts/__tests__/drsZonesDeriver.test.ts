import { describe, expect, it } from 'vitest';
import {
  deriveDrsZones,
  type CarDataDrsInput,
  type DrsLocationInput,
} from '../_lib/drsZonesDeriver.js';
import type { OpenF1Transform } from '../../src/map/transform.js';

const POLY: Array<[number, number]> = [
  [0, 0],
  [400, 0],
  [400, 400],
  [0, 400],
  [0, 0],
];
const ARC = [0, 400, 800, 1200, 1600];
const TOTAL = 1600;
const TRANSFORM: OpenF1Transform = {
  scale: 1,
  rotation_deg: 0,
  translate: [0, 0],
  reflection: false,
};

const SESSION_START = new Date('2024-03-02T15:00:00Z').valueOf();

/** Driver runs N laps. Each lap: drs=0 (warm), drs=8 (detection) at sec=20, drs=10 (active) at sec=30, drs=0 (off) at sec=50. */
function makeDriverLaps(driver: number, laps: number): { car: CarDataDrsInput[]; loc: DrsLocationInput[] } {
  const car: CarDataDrsInput[] = [];
  const loc: DrsLocationInput[] = [];
  const lapSec = 80;
  for (let lap = 0; lap < laps; lap++) {
    const lapStart = SESSION_START + lap * lapSec * 1000;
    // car_data at 0.1s cadence with drs transitions.
    for (let i = 0; i <= lapSec * 10; i++) {
      const t = lapStart + i * 100;
      const sec = i * 0.1;
      let drs = 0;
      if (sec >= 20 && sec < 30) drs = 8; // detection
      else if (sec >= 30 && sec < 50) drs = 10; // activation
      else drs = 0;
      car.push({ driver_number: driver, date: new Date(t), drs });
    }
    // location follows the square track: 0-40s top edge, 40-80s right+bottom+left.
    for (let i = 0; i <= lapSec * 10; i++) {
      const t = lapStart + i * 100;
      const sec = i * 0.1;
      let x = 0;
      let y = 0;
      if (sec <= 40) {
        x = (sec / 40) * 400;
        y = 0;
      } else {
        x = 400;
        y = ((sec - 40) / 40) * 400;
      }
      loc.push({ driver_number: driver, date: new Date(t), x, y, z: 1 });
    }
  }
  return { car, loc };
}

describe('deriveDrsZones', () => {
  it('clusters drs transitions across 3 drivers × 3 laps → single zone', () => {
    const car: CarDataDrsInput[] = [];
    const loc: DrsLocationInput[] = [];
    for (const d of [1, 2, 3]) {
      const { car: c, loc: l } = makeDriverLaps(d, 3);
      car.push(...c);
      loc.push(...l);
    }
    const result = deriveDrsZones({
      carData: car,
      locations: loc,
      transform: TRANSFORM,
      polyline: POLY,
      arcLengthTable: ARC,
      totalLength: TOTAL,
    });
    expect(result).not.toBeNull();
    const r = result!;
    expect(r.zones).toHaveLength(1);
    const z = r.zones[0];
    // detection at sec=20 → location ~(200,0) → arc ~200
    expect(z.detection_s).toBeGreaterThan(150);
    expect(z.detection_s).toBeLessThan(250);
    // activation_start at sec=30 → location ~(300,0) → arc ~300
    expect(z.activation_s_start).toBeGreaterThan(250);
    expect(z.activation_s_start).toBeLessThan(350);
    // activation_end at sec=50 → location ~(400,100) → arc ~500
    expect(z.activation_s_end).toBeGreaterThan(450);
    expect(z.activation_s_end).toBeLessThan(550);
    expect(r.meta.driver_count).toBe(3);
    expect(r.meta.detection_count).toBeGreaterThanOrEqual(3);
  });

  it('returns null when carData is empty', () => {
    expect(
      deriveDrsZones({
        carData: [],
        locations: [],
        transform: TRANSFORM,
        polyline: POLY,
        arcLengthTable: ARC,
        totalLength: TOTAL,
      }),
    ).toBeNull();
  });

  it('returns null when locations missing for the driver with carData', () => {
    const { car } = makeDriverLaps(1, 1);
    expect(
      deriveDrsZones({
        carData: car,
        locations: [],
        transform: TRANSFORM,
        polyline: POLY,
        arcLengthTable: ARC,
        totalLength: TOTAL,
      }),
    ).toBeNull();
  });

  it('handles single driver (clustering still works with N=1)', () => {
    const { car, loc } = makeDriverLaps(1, 3);
    const result = deriveDrsZones({
      carData: car,
      locations: loc,
      transform: TRANSFORM,
      polyline: POLY,
      arcLengthTable: ARC,
      totalLength: TOTAL,
    });
    expect(result).not.toBeNull();
    expect(result!.zones).toHaveLength(1);
  });
});
