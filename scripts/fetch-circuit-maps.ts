#!/usr/bin/env tsx
// 서킷 트랙 SVG → public/trackOutlines/{key}-{year}.json — live-map §1.3.1 + 단계 1.
//
// 입력:
//   - src/map/circuits.json (변환 대상 목록)
//   - vendor/f1-circuits-svg/circuits/{variant}/{layoutId}.svg (git submodule)
//
// 출력:
//   - public/trackOutlines/{circuit_key}-{year}.json  (atomic write, critic C3)
//   - public/trackOutlines/index.json                  (atomic upsert)
//
// 사용법:
//   npm run fetch:maps              (circuits.json 전체)
//   npx tsx scripts/fetch-circuit-maps.ts --key=63 --year=2024  (단일 entry)
//
// Phase 1 단계 — affine transform·핏레인 추적은 별도 스크립트 (Phase 2/8).
//
// Submodule 미초기화 시: vendor 디렉토리가 비어 있어 SVG 못 읽음 → 명확한 에러 메시지로 안내.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { svgToPolyline } from './_lib/svgToPolyline.js';
import { upsertTrackOutlinesIndex } from './_lib/trackOutlinesIndex.js';
import type { TrackOutlineJson } from './_lib/trackOutlinesSchema.js';
export type { TrackOutlineJson } from './_lib/trackOutlinesSchema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_VENDOR_ROOT = join(REPO_ROOT, 'vendor/f1-circuits-svg');
const DEFAULT_CIRCUITS_JSON = join(REPO_ROOT, 'src/map/circuits.json');
const DEFAULT_OUTPUT_DIR = join(REPO_ROOT, 'public/trackOutlines');

export interface CircuitEntry {
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
  julesr0y_layout_id: string;
  /** Overrides default_variant. */
  variant?: string;
  /** 트랙 방향 (메타). 기본 clockwise — F1 다수가 그러함. */
  direction?: 'clockwise' | 'counter-clockwise';
}

export interface CircuitsConfig {
  default_variant: string;
  circuits: CircuitEntry[];
}

export interface BuildOptions {
  vendorRoot?: string;
  outputDir?: string;
  /** 특정 (key, year) 만 처리. 미지정 시 전체. */
  filter?: { circuit_key?: number; year?: number };
  /** Sampling step (viewBox 단위). svgToPolyline 에 전달. */
  stepUnits?: number;
}

export interface BuildResult {
  built: { circuit_key: number; year: number; bytes: number }[];
  skipped: { circuit_key: number; year: number; reason: string }[];
}

const SOURCE_LABEL = 'julesr0y/f1-circuits-svg';
const LICENSE_LABEL = 'CC-BY-4.0';

export function readCircuitsConfig(path: string): CircuitsConfig {
  const raw = readFileSync(path, 'utf8');
  const parsed = JSON.parse(raw) as CircuitsConfig;
  if (!parsed.circuits || !Array.isArray(parsed.circuits)) {
    throw new Error(`Invalid circuits.json: missing "circuits" array (${path})`);
  }
  if (typeof parsed.default_variant !== 'string') {
    throw new Error(`Invalid circuits.json: missing "default_variant" (${path})`);
  }
  return parsed;
}

export function svgPathFor(
  vendorRoot: string,
  variant: string,
  julesr0yLayoutId: string,
): string {
  return join(vendorRoot, 'circuits', variant, `${julesr0yLayoutId}.svg`);
}

export function buildAll(
  config: CircuitsConfig,
  opts: BuildOptions = {},
  now: Date = new Date(),
): BuildResult {
  const vendorRoot = opts.vendorRoot ?? DEFAULT_VENDOR_ROOT;
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const result: BuildResult = { built: [], skipped: [] };

  const targets = config.circuits.filter((c) => {
    if (opts.filter?.circuit_key !== undefined && c.circuit_key !== opts.filter.circuit_key) {
      return false;
    }
    if (opts.filter?.year !== undefined && c.year !== opts.filter.year) return false;
    return true;
  });

  if (targets.length === 0) {
    throw new Error(
      `No circuits matched filter ${JSON.stringify(opts.filter ?? {})} in ${config.circuits.length} configured entries`,
    );
  }

  for (const entry of targets) {
    const variant = entry.variant ?? config.default_variant;
    const svgPath = svgPathFor(vendorRoot, variant, entry.julesr0y_layout_id);
    if (!existsSync(svgPath)) {
      result.skipped.push({
        circuit_key: entry.circuit_key,
        year: entry.year,
        reason: `SVG not found: ${svgPath}. Did you run 'git submodule update --init'?`,
      });
      continue;
    }

    const svgText = readFileSync(svgPath, 'utf8');
    let extracted;
    try {
      extracted = svgToPolyline(svgText, { stepUnits: opts.stepUnits });
    } catch (err) {
      result.skipped.push({
        circuit_key: entry.circuit_key,
        year: entry.year,
        reason: `svgToPolyline failed: ${(err as Error).message}`,
      });
      continue;
    }

    const sourceFileRel = `circuits/${variant}/${entry.julesr0y_layout_id}.svg`;
    const outPath = join(outputDir, `${entry.circuit_key}-${entry.year}.json`);

    // 기존 파일의 Phase 2 산출물 (openf1_transform*, 수동 보정된 start_finish_index) 보존.
    // 누락 시 매 빌드마다 Phase 2 가 wipe → 라이브맵 전체 차단 (회귀 테스트 보호).
    let existing: TrackOutlineJson | null = null;
    if (existsSync(outPath)) {
      try {
        existing = JSON.parse(readFileSync(outPath, 'utf8')) as TrackOutlineJson;
      } catch {
        existing = null;
      }
    }

    const out: TrackOutlineJson = {
      circuit_key: entry.circuit_key,
      year: entry.year,
      circuit_short_name: entry.circuit_short_name,
      country_name: entry.country_name,
      source: SOURCE_LABEL,
      source_file: sourceFileRel,
      license: LICENSE_LABEL,
      viewBox: extracted.viewBox,
      polyline: extracted.polyline,
      arc_length_table: extracted.arc_length_table,
      total_length: extracted.total_length,
      // 출발선 마커는 minimal SVG 에 없음 — polyline[0] (path 시작점) 을 기본값으로.
      // Phase 2 의 OpenF1 transform 추출이 실제 출발선 좌표를 검증할 때 보정 가능.
      start_finish_index: existing?.start_finish_index ?? 0,
      direction: entry.direction ?? 'clockwise',
      generated_at: now.toISOString(),
      // Phase 2 산출물 (이미 있으면 보존). 새로 빌드할 때는 추후 extract 가 채움.
      ...(existing?.openf1_transform ? { openf1_transform: existing.openf1_transform } : {}),
      ...(existing?.openf1_transform_confidence != null
        ? { openf1_transform_confidence: existing.openf1_transform_confidence }
        : {}),
      ...(existing?.openf1_transform_meta
        ? { openf1_transform_meta: existing.openf1_transform_meta }
        : {}),
    };

    const body = JSON.stringify(out);
    writeJsonAtomicSync(outPath, out);

    upsertTrackOutlinesIndex(
      outputDir,
      {
        circuit_key: entry.circuit_key,
        year: entry.year,
        track: true,
        pitlane: false,
        openf1_transform_confidence: null,
        generated_at: out.generated_at,
      },
      { source: SOURCE_LABEL, license: LICENSE_LABEL, now },
    );

    result.built.push({
      circuit_key: entry.circuit_key,
      year: entry.year,
      bytes: Buffer.byteLength(body, 'utf8'),
    });
  }

  return result;
}

// ── CLI ─────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): {
  filter: { circuit_key?: number; year?: number };
  stepUnits?: number;
} {
  const filter: { circuit_key?: number; year?: number } = {};
  let stepUnits: number | undefined;
  for (const arg of argv) {
    const km = /^--key=(\d+)$/.exec(arg);
    if (km) {
      filter.circuit_key = Number(km[1]);
      continue;
    }
    const ym = /^--year=(\d+)$/.exec(arg);
    if (ym) {
      filter.year = Number(ym[1]);
      continue;
    }
    const sm = /^--step=([\d.]+)$/.exec(arg);
    if (sm) {
      stepUnits = Number(sm[1]);
      continue;
    }
  }
  return { filter, stepUnits };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const { filter, stepUnits } = parseCliArgs(process.argv.slice(2));
  const config = readCircuitsConfig(DEFAULT_CIRCUITS_JSON);
  const result = buildAll(config, { filter, stepUnits });

  for (const b of result.built) {
    const kb = (b.bytes / 1024).toFixed(1);
    console.log(`✓ ${b.circuit_key}-${b.year}.json (${kb} KB)`);
  }
  for (const s of result.skipped) {
    console.warn(`✗ ${s.circuit_key}-${s.year}: ${s.reason}`);
  }
  if (result.built.length === 0) {
    console.error('No circuits built. Aborting.');
    process.exit(1);
  }
}
