#!/usr/bin/env tsx
// live-map plan §1.3.3 + §10 단계 9 — Sector boundary derive CLI.
//
// 사전조건: public/trackOutlines/{key}-{year}.json (Phase 1+2) — openf1_transform 필요.
// 흐름:
//   1. 기존 트랙 JSON 로드 → polyline + arc table + transform 추출
//   2. OpenF1 /v1/sessions 에서 session_key 선택 (기본 Race)
//   3. /v1/laps + /v1/car_data + /v1/location fetch
//   4. deriveSectorBoundaries 호출
//   5. atomic write: sectors_{key}-{year}.json + index.json upsert (sectors flag)
//
// 사용: npm run derive:sectors -- --key=63 --year=2024 [--session-type=Race]

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import { pickPreferredSession } from './_lib/openf1FastLap.js';
import {
  deriveSectorBoundaries,
  type CarDataSpeedInput,
  type LapInput,
  type LocationInput,
} from './_lib/sectorBoundariesDeriver.js';
import {
  readTrackOutlinesIndex,
  upsertTrackOutlinesIndex,
} from './_lib/trackOutlinesIndex.js';
import type { SectorsJson, TrackOutlineJson } from './_lib/trackOutlinesSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');
const SECTORS_METHOD = 'i1_i2_speed_trap_derive';
const SECTORS_ACCURACY_NOTE = 'speed trap position, not exact FIA sector boundary';

export interface RunDeriveSectorsOptions {
  outputDir?: string;
  circuit_key: number;
  year: number;
  client?: OpenF1Client;
  preferredSessionTypes?: string[];
  now?: Date;
}

export interface RunDeriveSectorsResult {
  filePath: string;
  boundaryCount: number;
  i1SampleCount: number;
  i2SampleCount: number;
}

export async function runDeriveSectors(
  opts: RunDeriveSectorsOptions,
): Promise<RunDeriveSectorsResult | null> {
  const outDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const trackPath = join(outDir, `${opts.circuit_key}-${opts.year}.json`);
  if (!existsSync(trackPath)) {
    throw new Error(`Track JSON not found: ${trackPath}. Run fetch:maps + fetch:transform first.`);
  }
  const track = JSON.parse(readFileSync(trackPath, 'utf8')) as TrackOutlineJson;
  if (!track.openf1_transform) {
    throw new Error(`Track ${opts.circuit_key}-${opts.year} missing openf1_transform.`);
  }
  const client = opts.client ?? new OpenF1Client();
  const preferred = opts.preferredSessionTypes ?? ['Race', 'Qualifying'];

  const sessions = await client.get<
    Array<{ session_key: number; session_type: string; year: number; date_start: string; date_end: string }>
  >('/v1/sessions', { circuit_key: opts.circuit_key, year: opts.year });
  const picked = pickPreferredSession(sessions, preferred);
  if (!picked) {
    console.warn(`[derive:sectors] no preferred session for ${opts.circuit_key}-${opts.year}`);
    return null;
  }

  // OpenF1 /v1/location 과 /v1/car_data 는 session-wide 호출 시 422 ("too much data") 반환.
  // session 시작 후 10분 = 약 4~6 lap (F1 lap ~1:20~2:00) — sector/drs derive 에 충분.
  const sessionStart = new Date(picked.date_start);
  const sessionEnd = new Date(picked.date_end);
  const windowEnd = new Date(
    Math.min(sessionStart.getTime() + 10 * 60 * 1000, sessionEnd.getTime()),
  );
  const windowParams = {
    session_key: picked.session_key,
    'date>=': sessionStart.toISOString(),
    'date<=': windowEnd.toISOString(),
  };

  const [lapsRaw, carDataRaw, locationsRaw] = await Promise.all([
    client.get<Array<Record<string, unknown>>>('/v1/laps', { session_key: picked.session_key }),
    client.get<Array<Record<string, unknown>>>('/v1/car_data', windowParams),
    client.get<Array<Record<string, unknown>>>('/v1/location', windowParams),
  ]);

  const laps: LapInput[] = lapsRaw.map((r) => ({
    driver_number: Number(r.driver_number),
    date_start: r.date_start ? new Date(String(r.date_start)) : null,
    lap_duration: r.lap_duration == null ? null : Number(r.lap_duration),
    i1_speed: r.i1_speed == null ? null : Number(r.i1_speed),
    i2_speed: r.i2_speed == null ? null : Number(r.i2_speed),
  }));
  const carData: CarDataSpeedInput[] = carDataRaw.map((r) => ({
    driver_number: Number(r.driver_number),
    date: new Date(String(r.date)),
    speed: Number(r.speed),
  }));
  const locations: LocationInput[] = locationsRaw.map((r) => ({
    driver_number: Number(r.driver_number),
    date: new Date(String(r.date)),
    x: Number(r.x),
    y: Number(r.y),
    z: Number(r.z),
  }));

  const derivation = deriveSectorBoundaries({
    laps,
    carData,
    locations,
    transform: track.openf1_transform,
    polyline: track.polyline.map((p) => [p[0], p[1]] as [number, number]),
    arcLengthTable: [...track.arc_length_table],
  });
  if (!derivation) {
    console.warn(`[derive:sectors] derivation failed (insufficient samples) for ${opts.circuit_key}-${opts.year}`);
    return null;
  }

  const now = opts.now ?? new Date();
  const output: SectorsJson = {
    circuit_key: opts.circuit_key,
    year: opts.year,
    boundaries: derivation.boundaries,
    method: SECTORS_METHOD,
    accuracy_note: SECTORS_ACCURACY_NOTE,
    generated_at: now.toISOString(),
    meta: {
      source_session_key: picked.session_key,
      source_session_type: picked.session_type,
      driver_count: derivation.meta.driver_count,
      lap_count: derivation.meta.lap_count,
      extracted_at: now.toISOString(),
    },
  };
  const outPath = join(outDir, `sectors_${opts.circuit_key}-${opts.year}.json`);
  writeJsonAtomicSync(outPath, output, { pretty: true });

  // upsert index — preserve existing flags
  const index = readTrackOutlinesIndex(outDir);
  const existing = index.entries.find(
    (e) => e.circuit_key === opts.circuit_key && e.year === opts.year,
  );
  upsertTrackOutlinesIndex(
    outDir,
    {
      circuit_key: opts.circuit_key,
      year: opts.year,
      track: existing?.track ?? true,
      pitlane: existing?.pitlane ?? false,
      sectors: true,
      drs_zones: existing?.drs_zones,
      slm_zones: existing?.slm_zones,
      openf1_transform_confidence: existing?.openf1_transform_confidence ?? null,
      generated_at: now.toISOString(),
    },
    { now },
  );
  return {
    filePath: outPath,
    boundaryCount: derivation.boundaries.length,
    i1SampleCount: derivation.meta.i1_sample_count,
    i2SampleCount: derivation.meta.i2_sample_count,
  };
}

function parseCli(): { circuit_key: number; year: number; sessionType?: string } {
  const args = process.argv.slice(2);
  const out: { circuit_key?: number; year?: number; sessionType?: string } = {};
  for (const a of args) {
    if (a.startsWith('--key=')) out.circuit_key = Number(a.slice(6));
    else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
    else if (a.startsWith('--session-type=')) out.sessionType = a.slice(15);
  }
  if (out.circuit_key == null || out.year == null) {
    console.error('Usage: derive-sector-boundaries --key=<circuit_key> --year=<year> [--session-type=Race]');
    process.exit(2);
  }
  return { circuit_key: out.circuit_key, year: out.year, sessionType: out.sessionType };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const cli = parseCli();
  runDeriveSectors({
    circuit_key: cli.circuit_key,
    year: cli.year,
    preferredSessionTypes: cli.sessionType ? [cli.sessionType, 'Race', 'Qualifying'] : undefined,
  })
    .then((r) => {
      if (!r) {
        console.warn('[derive:sectors] nothing written');
        process.exit(0);
      }
      console.log(`[derive:sectors] wrote ${r.filePath} (i1=${r.i1SampleCount}, i2=${r.i2SampleCount})`);
    })
    .catch((err) => {
      console.error('[derive:sectors] failed', err);
      process.exit(1);
    });
}
