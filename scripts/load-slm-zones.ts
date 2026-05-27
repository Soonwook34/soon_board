#!/usr/bin/env tsx
// live-map plan §1.3.5 + §10 단계 11 — SLM zone 정적 로더 CLI.
// 사용: npm run load:slm -- --key=63 --year=2026

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { loadSlmZonesFromRaw, type SlmRawFile } from './_lib/slmZonesLoader.js';
import {
  readTrackOutlinesIndex,
  upsertTrackOutlinesIndex,
} from './_lib/trackOutlinesIndex.js';
import type { SlmZonesJson, TrackOutlineJson } from './_lib/trackOutlinesSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');
const DEFAULT_RAW_PATH = join(REPO_ROOT, 'data/slm-zones-raw.json');
const SLM_SOURCE = 'FIA approved activation zones (manual curation)';

export interface RunLoadSlmOptions {
  outputDir?: string;
  rawPath?: string;
  circuit_key: number;
  year: number;
  now?: Date;
}

export interface RunLoadSlmResult {
  filePath: string;
  zoneCount: number;
}

export async function runLoadSlm(opts: RunLoadSlmOptions): Promise<RunLoadSlmResult | null> {
  const outDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const rawPath = opts.rawPath ?? DEFAULT_RAW_PATH;
  const trackPath = join(outDir, `${opts.circuit_key}-${opts.year}.json`);
  if (!existsSync(trackPath)) {
    throw new Error(`Track JSON not found: ${trackPath}. Run fetch:maps first.`);
  }
  if (!existsSync(rawPath)) {
    throw new Error(`SLM raw seed not found: ${rawPath}.`);
  }
  const track = JSON.parse(readFileSync(trackPath, 'utf8')) as TrackOutlineJson;
  const raw = JSON.parse(readFileSync(rawPath, 'utf8')) as SlmRawFile;

  const zones = loadSlmZonesFromRaw({
    raw,
    circuit_key: opts.circuit_key,
    year: opts.year,
    totalLength: track.total_length,
  });
  if (zones === null) {
    console.warn(
      `[load:slm] no raw entry for ${opts.circuit_key}-${opts.year} in ${rawPath} — skip`,
    );
    return null;
  }
  const now = opts.now ?? new Date();
  const output: SlmZonesJson = {
    circuit_key: opts.circuit_key,
    year: opts.year,
    zones,
    source: SLM_SOURCE,
    generated_at: now.toISOString(),
  };
  const outPath = join(outDir, `slmZones_${opts.circuit_key}-${opts.year}.json`);
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
      drs_zones: existing?.drs_zones,
      slm_zones: true,
      openf1_transform_confidence: existing?.openf1_transform_confidence ?? null,
      generated_at: now.toISOString(),
    },
    { now },
  );
  return { filePath: outPath, zoneCount: zones.length };
}

function parseCli(): { circuit_key: number; year: number } {
  const args = process.argv.slice(2);
  const out: { circuit_key?: number; year?: number } = {};
  for (const a of args) {
    if (a.startsWith('--key=')) out.circuit_key = Number(a.slice(6));
    else if (a.startsWith('--year=')) out.year = Number(a.slice(7));
  }
  if (out.circuit_key == null || out.year == null) {
    console.error('Usage: load-slm-zones --key=<circuit_key> --year=<year>');
    process.exit(2);
  }
  return { circuit_key: out.circuit_key, year: out.year };
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const cli = parseCli();
  runLoadSlm({ circuit_key: cli.circuit_key, year: cli.year })
    .then((r) => {
      if (!r) {
        console.warn('[load:slm] nothing written');
        process.exit(0);
      }
      console.log(`[load:slm] wrote ${r.filePath} (${r.zoneCount} zones)`);
    })
    .catch((err) => {
      console.error('[load:slm] failed', err);
      process.exit(1);
    });
}
