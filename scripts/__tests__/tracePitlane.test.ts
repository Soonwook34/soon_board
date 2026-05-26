// scripts/trace-pitlane.ts — CLI 통합 + atomic write + index upsert 회귀.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCliArgs, runTracePitlane } from '../trace-pitlane.js';
import type { OpenF1Client } from '../_lib/openf1Client.js';
import type { TrackOutlineJson } from '../_lib/trackOutlinesSchema.js';

const TMP = join(tmpdir(), `trace-pitlane-test-${process.pid}`);

function setupMainTrack(circuitKey: number, year: number): void {
  const json: TrackOutlineJson = {
    circuit_key: circuitKey,
    year,
    circuit_short_name: 'Test',
    country_name: 'Testland',
    source: 'julesr0y/f1-circuits-svg',
    source_file: 'test.svg',
    license: 'CC-BY-4.0',
    viewBox: [0, 0, 500, 500],
    polyline: [
      [0, 250],
      [500, 250],
    ],
    arc_length_table: [0, 500],
    total_length: 500,
    start_finish_index: 0,
    direction: 'clockwise',
    generated_at: '2024-01-01T00:00:00Z',
    openf1_transform: {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
      reflection: false,
    },
  };
  mkdirSync(TMP, { recursive: true });
  writeFileSync(join(TMP, `${circuitKey}-${year}.json`), JSON.stringify(json));
}

function makeMockClient(opts: {
  sessions?: unknown;
  pitStops?: unknown;
  locations?: unknown;
}): OpenF1Client {
  return {
    get: vi.fn(async (path: string) => {
      if (path === '/v1/sessions') return opts.sessions ?? [];
      if (path === '/v1/pit') return opts.pitStops ?? [];
      if (path === '/v1/location') return opts.locations ?? [];
      throw new Error(`mock: no route for ${path}`);
    }),
  } as unknown as OpenF1Client;
}

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('parseCliArgs', () => {
  it('--key=63 --year=2024 --session-type=Race --bucket=5 --pad=3', () => {
    const parsed = parseCliArgs(['--key=63', '--year=2024', '--session-type=Race', '--bucket=5', '--pad=3']);
    expect(parsed.circuit_key).toBe(63);
    expect(parsed.year).toBe(2024);
    expect(parsed.preferredSessionTypes).toEqual(['Race']);
    expect(parsed.bucketWidth).toBe(5);
    expect(parsed.padSec).toBe(3);
  });
});

describe('runTracePitlane', () => {
  it('mock OpenF1 → pitlane_{key}-{year}.json + index 업데이트', async () => {
    setupMainTrack(63, 2024);
    const client = makeMockClient({
      sessions: [{ session_key: 9472, session_type: 'Race', year: 2024 }],
      pitStops: [
        { driver_number: 44, date: '2024-03-02T15:00:00Z', lap_number: 10, pit_duration: 22.5 },
      ],
      locations: [
        // valid pit locations on main polyline ([0,250]-[500,250]) offset y=-10
        { date: '2024-03-02T15:00:00Z', driver_number: 44, x: 100, y: 240, z: 5 },
        { date: '2024-03-02T15:00:05Z', driver_number: 44, x: 200, y: 240, z: 5 },
        { date: '2024-03-02T15:00:10Z', driver_number: 44, x: 300, y: 240, z: 5 },
        { date: '2024-03-02T15:00:15Z', driver_number: 44, x: 400, y: 240, z: 5 },
      ],
    });
    const result = await runTracePitlane({
      outputDir: TMP,
      circuit_key: 63,
      year: 2024,
      client,
      bucketWidth: 50,
      now: new Date('2024-03-02T20:00:00Z'),
    });
    expect(result.polylineLength).toBeGreaterThan(0);
    expect(result.rawSampleCount).toBe(4);
    // 산출 파일 존재
    const written = JSON.parse(readFileSync(join(TMP, 'pitlane_63-2024.json'), 'utf8'));
    expect(written.circuit_key).toBe(63);
    expect(written.year).toBe(2024);
    expect(written.polyline.length).toBeGreaterThan(0);
    expect(written.meta.source_session_key).toBe(9472);
    expect(written.meta.pit_stop_count).toBe(1);
    // index 업데이트 + pitlane=true
    const idx = JSON.parse(readFileSync(join(TMP, 'index.json'), 'utf8'));
    const entry = idx.entries.find(
      (e: { circuit_key: number; year: number }) => e.circuit_key === 63 && e.year === 2024,
    );
    expect(entry.pitlane).toBe(true);
    expect(entry.track).toBe(true); // default true (existing entry 없을 때)
  });

  it('main track JSON 부재 시 명확한 에러', async () => {
    const client = makeMockClient({});
    await expect(
      runTracePitlane({ outputDir: TMP, circuit_key: 999, year: 2024, client }),
    ).rejects.toThrow(/missing/);
  });

  it('openf1_transform 누락 시 명확한 에러', async () => {
    const json = {
      circuit_key: 63,
      year: 2024,
      circuit_short_name: 'Test',
      country_name: 'X',
      source: 'x',
      source_file: 'x',
      license: 'CC-BY-4.0',
      viewBox: [0, 0, 500, 500],
      polyline: [
        [0, 0],
        [500, 0],
      ],
      arc_length_table: [0, 500],
      total_length: 500,
      start_finish_index: 0,
      direction: 'clockwise',
      generated_at: '2024-01-01T00:00:00Z',
      // openf1_transform 없음
    };
    mkdirSync(TMP, { recursive: true });
    writeFileSync(join(TMP, '63-2024.json'), JSON.stringify(json));
    const client = makeMockClient({});
    await expect(
      runTracePitlane({ outputDir: TMP, circuit_key: 63, year: 2024, client }),
    ).rejects.toThrow(/openf1_transform/);
  });

  it('빈 pit data → polyline 길이 0, 파일은 여전히 작성', async () => {
    setupMainTrack(63, 2024);
    const client = makeMockClient({
      sessions: [{ session_key: 1, session_type: 'Race', year: 2024 }],
      pitStops: [],
      locations: [],
    });
    const result = await runTracePitlane({
      outputDir: TMP,
      circuit_key: 63,
      year: 2024,
      client,
      now: new Date('2024-03-02T20:00:00Z'),
    });
    expect(result.polylineLength).toBe(0);
    const written = JSON.parse(readFileSync(join(TMP, 'pitlane_63-2024.json'), 'utf8'));
    expect(written.polyline).toEqual([]);
    expect(written.total_length).toBe(0);
  });

  it('선호하는 session type 이 없으면 에러', async () => {
    setupMainTrack(63, 2024);
    const client = makeMockClient({
      sessions: [{ session_key: 1, session_type: 'Practice 1', year: 2024 }],
    });
    await expect(
      runTracePitlane({
        outputDir: TMP,
        circuit_key: 63,
        year: 2024,
        client,
        preferredSessionTypes: ['Race', 'Qualifying'],
      }),
    ).rejects.toThrow(/preferred session types/);
  });
});
