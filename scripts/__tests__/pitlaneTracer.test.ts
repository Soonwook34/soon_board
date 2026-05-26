// scripts/_lib/pitlaneTracer.ts — plan §1.3.2 회귀.

import { describe, expect, it, vi } from 'vitest';
import {
  applyTransformAndFilter,
  fetchPitLocations,
  fetchPitStops,
  tracePitlanePolyline,
  type RawPitLocation,
} from '../_lib/pitlaneTracer.js';
import type { OpenF1Client } from '../_lib/openf1Client.js';
import type { Point2D } from '../../src/map/viewport.js';

function makeMockClient(routes: Record<string, unknown>): OpenF1Client {
  return {
    get: vi.fn(async (path: string, params?: Record<string, unknown>) => {
      const key = `${path}?${JSON.stringify(params ?? {})}`;
      const hit = routes[path] ?? routes[key];
      if (hit === undefined) throw new Error(`mock client: no route for ${path}`);
      return hit;
    }),
  } as unknown as OpenF1Client;
}

const IDENTITY_TRANSFORM = {
  scale: 1,
  rotation_deg: 0,
  translate: [0, 0] as [number, number],
  reflection: false,
};

describe('fetchPitStops', () => {
  it('OpenF1 /v1/pit response 를 PitStop[] 으로 변환 (pit_duration null 제외)', async () => {
    const client = makeMockClient({
      '/v1/pit': [
        { driver_number: 44, date: '2024-03-02T15:00:00Z', lap_number: 10, pit_duration: 22.5 },
        { driver_number: 1, date: '2024-03-02T15:30:00Z', lap_number: 20, pit_duration: null },
        { driver_number: 11, date: '2024-03-02T15:45:00Z', lap_number: 22, pit_duration: 24.1 },
      ],
    });
    const stops = await fetchPitStops({ client, session_key: 9472 });
    expect(stops).toHaveLength(2);
    expect(stops[0].driver_number).toBe(44);
    expect(stops[0].lane_duration).toBe(22.5);
    expect(stops[1].driver_number).toBe(11);
  });
});

describe('fetchPitLocations', () => {
  it('각 pit stop 마다 [date_start-pad, date_start+lane_duration+pad] 윈도우로 location fetch', async () => {
    const calls: Array<Record<string, unknown> | undefined> = [];
    const client = {
      get: vi.fn(async (_path: string, params?: Record<string, unknown>) => {
        calls.push(params);
        return [
          {
            date: '2024-03-02T15:00:00Z',
            driver_number: params?.driver_number,
            x: 100,
            y: 50,
            z: 0,
          },
        ];
      }),
    } as unknown as OpenF1Client;
    const stops = [
      { driver_number: 44, date_start: new Date('2024-03-02T15:00:00Z'), lane_duration: 22.5 },
    ];
    const locs = await fetchPitLocations({ client, session_key: 9472, pitStops: stops, padSec: 5 });
    expect(locs).toHaveLength(1);
    expect(locs[0].driver_number).toBe(44);
    expect(calls[0]?.['driver_number']).toBe(44);
    expect(calls[0]?.['date>=']).toBe(new Date('2024-03-02T14:59:55Z').toISOString());
    // window end = date_start (15:00:00) + lane_duration (22.5s) + pad (5s) = 15:00:27.500
    expect(calls[0]?.['date<=']).toBe(new Date('2024-03-02T15:00:27.500Z').toISOString());
  });
});

describe('applyTransformAndFilter', () => {
  it('sentinel (|x|+|y|+|z| < 50) 제거', () => {
    const locs: RawPitLocation[] = [
      { date: new Date(0), x: 10, y: 10, z: 5, driver_number: 44 }, // |x+y+z|=25 → sentinel
      { date: new Date(0), x: 100, y: 50, z: 0, driver_number: 44 }, // 150 → 통과
    ];
    const out = applyTransformAndFilter(locs, IDENTITY_TRANSFORM);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual([100, 50]);
  });
  it('affine 적용 (identity 검증)', () => {
    const locs: RawPitLocation[] = [
      { date: new Date(0), x: 200, y: 300, z: 10, driver_number: 1 },
    ];
    const out = applyTransformAndFilter(locs, IDENTITY_TRANSFORM);
    expect(out[0][0]).toBeCloseTo(200);
    expect(out[0][1]).toBeCloseTo(300);
  });
});

describe('tracePitlanePolyline', () => {
  // 직선 main polyline (0,0)→(1000,0). pitlane svgPoints 는 (s, -10) 처럼 main 옆 직선.
  const MAIN: Point2D[] = [
    [0, 0],
    [1000, 0],
  ];
  const MAIN_S = [0, 1000];

  it('직선 svgPoints (s, -10) → polyline 길이 ≈ main 길이, arc 단조 증가', () => {
    const pts: Point2D[] = [];
    for (let s = 0; s <= 1000; s += 5) pts.push([s, -10]);
    const result = tracePitlanePolyline(pts, MAIN, MAIN_S, { bucketWidth: 5 });
    expect(result.polyline.length).toBeGreaterThan(150);
    expect(result.totalLength).toBeGreaterThan(900);
    for (let i = 1; i < result.arcLengthTable.length; i++) {
      expect(result.arcLengthTable[i]).toBeGreaterThanOrEqual(result.arcLengthTable[i - 1]);
    }
  });

  it('outlier 1 개 — bucket median 이 영향받지 않음', () => {
    // bucket [495, 500) 에 정상 5점 + outlier 1점
    const pts: Point2D[] = [
      [495, -10],
      [496, -10],
      [497, -10],
      [498, -10],
      [499, -10],
      [497, -500], // outlier
    ];
    const result = tracePitlanePolyline(pts, MAIN, MAIN_S, { bucketWidth: 5 });
    // 정상 6점의 y median 은 -10 (정렬 후 mid 가 -10). outlier 가 mid 가 아닌 위치
    expect(result.polyline[0][1]).toBeCloseTo(-10);
  });

  it('빈 입력 → 빈 polyline', () => {
    const result = tracePitlanePolyline([], MAIN, MAIN_S);
    expect(result.polyline).toEqual([]);
    expect(result.arcLengthTable).toEqual([]);
    expect(result.totalLength).toBe(0);
  });

  it('bucketWidth 가 작을수록 polyline 점 개수 증가', () => {
    const pts: Point2D[] = [];
    for (let s = 0; s < 100; s += 1) pts.push([s, -10]);
    const fine = tracePitlanePolyline(pts, MAIN, MAIN_S, { bucketWidth: 2 });
    const coarse = tracePitlanePolyline(pts, MAIN, MAIN_S, { bucketWidth: 10 });
    expect(fine.polyline.length).toBeGreaterThan(coarse.polyline.length);
  });

  it('arc_length_table[0] === 0, 마지막 === totalLength', () => {
    const pts: Point2D[] = [];
    for (let s = 0; s <= 100; s += 5) pts.push([s, -10]);
    const result = tracePitlanePolyline(pts, MAIN, MAIN_S, { bucketWidth: 5 });
    expect(result.arcLengthTable[0]).toBe(0);
    expect(result.arcLengthTable[result.arcLengthTable.length - 1]).toBeCloseTo(result.totalLength);
  });
});
