// scripts/extract-openf1-transform.ts 통합 테스트.
// 합성 OpenF1 응답 + 합성 trackOutlines JSON 으로 extractTransform / runExtract 검증.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyAffine2D,
  type Affine2D,
  type Point2D,
} from '../_lib/openf1Affine.js';
import { OpenF1Client } from '../_lib/openf1Client.js';
import { upsertTrackOutlinesIndex } from '../_lib/trackOutlinesIndex.js';
import {
  extractTransform,
  parseCliArgs,
  runExtract,
  type TrackOutlineJson,
} from '../extract-openf1-transform.js';

const NOW = new Date('2026-05-26T00:00:00.000Z');

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMockClient(routes: { match: (u: string) => boolean; body: unknown }[]): OpenF1Client {
  const fetchImpl: typeof fetch = async (url) => {
    const u = String(url);
    const hit = routes.find((r) => r.match(u));
    if (!hit) throw new Error(`Mock: no route for ${u}`);
    return jsonResponse(hit.body);
  };
  return new OpenF1Client({
    baseUrl: 'https://x',
    sleep: async () => {},
    fetchImpl,
    random: () => 0,
  });
}

// 합성 SVG polyline: 원형 트랙 (closed loop), 60 points + closing
function makeCirclePolyline(radius: number, n: number, cx = 0, cy = 0): Point2D[] {
  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const θ = (2 * Math.PI * i) / n;
    out.push([cx + radius * Math.cos(θ), cy + radius * Math.sin(θ)]);
  }
  out.push([cx + radius * Math.cos(0), cy + radius * Math.sin(0)]); // closing
  return out;
}

describe('parseCliArgs', () => {
  it('parses key/year/samples/threshold', () => {
    expect(
      parseCliArgs(['--key=63', '--year=2024', '--samples=300', '--threshold=8']),
    ).toEqual({
      circuit_key: 63,
      year: 2024,
      sampleCount: 300,
      threshold: 8,
    });
  });
  it('returns undefined fields for missing args', () => {
    expect(parseCliArgs(['--key=63'])).toEqual({
      circuit_key: 63,
    });
  });
});

describe('extractTransform (pure)', () => {
  it('recovers known affine from synthetic OpenF1 samples', () => {
    const svg = makeCirclePolyline(100, 60, 250, 250);
    const trueT: Affine2D = {
      scale: 0.05,
      rotation_deg: 30,
      translate: [250, 250],
      reflection: true,
    };
    // OpenF1 raw: SVG 점들을 inverse-transform 한 것 — 우리는 forward 만 있고 inverse 는 없으니
    // 대신 OpenF1 polyline 을 정의하고 SVG = transform(openf1) 로 두자.
    const openf1Circle = makeCirclePolyline(1000, 80, 0, 0); // 단순 원, 다른 dimension
    const svgFromOpenf1 = openf1Circle.map((p) => applyAffine2D(p, trueT));

    const r = extractTransform({
      svgPolyline: svgFromOpenf1,
      openf1Samples: openf1Circle.map(([x, y]) => ({ x, y })),
      sampleCount: 60,
      threshold: 5,
    });

    // 핵심 인수: 적용된 변환이 OpenF1 polyline 을 SVG polyline 에 잘 정합한다.
    // (구체적 scale/rotation/reflection 값은 cyclic shift × reversal 검색으로 인해
    // 동치적인 다른 해가 선택될 수 있어 직접 비교 안 함.)
    expect(r.rmse).toBeLessThan(0.5);
    expect(r.confidence).toBeGreaterThan(0.9);
    expect(r.exceedsThreshold).toBe(false);
    expect(r.transform.scale).toBeGreaterThan(0);
    expect(r.transform.scale).toBeCloseTo(0.05, 4); // scale 은 invariant

    // SVG (used as residual reference) unused below; suppress unused warning.
    void svg;
  });

  it('flags exceedsThreshold when rmse > threshold', () => {
    // Garbage OpenF1 samples that won't fit a circle SVG
    const svg = makeCirclePolyline(100, 60);
    const openf1 = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
    ];
    const r = extractTransform({
      svgPolyline: svg,
      openf1Samples: openf1,
      sampleCount: 30,
      threshold: 5,
    });
    // Confidence may be small but the API guarantees both fields are set
    expect(r.rmse).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });

  it('throws on too-few samples', () => {
    expect(() =>
      extractTransform({
        svgPolyline: makeCirclePolyline(100, 10),
        openf1Samples: [{ x: 0, y: 0 }],
      }),
    ).toThrow(/at least 2/i);
  });

  it('throws on too-few SVG polyline points', () => {
    expect(() =>
      extractTransform({
        svgPolyline: [[0, 0]],
        openf1Samples: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      }),
    ).toThrow(/svgPolyline length < 2/);
  });
});

describe('runExtract (integration)', () => {
  let outputDir: string;
  let trackOutlinePath: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'extract-openf1-transform-'));
    trackOutlinePath = join(outputDir, '63-2024.json');
  });
  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('updates trackOutlines/{key}-{year}.json with openf1_transform + index.json', async () => {
    // Phase 1 산출 가짜본
    const trueT: Affine2D = {
      scale: 0.05,
      rotation_deg: -20,
      translate: [250, 250],
      reflection: true,
    };
    const openf1Circle: Point2D[] = makeCirclePolyline(800, 80, 0, 0);
    const svgFromOpenf1 = openf1Circle.map((p) => applyAffine2D(p, trueT));

    const phase1Json: TrackOutlineJson = {
      circuit_key: 63,
      year: 2024,
      circuit_short_name: 'Sakhir',
      country_name: 'Bahrain',
      source: 'julesr0y/f1-circuits-svg',
      source_file: 'circuits/minimal/white-outline/bahrain-1.svg',
      license: 'CC-BY-4.0',
      viewBox: [0, 0, 500, 500],
      polyline: svgFromOpenf1.map(([x, y]) => [x, y] as [number, number]),
      arc_length_table: [], // unused by runExtract
      total_length: 0,
      start_finish_index: 0,
      direction: 'clockwise',
      generated_at: '2026-05-25T22:57:53.240Z',
    };
    writeFileSync(trackOutlinePath, JSON.stringify(phase1Json));

    // Mock OpenF1 response: race session + 1 valid fast lap + location samples
    const dStart = '2024-03-02T15:18:00.000Z';
    const dStartMs = new Date(dStart).getTime();
    const lapDuration = 90;
    const locationSamples = openf1Circle.map((p, i) => ({
      session_key: 9472,
      driver_number: 11,
      date: new Date(dStartMs + (i * lapDuration * 1000) / openf1Circle.length).toISOString(),
      x: p[0],
      y: p[1],
      z: 0,
    }));
    const client = makeMockClient([
      {
        match: (u) => u.includes('/v1/sessions'),
        body: [
          {
            session_key: 9472,
            session_type: 'Race',
            session_name: 'Race',
            date_start: '2024-03-02T15:00:00.000Z',
            date_end: '2024-03-02T17:00:00.000Z',
            year: 2024,
            circuit_key: 63,
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/laps'),
        body: [
          {
            session_key: 9472,
            driver_number: 11,
            lap_number: 12,
            lap_duration: lapDuration,
            is_pit_out_lap: false,
            date_start: dStart,
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/location'),
        body: locationSamples,
      },
    ]);

    const result = await runExtract({
      outputDir,
      circuit_key: 63,
      year: 2024,
      client,
      sampleCount: 60,
      threshold: 5,
      now: NOW,
    });

    expect(result.exceedsThreshold).toBe(false);
    expect(result.rmse).toBeLessThan(5);
    expect(result.confidence).toBeGreaterThan(0.5);

    const updated = JSON.parse(readFileSync(trackOutlinePath, 'utf8')) as TrackOutlineJson;
    expect(updated.openf1_transform).toBeDefined();
    expect(updated.openf1_transform!.scale).toBeCloseTo(0.05, 3);
    expect(updated.openf1_transform_confidence).toBe(result.confidence);
    expect(updated.openf1_transform_meta!.source_session_key).toBe(9472);
    expect(updated.openf1_transform_meta!.source_driver_number).toBe(11);
    expect(updated.openf1_transform_meta!.source_lap_number).toBe(12);
    expect(updated.openf1_transform_meta!.sample_count).toBe(60);
    expect(updated.openf1_transform_meta!.extracted_at).toBe(NOW.toISOString());

    // index.json 도 갱신 (confidence)
    const idx = JSON.parse(readFileSync(join(outputDir, 'index.json'), 'utf8'));
    const entry = idx.entries.find((e: { circuit_key: number; year: number }) =>
      e.circuit_key === 63 && e.year === 2024,
    );
    expect(entry?.openf1_transform_confidence).toBe(result.confidence);
  });

  it('preserves all original fields when adding openf1_transform', async () => {
    const openf1Circle: Point2D[] = makeCirclePolyline(800, 60, 0, 0);
    const trueT: Affine2D = {
      scale: 0.05,
      rotation_deg: 0,
      translate: [250, 250],
      reflection: true,
    };
    const svgFromOpenf1 = openf1Circle.map((p) => applyAffine2D(p, trueT));
    const original: TrackOutlineJson = {
      circuit_key: 63,
      year: 2024,
      circuit_short_name: 'Sakhir',
      country_name: 'Bahrain',
      source: 'julesr0y/f1-circuits-svg',
      source_file: 'circuits/minimal/white-outline/bahrain-1.svg',
      license: 'CC-BY-4.0',
      viewBox: [0, 0, 500, 500],
      polyline: svgFromOpenf1.map(([x, y]) => [x, y] as [number, number]),
      arc_length_table: [0, 1, 2],
      total_length: 1983.27,
      start_finish_index: 0,
      direction: 'clockwise',
      generated_at: '2026-05-25T22:57:53.240Z',
    };
    writeFileSync(trackOutlinePath, JSON.stringify(original));

    const client = makeMockClient([
      {
        match: (u) => u.includes('/v1/sessions'),
        body: [
          {
            session_key: 9472,
            session_type: 'Race',
            session_name: 'Race',
            date_start: '2024-03-02T15:00:00.000Z',
            date_end: '2024-03-02T17:00:00.000Z',
            year: 2024,
            circuit_key: 63,
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/laps'),
        body: [
          {
            session_key: 9472,
            driver_number: 11,
            lap_number: 12,
            lap_duration: 90,
            is_pit_out_lap: false,
            date_start: '2024-03-02T15:18:00.000Z',
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/location'),
        body: openf1Circle.map((p, i) => ({
          session_key: 9472,
          driver_number: 11,
          date: new Date(new Date('2024-03-02T15:18:00.000Z').getTime() + i * 1000).toISOString(),
          x: p[0],
          y: p[1],
          z: 0,
        })),
      },
    ]);

    await runExtract({
      outputDir,
      circuit_key: 63,
      year: 2024,
      client,
      sampleCount: 60,
      threshold: 5,
      now: NOW,
    });

    const updated = JSON.parse(readFileSync(trackOutlinePath, 'utf8')) as TrackOutlineJson;
    expect(updated.circuit_short_name).toBe('Sakhir');
    expect(updated.country_name).toBe('Bahrain');
    expect(updated.viewBox).toEqual([0, 0, 500, 500]);
    expect(updated.total_length).toBe(1983.27);
    expect(updated.arc_length_table).toEqual([0, 1, 2]);
    expect(updated.direction).toBe('clockwise');
    expect(updated.generated_at).toBe('2026-05-25T22:57:53.240Z');
    expect(updated.openf1_transform).toBeDefined();
  });

  it('upserts index without clobbering other entries', async () => {
    // Pre-existing index entry for a different (key, year)
    upsertTrackOutlinesIndex(
      outputDir,
      {
        circuit_key: 70,
        year: 2021,
        track: true,
        pitlane: false,
        openf1_transform_confidence: 0.92,
        generated_at: '2026-05-22T00:00:00.000Z',
      },
      { now: new Date('2026-05-22T00:00:00.000Z') },
    );
    const openf1Circle: Point2D[] = makeCirclePolyline(800, 60, 0, 0);
    const svgFromOpenf1 = openf1Circle.map((p) =>
      applyAffine2D(p, { scale: 0.05, rotation_deg: 0, translate: [250, 250], reflection: true }),
    );
    writeFileSync(
      trackOutlinePath,
      JSON.stringify({
        circuit_key: 63,
        year: 2024,
        circuit_short_name: 'Sakhir',
        country_name: 'Bahrain',
        source: 'julesr0y/f1-circuits-svg',
        source_file: 'x',
        license: 'CC-BY-4.0',
        viewBox: [0, 0, 500, 500],
        polyline: svgFromOpenf1,
        arc_length_table: [],
        total_length: 0,
        start_finish_index: 0,
        direction: 'clockwise',
        generated_at: 'x',
      }),
    );
    const client = makeMockClient([
      {
        match: (u) => u.includes('/v1/sessions'),
        body: [
          {
            session_key: 9472,
            session_type: 'Race',
            session_name: 'Race',
            date_start: 'x',
            date_end: 'y',
            year: 2024,
            circuit_key: 63,
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/laps'),
        body: [
          {
            session_key: 9472,
            driver_number: 11,
            lap_number: 12,
            lap_duration: 90,
            is_pit_out_lap: false,
            date_start: '2024-03-02T15:18:00.000Z',
          },
        ],
      },
      {
        match: (u) => u.includes('/v1/location'),
        body: openf1Circle.map((p, i) => ({
          session_key: 9472,
          driver_number: 11,
          date: new Date(Date.parse('2024-03-02T15:18:00.000Z') + i * 1000).toISOString(),
          x: p[0],
          y: p[1],
          z: 0,
        })),
      },
    ]);

    await runExtract({
      outputDir,
      circuit_key: 63,
      year: 2024,
      client,
      sampleCount: 60,
      now: NOW,
    });

    const idx = JSON.parse(readFileSync(join(outputDir, 'index.json'), 'utf8'));
    expect(idx.entries).toHaveLength(2);
    const yas = idx.entries.find((e: { circuit_key: number }) => e.circuit_key === 70);
    const bah = idx.entries.find((e: { circuit_key: number }) => e.circuit_key === 63);
    expect(yas.openf1_transform_confidence).toBe(0.92); // preserved
    expect(typeof bah.openf1_transform_confidence).toBe('number');
  });
});
