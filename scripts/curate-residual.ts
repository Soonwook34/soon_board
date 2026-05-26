#!/usr/bin/env tsx
// live-map plan §10 단계 14 — 잔차 큐레이션 CLI (시각 점검 큐 listing).
//
// trackOutlines/index.json + residual-report.json 을 결합해 confidence 낮은 순서로 listing.
// 인간 큐레이터가 시각 점검 우선순위를 정할 때 사용.
//
// 사용:
//   npm run curate:residual                       # threshold=0.7 default, 미달만 표시
//   npm run curate:residual -- --threshold=0.9
//   npm run curate:residual -- --all              # 전체 표시
//   npm run curate:residual -- --json             # machine-readable

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  TrackOutlinesEntry,
  TrackOutlinesIndex,
} from './_lib/trackOutlinesIndex.js';
import type { ResidualReport, ResidualReportEntry } from './build-all-circuits.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');
const DEFAULT_THRESHOLD = 0.7;

export interface CurateRow {
  circuit_key: number;
  year: number;
  confidence: number | null;
  rmse: number | null;
  status: ResidualReportEntry['status'];
  error?: string;
}

export interface CurateOptions {
  outputDir?: string;
  threshold?: number;
  all?: boolean;
}

export function curateResidual(opts: CurateOptions = {}): CurateRow[] {
  const dir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const all = opts.all ?? false;

  const index = readJsonOrNull<TrackOutlinesIndex>(join(dir, 'index.json'));
  const report = readJsonOrNull<ResidualReport>(join(dir, 'residual-report.json'));

  // index entries → CurateRow (status 는 report 가 있으면 그것을 사용, 없으면 'ok' default).
  const reportByKey = new Map<string, ResidualReportEntry>();
  if (report) {
    for (const e of report.entries) reportByKey.set(`${e.circuit_key}-${e.year}`, e);
  }

  const rows: CurateRow[] = (index?.entries ?? []).map((idx: TrackOutlinesEntry) => {
    const r = reportByKey.get(`${idx.circuit_key}-${idx.year}`);
    return {
      circuit_key: idx.circuit_key,
      year: idx.year,
      confidence: idx.openf1_transform_confidence,
      rmse: r?.rmse ?? null,
      status: r?.status ?? 'ok',
      error: r?.error,
    };
  });

  // report 에는 있지만 index 에는 없는 entry (svg-missing) 도 표시.
  for (const e of report?.entries ?? []) {
    const key = `${e.circuit_key}-${e.year}`;
    if (rows.some((r) => `${r.circuit_key}-${r.year}` === key)) continue;
    rows.push({
      circuit_key: e.circuit_key,
      year: e.year,
      confidence: e.confidence ?? null,
      rmse: e.rmse ?? null,
      status: e.status,
      error: e.error,
    });
  }

  // confidence 오름차순 (null/실패는 가장 위 = 가장 시급).
  rows.sort((a, b) => {
    const av = a.status !== 'ok' || a.confidence === null ? -1 : a.confidence;
    const bv = b.status !== 'ok' || b.confidence === null ? -1 : b.confidence;
    return av - bv;
  });

  if (all) return rows;
  return rows.filter((r) => r.status !== 'ok' || r.confidence === null || r.confidence < threshold);
}

export function formatRow(r: CurateRow): string {
  const conf = r.confidence === null ? '   N/A' : r.confidence.toFixed(3);
  const rmse = r.rmse === null ? '  N/A' : r.rmse.toFixed(2);
  const err = r.error ? ` — ${r.error}` : '';
  return `${String(r.circuit_key).padStart(4)}-${r.year}  confidence=${conf}  rmse=${rmse}  status=${r.status}${err}`;
}

function readJsonOrNull<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (err) {
    console.warn(`[curate-residual] failed to parse ${path}: ${(err as Error).message}`);
    return null;
  }
}

// ── CLI ────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): { threshold?: number; all: boolean; json: boolean } {
  let threshold: number | undefined;
  let all = false;
  let json = false;
  for (const arg of argv) {
    const tm = /^--threshold=([\d.]+)$/.exec(arg);
    if (tm) threshold = Number(tm[1]);
    if (arg === '--all') all = true;
    if (arg === '--json') json = true;
  }
  return { threshold, all, json };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const args = parseCliArgs(process.argv.slice(2));
  const rows = curateResidual({ threshold: args.threshold, all: args.all });
  if (args.json) {
    console.log(JSON.stringify({ count: rows.length, rows }, null, 2));
  } else {
    if (rows.length === 0) {
      console.log('curate-residual: no entries to review (all ok and above threshold).');
    } else {
      console.log(`curate-residual: ${rows.length} entries (sorted by confidence ↑)`);
      for (const r of rows) console.log(formatRow(r));
    }
  }
}
