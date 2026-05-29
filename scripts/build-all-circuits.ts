#!/usr/bin/env tsx
// live-map plan §10 단계 14 — 78서킷 일괄 처리 인프라.
//
// 한 번의 호출로 circuits.json 의 모든 entry 에 대해 Phase 1 (메인 트랙 polyline) →
// Phase 2 (OpenF1 affine + confidence) → Phase 8 (핏레인 polyline self-trace) →
// Phase 9 (sectors) → Phase 10 (DRS zones, historical-only) → Phase 11 (SLM zones) 를 직렬 실행.
//
// 정책:
//  - **단일 OpenF1Client 공유**: 모든 entry 가 같은 client 인스턴스를 공유해 token-bucket
//    rate limit (25 req/min) 이 전체 합산. 병렬 실행 금지.
//  - **continue-on-error**: 한 서킷의 affine 추출 / 핏레인 추적 실패가 다른 서킷 처리를
//    중단하지 않음. 실패 사유는 residual-report.json 에 기록.
//  - **overlay 는 optional**: Phase 9/10/11 derive 실패는 main entry status 를 'ok' 에서
//    바꾸지 않고 overlays.{phase}.status='failed' 로만 기록. exit code 영향 없음.
//  - **DRS historical-only**: year ≥ 2026 은 자동 'skipped:future' (plan §1.3.4).
//  - **residual-report.json**: 시각 점검 큐 (plan §11 위험표). curate-residual.ts 가 입력으로 사용.
//
// 사용:
//   npm run build:all                       # 전체
//   npm run build:all -- --key=63 --year=2024
//   npm run build:all -- --skip-pitlane     # Phase 2 까지만
//   npm run build:all -- --skip-sectors --skip-drs --skip-slm  # overlay 전체 비활성
//   npm run build:all -- --slm-raw=data/custom-slm.json
//   npm run build:all -- --dry-run          # 처리 계획만 출력 (네트워크 호출 0)

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import {
  buildAll,
  readCircuitsConfig,
  type CircuitEntry,
  type CircuitsConfig,
} from './fetch-circuit-maps.js';
import { runExtract } from './extract-openf1-transform.js';
import { runTracePitlane } from './trace-pitlane.js';
import { runDeriveSectors } from './derive-sector-boundaries.js';
import { runDeriveDrs } from './derive-drs-zones.js';
import { runLoadSlm } from './load-slm-zones.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');
const DEFAULT_CIRCUITS_JSON = join(REPO_ROOT, 'src/map/circuits.json');

export type EntryStatus =
  | 'ok'
  | 'svg-missing'
  | 'extract-failed'
  | 'pitlane-failed';

export interface OverlayStatus {
  status: 'ok' | 'skipped' | 'failed';
  reason?: string;
}

export interface ResidualReportEntry {
  circuit_key: number;
  year: number;
  status: EntryStatus;
  rmse?: number;
  confidence?: number;
  error?: string;
  /** Phase 9/10/11 overlay derive 결과 — main pipeline status='ok' 일 때만 채워짐. 채워질 때는 세 phase 모두 OverlayStatus 보유 (skip/fail/ok). failure 가 entry status 를 바꾸지 않음 (overlay 는 optional). */
  overlays?: {
    sectors: OverlayStatus;
    drs: OverlayStatus;
    slm: OverlayStatus;
  };
}

export interface ResidualReport {
  generated_at: string;
  entries: ResidualReportEntry[];
}

export interface BuildAllCircuitsOptions {
  config: CircuitsConfig;
  outputDir?: string;
  client?: OpenF1Client;
  filter?: { circuit_key?: number; year?: number };
  skipExtract?: boolean;
  skipPitlane?: boolean;
  /** Phase 9 sector boundaries derive 비활성. 기본 false (수행). */
  skipSectors?: boolean;
  /** Phase 10 DRS zone derive 비활성. 기본 false. year ≥ 2026 은 자동 skip (historical-only). */
  skipDrs?: boolean;
  /** Phase 11 SLM zone load 비활성. 기본 false. raw seed 부재 시 'skipped:no-seed'. */
  skipSlm?: boolean;
  /** SLM raw seed JSON 경로 override (test 용). 기본 data/slm-zones-raw.json. */
  slmRawPath?: string;
  dryRun?: boolean;
  now?: Date;
  /** 진행 상황 console 출력 비활성 (test 용). 기본 true. */
  logger?: (msg: string) => void;
}

export interface BuildAllCircuitsResult {
  reportPath: string;
  report: ResidualReport;
  builtCount: number;
  failedCount: number;
}

export async function buildAllCircuits(
  opts: BuildAllCircuitsOptions,
): Promise<BuildAllCircuitsResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const now = opts.now ?? new Date();
  const log = opts.logger ?? ((m: string) => console.log(m));

  const targets = filterEntries(opts.config.circuits, opts.filter);
  if (targets.length === 0) {
    throw new Error(`build-all-circuits: no entries match filter ${JSON.stringify(opts.filter ?? {})}`);
  }

  if (opts.dryRun) {
    log(`[dry-run] would process ${targets.length} circuits (skip-extract=${opts.skipExtract ?? false}, skip-pitlane=${opts.skipPitlane ?? false})`);
    for (const t of targets) log(`[dry-run]   ${t.circuit_key}-${t.year} (${t.circuit_short_name})`);
    return {
      reportPath: join(outputDir, 'residual-report.json'),
      report: { generated_at: now.toISOString(), entries: [] },
      builtCount: 0,
      failedCount: 0,
    };
  }

  // Phase 1 — buildAll (synchronous SVG → polyline). filter applied 후 호출.
  const phase1 = buildAll(opts.config, { outputDir, filter: opts.filter }, now);
  const svgMissing = new Set(phase1.skipped.map((s) => keyOf(s.circuit_key, s.year)));

  const client = opts.client ?? new OpenF1Client();
  const entries: ResidualReportEntry[] = [];

  for (const t of targets) {
    const k = keyOf(t.circuit_key, t.year);
    if (svgMissing.has(k)) {
      const reason =
        phase1.skipped.find((s) => keyOf(s.circuit_key, s.year) === k)?.reason ?? 'SVG missing';
      log(`✗ ${t.circuit_key}-${t.year}: ${reason}`);
      entries.push({ circuit_key: t.circuit_key, year: t.year, status: 'svg-missing', error: reason });
      continue;
    }

    let rmse: number | undefined;
    let confidence: number | undefined;
    if (!opts.skipExtract) {
      try {
        const r = await runExtract({
          outputDir,
          circuit_key: t.circuit_key,
          year: t.year,
          client,
          now,
        });
        rmse = r.rmse;
        confidence = r.confidence;
      } catch (err) {
        const msg = (err as Error).message;
        log(`✗ ${t.circuit_key}-${t.year}: extract failed — ${msg}`);
        entries.push({
          circuit_key: t.circuit_key,
          year: t.year,
          status: 'extract-failed',
          error: msg,
        });
        continue;
      }
    }

    if (!opts.skipPitlane) {
      try {
        await runTracePitlane({
          outputDir,
          circuit_key: t.circuit_key,
          year: t.year,
          client,
          now,
        });
      } catch (err) {
        const msg = (err as Error).message;
        log(`✗ ${t.circuit_key}-${t.year}: pitlane failed — ${msg}`);
        entries.push({
          circuit_key: t.circuit_key,
          year: t.year,
          status: 'pitlane-failed',
          rmse,
          confidence,
          error: msg,
        });
        continue;
      }
    }

    log(
      `✓ ${t.circuit_key}-${t.year}` +
        (confidence !== undefined ? ` confidence=${confidence.toFixed(3)}` : ''),
    );
    const overlays = await runOverlays(t, outputDir, client, opts, now);
    entries.push({
      circuit_key: t.circuit_key,
      year: t.year,
      status: 'ok',
      rmse,
      confidence,
      overlays,
    });
    log(
      `  ▸ sectors ${formatOverlay(overlays.sectors)} / drs ${formatOverlay(overlays.drs)} / slm ${formatOverlay(overlays.slm)}`,
    );
  }

  const report: ResidualReport = { generated_at: now.toISOString(), entries };
  const reportPath = join(outputDir, 'residual-report.json');
  writeJsonAtomicSync(reportPath, report, { pretty: true });

  const builtCount = entries.filter((e) => e.status === 'ok').length;
  const failedCount = entries.length - builtCount;
  log(`build-all-circuits: built ${builtCount} / failed ${failedCount} → ${reportPath}`);

  return { reportPath, report, builtCount, failedCount };
}

type OverlayMap = NonNullable<ResidualReportEntry['overlays']>;

async function runOverlays(
  target: CircuitEntry,
  outputDir: string,
  client: OpenF1Client,
  opts: BuildAllCircuitsOptions,
  now: Date,
): Promise<OverlayMap> {
  const overlays: Partial<OverlayMap> = {};

  if (opts.skipSectors) {
    overlays.sectors = { status: 'skipped', reason: 'flag' };
  } else {
    try {
      const r = await runDeriveSectors({
        outputDir,
        circuit_key: target.circuit_key,
        year: target.year,
        client,
        now,
      });
      overlays.sectors = r ? { status: 'ok' } : { status: 'skipped', reason: 'no-data' };
    } catch (err) {
      overlays.sectors = { status: 'failed', reason: (err as Error).message };
    }
  }

  if (opts.skipDrs) {
    overlays.drs = { status: 'skipped', reason: 'flag' };
  } else if (target.year >= 2026) {
    overlays.drs = { status: 'skipped', reason: 'future' };
  } else {
    try {
      const r = await runDeriveDrs({
        outputDir,
        circuit_key: target.circuit_key,
        year: target.year,
        client,
        now,
      });
      overlays.drs = r ? { status: 'ok' } : { status: 'skipped', reason: 'no-data' };
    } catch (err) {
      overlays.drs = { status: 'failed', reason: (err as Error).message };
    }
  }

  if (opts.skipSlm) {
    overlays.slm = { status: 'skipped', reason: 'flag' };
  } else {
    try {
      const r = await runLoadSlm({
        outputDir,
        rawPath: opts.slmRawPath,
        circuit_key: target.circuit_key,
        year: target.year,
        now,
      });
      overlays.slm = r ? { status: 'ok' } : { status: 'skipped', reason: 'no-seed' };
    } catch (err) {
      overlays.slm = { status: 'failed', reason: (err as Error).message };
    }
  }

  // 위 세 블록(sectors/drs/slm) 의 모든 분기가 각 필드를 반드시 한 번 set — invariant 캐스팅.
  return overlays as OverlayMap;
}

function formatOverlay(o: OverlayStatus): string {
  return o.reason ? `${o.status}:${o.reason}` : o.status;
}

function filterEntries(
  circuits: readonly CircuitEntry[],
  filter: { circuit_key?: number; year?: number } | undefined,
): CircuitEntry[] {
  return circuits.filter((c) => {
    if (filter?.circuit_key !== undefined && c.circuit_key !== filter.circuit_key) return false;
    if (filter?.year !== undefined && c.year !== filter.year) return false;
    return true;
  });
}

function keyOf(k: number, y: number): string {
  return `${k}-${y}`;
}

/**
 * CLI exit gate: svg-missing 은 큐레이션 보류 신호 (인간이 layout-id 매핑 필요) — nightly cron
 * 실패로 표시하지 않는다. 실제 OpenF1/pipeline 실패 (extract/pitlane) 가 있고 single 산출물도
 * 없을 때만 1 반환.
 */
export function shouldExitWithError(result: BuildAllCircuitsResult): boolean {
  if (result.builtCount > 0) return false;
  return result.report.entries.some((e) => e.status !== 'ok' && e.status !== 'svg-missing');
}

// ── CLI ────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): {
  filter: { circuit_key?: number; year?: number };
  skipExtract: boolean;
  skipPitlane: boolean;
  skipSectors: boolean;
  skipDrs: boolean;
  skipSlm: boolean;
  slmRawPath?: string;
  dryRun: boolean;
} {
  const filter: { circuit_key?: number; year?: number } = {};
  let skipExtract = false;
  let skipPitlane = false;
  let skipSectors = false;
  let skipDrs = false;
  let skipSlm = false;
  let slmRawPath: string | undefined;
  let dryRun = false;
  for (const arg of argv) {
    const km = /^--key=(\d+)$/.exec(arg);
    if (km) filter.circuit_key = Number(km[1]);
    const ym = /^--year=(\d+)$/.exec(arg);
    if (ym) filter.year = Number(ym[1]);
    if (arg === '--skip-extract') skipExtract = true;
    if (arg === '--skip-pitlane') skipPitlane = true;
    if (arg === '--skip-sectors') skipSectors = true;
    if (arg === '--skip-drs') skipDrs = true;
    if (arg === '--skip-slm') skipSlm = true;
    const rawMatch = /^--slm-raw=(.+)$/.exec(arg);
    if (rawMatch) slmRawPath = rawMatch[1];
    if (arg === '--dry-run') dryRun = true;
  }
  return { filter, skipExtract, skipPitlane, skipSectors, skipDrs, skipSlm, slmRawPath, dryRun };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const args = parseCliArgs(process.argv.slice(2));
  const config = readCircuitsConfig(DEFAULT_CIRCUITS_JSON);
  buildAllCircuits({
    config,
    filter: args.filter,
    skipExtract: args.skipExtract,
    skipPitlane: args.skipPitlane,
    skipSectors: args.skipSectors,
    skipDrs: args.skipDrs,
    skipSlm: args.skipSlm,
    slmRawPath: args.slmRawPath,
    dryRun: args.dryRun,
  })
    .then((r) => {
      if (shouldExitWithError(r)) process.exit(1);
    })
    .catch((err: unknown) => {
      console.error('build-all-circuits failed:', err);
      process.exit(1);
    });
}
