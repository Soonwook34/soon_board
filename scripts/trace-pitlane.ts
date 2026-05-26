#!/usr/bin/env tsx
// live-map plan §1.3.2 + §10 단계 8 — 핏레인 polyline self-trace.
//
// 사전조건: public/trackOutlines/{key}-{year}.json (Phase 1+2) — openf1_transform 필요.
// 흐름:
//   1. 기존 트랙 JSON 로드 → openf1_transform 추출
//   2. OpenF1 /v1/sessions 에서 (key, year, session_type) 의 session_key 선택 (기본 Race)
//   3. fetchPitStops → fetchPitLocations → applyTransformAndFilter
//   4. tracePitlanePolyline (main polyline 기준 bucket-median smoothing)
//   5. atomic write: pitlane_{key}-{year}.json + index.json (track flag 보존)
//
// 사용:
//   npm run trace:pitlane -- --key=63 --year=2024 [--session-type=Race]

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import {
  applyTransformAndFilter,
  fetchPitLocations,
  fetchPitStops,
  tracePitlanePolyline,
  type TracePitlaneResult,
} from './_lib/pitlaneTracer.js';
import { pickPreferredSession } from './_lib/openf1FastLap.js';
import {
  readTrackOutlinesIndex,
  upsertTrackOutlinesIndex,
} from './_lib/trackOutlinesIndex.js';
import type { PitlaneJson, TrackOutlineJson } from './_lib/trackOutlinesSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');

const DEFAULT_PREFERRED_SESSION_TYPES = ['Race', 'Qualifying'];
const PITLANE_SOURCE = 'OpenF1 pit + location self-trace';
const PITLANE_LICENSE = 'CC0-1.0';

export type { PitlaneJson } from './_lib/trackOutlinesSchema.js';

export interface RunTracePitlaneOptions {
  outputDir?: string;
  circuit_key: number;
  year: number;
  client?: OpenF1Client;
  preferredSessionTypes?: string[];
  bucketWidth?: number;
  padSec?: number;
  now?: Date;
}

export interface RunTracePitlaneResult {
  filePath: string;
  polylineLength: number;
  rawSampleCount: number;
  filteredSampleCount: number;
}

interface RawSession {
  session_key: number;
  session_type: string;
  year: number;
  meeting_key?: number;
  circuit_key?: number;
}

function readTrackOutline(filePath: string): TrackOutlineJson {
  if (!existsSync(filePath)) {
    throw new Error(
      `trace-pitlane: missing ${filePath}. Run Phase 1 (fetch-circuit-maps) + Phase 2 (extract-openf1-transform) first.`,
    );
  }
  const raw = readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as TrackOutlineJson;
  if (!parsed.openf1_transform) {
    throw new Error(
      `trace-pitlane: ${filePath} has no openf1_transform. Run Phase 2 (extract-openf1-transform) first.`,
    );
  }
  return parsed;
}

export async function runTracePitlane(opts: RunTracePitlaneOptions): Promise<RunTracePitlaneResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const filePath = join(outputDir, `pitlane_${opts.circuit_key}-${opts.year}.json`);
  const mainTrackPath = join(outputDir, `${opts.circuit_key}-${opts.year}.json`);
  const mainTrack = readTrackOutline(mainTrackPath);
  const client = opts.client ?? new OpenF1Client();
  const now = opts.now ?? new Date();
  const preferred = opts.preferredSessionTypes ?? DEFAULT_PREFERRED_SESSION_TYPES;

  // Step 1: sessions → pick session_key
  const sessions = await client.get<RawSession[]>('/v1/sessions', {
    circuit_key: opts.circuit_key,
    year: opts.year,
  });
  if (sessions.length === 0) {
    throw new Error(`OpenF1: no sessions for circuit_key=${opts.circuit_key} year=${opts.year}`);
  }
  const session = pickPreferredSession(sessions, preferred);
  if (!session) {
    throw new Error(
      `OpenF1: none of preferred session types (${preferred.join(', ')}) for circuit_key=${opts.circuit_key} year=${opts.year}`,
    );
  }

  // Step 2-3: pit stops → locations → SVG xy
  const pitStops = await fetchPitStops({ client, session_key: session.session_key });
  const rawLocations = await fetchPitLocations({
    client,
    session_key: session.session_key,
    pitStops,
    padSec: opts.padSec,
  });
  const svgPoints = applyTransformAndFilter(rawLocations, mainTrack.openf1_transform!);

  // Step 4: trace polyline
  const traced: TracePitlaneResult = tracePitlanePolyline(
    svgPoints,
    [...mainTrack.polyline],
    [...mainTrack.arc_length_table],
    { bucketWidth: opts.bucketWidth },
  );

  // Step 5: write atomic + upsert index (track flag 보존)
  const bucketWidth = opts.bucketWidth ?? 5;
  const output: PitlaneJson = {
    circuit_key: opts.circuit_key,
    year: opts.year,
    source: PITLANE_SOURCE,
    license: PITLANE_LICENSE,
    polyline: traced.polyline,
    arc_length_table: traced.arcLengthTable,
    total_length: traced.totalLength,
    meta: {
      source_session_key: session.session_key,
      source_session_type: session.session_type,
      pit_stop_count: pitStops.length,
      raw_sample_count: rawLocations.length,
      filtered_sample_count: svgPoints.length,
      bucket_width: bucketWidth,
      extracted_at: now.toISOString(),
    },
    generated_at: now.toISOString(),
  };
  writeJsonAtomicSync(filePath, output);

  // index.json 갱신 — track flag + transform_confidence 보존
  const currentIndex = readTrackOutlinesIndex(outputDir);
  const existingEntry = currentIndex.entries.find(
    (e) => e.circuit_key === opts.circuit_key && e.year === opts.year,
  );
  upsertTrackOutlinesIndex(
    outputDir,
    {
      circuit_key: opts.circuit_key,
      year: opts.year,
      track: existingEntry?.track ?? true,
      pitlane: true,
      openf1_transform_confidence: existingEntry?.openf1_transform_confidence ?? null,
      generated_at: now.toISOString(),
    },
    { now },
  );

  return {
    filePath,
    polylineLength: traced.polyline.length,
    rawSampleCount: rawLocations.length,
    filteredSampleCount: svgPoints.length,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): Partial<RunTracePitlaneOptions> {
  const out: Partial<RunTracePitlaneOptions> = {};
  for (const arg of argv) {
    const km = /^--key=(\d+)$/.exec(arg);
    if (km) out.circuit_key = Number(km[1]);
    const ym = /^--year=(\d+)$/.exec(arg);
    if (ym) out.year = Number(ym[1]);
    const stm = /^--session-type=([\w,]+)$/.exec(arg);
    if (stm) out.preferredSessionTypes = stm[1].split(',');
    const bm = /^--bucket=([\d.]+)$/.exec(arg);
    if (bm) out.bucketWidth = Number(bm[1]);
    const pm = /^--pad=([\d.]+)$/.exec(arg);
    if (pm) out.padSec = Number(pm[1]);
  }
  return out;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.circuit_key == null || parsed.year == null) {
    console.error('Usage: trace-pitlane --key=63 --year=2024 [--session-type=Race] [--bucket=5] [--pad=5]');
    process.exit(2);
  }
  runTracePitlane({
    circuit_key: parsed.circuit_key,
    year: parsed.year,
    preferredSessionTypes: parsed.preferredSessionTypes,
    bucketWidth: parsed.bucketWidth,
    padSec: parsed.padSec,
  })
    .then((r) => {
      console.log(
        `✓ pitlane_${parsed.circuit_key}-${parsed.year}.json — polyline ${r.polylineLength} pts (raw ${r.rawSampleCount} → filtered ${r.filteredSampleCount})`,
      );
    })
    .catch((err: unknown) => {
      console.error('trace-pitlane failed:', err);
      process.exit(1);
    });
}
