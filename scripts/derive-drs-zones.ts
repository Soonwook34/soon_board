#!/usr/bin/env tsx
// live-map plan §1.3.4 + §10 단계 10 — DRS zone derive CLI (historical 전용, 2023~2025).
//
// 사용: npm run derive:drs -- --key=63 --year=2024

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import { pickPreferredSession } from './_lib/openf1FastLap.js';
import {
  deriveDrsZones,
  type CarDataDrsInput,
  type DrsLocationInput,
} from './_lib/drsZonesDeriver.js';
import {
  readTrackOutlinesIndex,
  upsertTrackOutlinesIndex,
} from './_lib/trackOutlinesIndex.js';
import type { DrsZonesJson, TrackOutlineJson } from './_lib/trackOutlinesSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');
const DRS_METHOD = 'drs_state_transitions_clustering';
const DRS_COVERAGE_NOTE = '2025 Dutch GP 이후 일부 세션에서 F1 이 DRS 데이터 제한 → 해당 세션은 부분 zone 만 산출 가능';

export interface RunDeriveDrsOptions {
  outputDir?: string;
  circuit_key: number;
  year: number;
  client?: OpenF1Client;
  preferredSessionTypes?: string[];
  now?: Date;
}

export interface RunDeriveDrsResult {
  filePath: string;
  zoneCount: number;
  detectionCount: number;
}

export async function runDeriveDrs(opts: RunDeriveDrsOptions): Promise<RunDeriveDrsResult | null> {
  if (opts.year >= 2026) {
    throw new Error(`DRS zone derive is historical-only (2023~2025). year=${opts.year} not supported (live-map plan §1.3.4).`);
  }
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

  const sessions = await client.get<Array<{ session_key: number; session_type: string; year: number }>>(
    '/v1/sessions',
    { circuit_key: opts.circuit_key, year: opts.year },
  );
  const picked = pickPreferredSession(sessions, preferred);
  if (!picked) {
    console.warn(`[derive:drs] no preferred session for ${opts.circuit_key}-${opts.year}`);
    return null;
  }

  const [carDataRaw, locationsRaw] = await Promise.all([
    client.get<Array<Record<string, unknown>>>('/v1/car_data', { session_key: picked.session_key }),
    client.get<Array<Record<string, unknown>>>('/v1/location', { session_key: picked.session_key }),
  ]);
  const carData: CarDataDrsInput[] = carDataRaw
    .filter((r) => r.drs != null)
    .map((r) => ({
      driver_number: Number(r.driver_number),
      date: new Date(String(r.date)),
      drs: Number(r.drs),
    }));
  const locations: DrsLocationInput[] = locationsRaw.map((r) => ({
    driver_number: Number(r.driver_number),
    date: new Date(String(r.date)),
    x: Number(r.x),
    y: Number(r.y),
    z: Number(r.z),
  }));

  const derivation = deriveDrsZones({
    carData,
    locations,
    transform: track.openf1_transform,
    polyline: track.polyline.map((p) => [p[0], p[1]] as [number, number]),
    arcLengthTable: [...track.arc_length_table],
    totalLength: track.total_length,
  });
  if (!derivation) {
    console.warn(`[derive:drs] derivation failed for ${opts.circuit_key}-${opts.year}`);
    return null;
  }

  const now = opts.now ?? new Date();
  const output: DrsZonesJson = {
    circuit_key: opts.circuit_key,
    year: opts.year,
    zones: derivation.zones,
    method: DRS_METHOD,
    coverage_note: DRS_COVERAGE_NOTE,
    generated_at: now.toISOString(),
    meta: {
      source_session_key: picked.session_key,
      source_session_type: picked.session_type,
      driver_count: derivation.meta.driver_count,
      transition_count:
        derivation.meta.detection_count +
        derivation.meta.activation_start_count +
        derivation.meta.activation_end_count,
      extracted_at: now.toISOString(),
    },
  };
  const outPath = join(outDir, `drsZones_${opts.circuit_key}-${opts.year}.json`);
  writeJsonAtomicSync(outPath, output, { pretty: true });

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
      sectors: existing?.sectors,
      drs_zones: true,
      slm_zones: existing?.slm_zones,
      openf1_transform_confidence: existing?.openf1_transform_confidence ?? null,
      generated_at: now.toISOString(),
    },
    { now },
  );
  return {
    filePath: outPath,
    zoneCount: derivation.zones.length,
    detectionCount: derivation.meta.detection_count,
  };
}

function parseCli(): { circuit_key: number; year: number } {
  const args = process.argv.slice(2);
  const out: { circuit_key?: number; year?: number } = {};
  for (const a of args) {
    if (a.startsWith('--key=')) out.circuit_key = Number(a.slice(6));
    else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
  }
  if (out.circuit_key == null || out.year == null) {
    console.error('Usage: derive-drs-zones --key=<circuit_key> --year=<year>');
    process.exit(2);
  }
  return { circuit_key: out.circuit_key, year: out.year };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const cli = parseCli();
  runDeriveDrs({ circuit_key: cli.circuit_key, year: cli.year })
    .then((r) => {
      if (!r) {
        console.warn('[derive:drs] nothing written');
        process.exit(0);
      }
      console.log(`[derive:drs] wrote ${r.filePath} (${r.zoneCount} zones, ${r.detectionCount} detections)`);
    })
    .catch((err) => {
      console.error('[derive:drs] failed', err);
      process.exit(1);
    });
}
