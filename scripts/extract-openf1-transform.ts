#!/usr/bin/env tsx
// public/trackOutlines/{key}-{year}.json 에 openf1_transform + confidence 필드 추가 —
// live-map §2.2 + §10 단계 2.
//
// 흐름:
//   1. 기존 trackOutlines/{key}-{year}.json 읽음 (Phase 1 산출)
//   2. OpenF1 에서 (circuit_key, year) 의 fastest valid lap location samples 수집 (Phase 2 US-002)
//   3. SVG polyline + OpenF1 polyline 을 균등 호 길이로 동일 N 점 재샘플링
//   4. 2D Procrustes (allowReflection=true) 로 affine 추정
//   5. 변환된 OpenF1 polyline 의 잔차 (SVG polyline 까지 평균 거리) 산출
//   6. confidence = max(0, 1 - rmse / threshold) (기본 threshold 5 viewBox 단위)
//   7. atomic write: trackOutlines/{key}-{year}.json + index.json
//
// 사용:
//   npm run fetch:transform -- --key=63 --year=2024
//   npx tsx scripts/extract-openf1-transform.ts --key=63 --year=2024 --samples=200
//
// 잔차 초과 시 abort 하지 않고 confidence 를 낮춰 저장 + console.warn (시각 점검 큐).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import {
  arcLengthResample,
  applyAffine2D,
  fitSimilarity2D,
  icpRefine,
  residualToPolyline,
  type Affine2D,
  type Point2D,
} from './_lib/openf1Affine.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import {
  fetchFastLapLocations,
  type FastLapResult,
} from './_lib/openf1FastLap.js';
import { upsertTrackOutlinesIndex } from './_lib/trackOutlinesIndex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');

const DEFAULT_SAMPLE_COUNT = 200;
const RESIDUAL_THRESHOLD = 5; // viewBox 단위. plan §2.2 fail-by-default.

// ── data shapes (trackOutlines JSON) ────────────────────────────────────

export interface OpenF1AffineJson {
  scale: number;
  rotation_deg: number;
  translate: [number, number];
  /** 미지정 시 false. */
  reflection?: boolean;
}

export interface TrackOutlineJson {
  circuit_key: number;
  year: number;
  circuit_short_name: string;
  country_name: string;
  source: string;
  source_file: string;
  license: string;
  viewBox: [number, number, number, number];
  polyline: [number, number][];
  arc_length_table: number[];
  total_length: number;
  start_finish_index: number;
  direction: 'clockwise' | 'counter-clockwise';
  generated_at: string;
  openf1_transform?: OpenF1AffineJson;
  openf1_transform_confidence?: number;
  openf1_transform_meta?: {
    rmse: number;
    sample_count: number;
    source_session_key: number;
    source_session_type: string;
    source_driver_number: number;
    source_lap_number: number;
    source_lap_duration: number;
    extracted_at: string;
    /** 진단용: 최적 cyclic shift index (시작점 정합). */
    shift_index?: number;
    /** 진단용: OpenF1 polyline 역순으로 뒤집어 정합했는지 (CW/CCW 불일치 시 true). */
    reversed?: boolean;
  };
}

// ── pure: extractTransform (테스트 용이) ────────────────────────────────

export interface ExtractInput {
  svgPolyline: Point2D[];
  openf1Samples: { x: number; y: number }[];
  /** 양 polyline 을 재샘플링할 점 개수. 기본 200. */
  sampleCount?: number;
  /** 잔차 임계치 (viewBox 단위). 기본 5. */
  threshold?: number;
}

export interface ExtractResult {
  transform: Affine2D;
  /** 변환된 OpenF1 polyline 의 SVG polyline 까지 평균 거리 (viewBox 단위). */
  rmse: number;
  /** [0, 1]. 잔차가 0 이면 1, threshold 도달하면 0. */
  confidence: number;
  sampleCount: number;
  /** 임계치 초과 여부. true 면 시각 점검 큐로 이동. */
  exceedsThreshold: boolean;
  /** 진단용: 선택된 cyclic shift index (OpenF1 polyline 의 시작 정합). */
  shiftIndex: number;
  /** 진단용: OpenF1 polyline 을 역순으로 뒤집어 정합했는지 (CW/CCW 불일치 해소). */
  reversed: boolean;
}

export function extractTransform(input: ExtractInput): ExtractResult {
  const n = input.sampleCount ?? DEFAULT_SAMPLE_COUNT;
  const threshold = input.threshold ?? RESIDUAL_THRESHOLD;
  if (input.svgPolyline.length < 2) {
    throw new Error('extractTransform: svgPolyline length < 2');
  }
  if (input.openf1Samples.length < 2) {
    throw new Error('extractTransform: need at least 2 OpenF1 samples');
  }

  const openf1Polyline: Point2D[] = input.openf1Samples.map((s) => [s.x, s.y] as Point2D);

  // 양쪽을 동일 N 으로 균등 호 길이 재샘플링
  const svgResampled = arcLengthResample(input.svgPolyline, n);
  const openf1Resampled = arcLengthResample(openf1Polyline, n);

  // 시작점 misalignment + 트랙 방향 불일치를 흡수하기 위해
  // cyclic shift × direction reversal × reflection 검색 (reflection 은 fitSimilarity2D 내부 처리).
  // closed loop 의 마지막 closing point (== 첫 점) 을 빼고 N-1 만 회전.
  const baseN = openf1Resampled.length - 1; // closing 제외
  const openf1Ring = openf1Resampled.slice(0, baseN);
  const orientations: Point2D[][] = [openf1Ring, [...openf1Ring].reverse()];

  type Fit = ReturnType<typeof fitSimilarity2D>;
  let best: { fit: Fit; shift: number; reversed: boolean } | null = null;
  for (let dirIdx = 0; dirIdx < orientations.length; dirIdx++) {
    const candidate = orientations[dirIdx];
    for (let k = 0; k < baseN; k++) {
      // closing point 를 다시 붙여 svgResampled 와 길이 동일하게.
      const rotated = candidate.slice(k).concat(candidate.slice(0, k));
      rotated.push(rotated[0]); // close
      const fit = fitSimilarity2D(rotated, svgResampled, { allowReflection: true });
      if (!best || fit.rmse < best.fit.rmse) {
        best = { fit, shift: k, reversed: dirIdx === 1 };
      }
    }
  }
  const winner = best!;

  // ICP refinement — cyclic shift Procrustes 로 얻은 초기 affine 을 시작점으로
  // SVG polyline 의 최근접점으로 correspondence 를 재구성해 반복 정합.
  // 시작점 misalignment 잔여 + julesr0y 단순화 outline vs 실 telemetry 모양 차이 흡수.
  const refined = icpRefine(openf1Polyline, input.svgPolyline, winner.fit, {
    maxIterations: 15,
    tolerance: 0.001,
  });

  // 최종 잔차: 변환된 OpenF1 의 모든 점이 SVG polyline (원본 high-density) 까지 평균 거리
  const transformed = openf1Polyline.map((p) => applyAffine2D(p, refined));
  const rmse = residualToPolyline(transformed, input.svgPolyline);

  const confidence = computeConfidence(rmse, threshold);

  return {
    transform: { ...refined } as Affine2D,
    rmse,
    confidence,
    sampleCount: n,
    exceedsThreshold: rmse > threshold,
    shiftIndex: winner.shift,
    reversed: winner.reversed,
  };
}

/**
 * Confidence 공식:
 *   - rmse ≤ threshold/2 : 1.0  (이상적인 정합)
 *   - rmse ≥ threshold*3  : 0.0  (정합 신뢰 불가)
 *   - 그 사이: 선형 감쇠
 *
 * plan §11 위험: threshold 초과는 시각 점검 큐로 분류 (exceedsThreshold). 단 confidence
 * 자체는 grade — Bahrain 의 julesr0y minimal outline 단순화 noise floor (~5.5) 같은
 * 케이스도 0 이 아닌 합리적 점수를 받아 dashboard 의 신뢰 표지로 활용 가능.
 */
export function computeConfidence(rmse: number, threshold: number): number {
  if (!(rmse >= 0)) return 0;
  const ideal = threshold * 0.5;
  const useless = threshold * 3;
  if (rmse <= ideal) return 1;
  if (rmse >= useless) return 0;
  return 1 - (rmse - ideal) / (useless - ideal);
}

// ── disk I/O ────────────────────────────────────────────────────────────

export function readTrackOutline(filePath: string): TrackOutlineJson {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as TrackOutlineJson;
}

export function writeTrackOutlineWithTransform(
  filePath: string,
  existing: TrackOutlineJson,
  fastLap: FastLapResult,
  result: ExtractResult,
  now: Date,
): TrackOutlineJson {
  const transformJson: OpenF1AffineJson = {
    scale: result.transform.scale,
    rotation_deg: result.transform.rotation_deg,
    translate: [result.transform.translate[0], result.transform.translate[1]],
  };
  if (result.transform.reflection) transformJson.reflection = true;

  const next: TrackOutlineJson = {
    ...existing,
    openf1_transform: transformJson,
    openf1_transform_confidence: result.confidence,
    openf1_transform_meta: {
      rmse: result.rmse,
      sample_count: result.sampleCount,
      source_session_key: fastLap.session_key,
      source_session_type: fastLap.session_type,
      source_driver_number: fastLap.driver_number,
      source_lap_number: fastLap.lap_number,
      source_lap_duration: fastLap.lap_duration,
      extracted_at: now.toISOString(),
      shift_index: result.shiftIndex,
      reversed: result.reversed,
    },
  };
  writeJsonAtomicSync(filePath, next);
  return next;
}

// ── 통합 entry (build-time 또는 CLI) ──────────────────────────────────

export interface RunOptions {
  outputDir?: string;
  circuit_key: number;
  year: number;
  client?: OpenF1Client;
  sampleCount?: number;
  threshold?: number;
  now?: Date;
  /** session_type 선호 순서 override (fetchFastLapLocations 으로 전달). */
  preferredSessionTypes?: string[];
}

export interface RunResult {
  filePath: string;
  rmse: number;
  confidence: number;
  exceedsThreshold: boolean;
}

export async function runExtract(opts: RunOptions): Promise<RunResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const filePath = join(outputDir, `${opts.circuit_key}-${opts.year}.json`);
  const existing = readTrackOutline(filePath);
  const client = opts.client ?? new OpenF1Client();
  const now = opts.now ?? new Date();

  const fastLap = await fetchFastLapLocations({
    client,
    circuit_key: opts.circuit_key,
    year: opts.year,
    preferredSessionTypes: opts.preferredSessionTypes,
  });
  if (fastLap.samples.length < 2) {
    throw new Error(
      `OpenF1: insufficient non-sentinel location samples (${fastLap.samples.length}) for fit`,
    );
  }

  const result = extractTransform({
    svgPolyline: existing.polyline,
    openf1Samples: fastLap.samples,
    sampleCount: opts.sampleCount,
    threshold: opts.threshold,
  });

  if (result.exceedsThreshold) {
    console.warn(
      `! ${opts.circuit_key}-${opts.year}: rmse=${result.rmse.toFixed(2)} > threshold ${opts.threshold ?? RESIDUAL_THRESHOLD} (visual review queue, confidence=${result.confidence.toFixed(3)})`,
    );
  }

  writeTrackOutlineWithTransform(filePath, existing, fastLap, result, now);
  upsertTrackOutlinesIndex(
    outputDir,
    {
      circuit_key: existing.circuit_key,
      year: existing.year,
      track: true,
      pitlane: false,
      openf1_transform_confidence: result.confidence,
      generated_at: now.toISOString(),
    },
    { now },
  );

  return {
    filePath,
    rmse: result.rmse,
    confidence: result.confidence,
    exceedsThreshold: result.exceedsThreshold,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): {
  circuit_key?: number;
  year?: number;
  sampleCount?: number;
  threshold?: number;
  preferredSessionTypes?: string[];
} {
  const out: {
    circuit_key?: number;
    year?: number;
    sampleCount?: number;
    threshold?: number;
    preferredSessionTypes?: string[];
  } = {};
  for (const arg of argv) {
    const km = /^--key=(\d+)$/.exec(arg);
    if (km) out.circuit_key = Number(km[1]);
    const ym = /^--year=(\d+)$/.exec(arg);
    if (ym) out.year = Number(ym[1]);
    const sm = /^--samples=(\d+)$/.exec(arg);
    if (sm) out.sampleCount = Number(sm[1]);
    const tm = /^--threshold=([\d.]+)$/.exec(arg);
    if (tm) out.threshold = Number(tm[1]);
    const stm = /^--session-type=([\w,]+)$/.exec(arg);
    if (stm) out.preferredSessionTypes = stm[1].split(',');
  }
  return out;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.circuit_key === undefined || args.year === undefined) {
    console.error('Usage: extract-openf1-transform --key=N --year=YYYY [--samples=200] [--threshold=5]');
    process.exit(2);
  }
  runExtract({
    circuit_key: args.circuit_key,
    year: args.year,
    sampleCount: args.sampleCount,
    threshold: args.threshold,
    preferredSessionTypes: args.preferredSessionTypes,
  }).then(
    (r) => {
      console.log(
        `✓ ${args.circuit_key}-${args.year}: rmse=${r.rmse.toFixed(2)} confidence=${r.confidence.toFixed(3)} (${r.exceedsThreshold ? 'EXCEEDS threshold' : 'within threshold'})`,
      );
    },
    (err: unknown) => {
      console.error(`✗ ${args.circuit_key}-${args.year}: ${(err as Error).message}`);
      process.exit(1);
    },
  );
}
