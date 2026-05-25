#!/usr/bin/env tsx
// 시즌 카탈로그 빌드 entry — .omc/plans/main-page-implementation.md §12 단계 1 + 13.
//
// 사용법:
//   npm run fetch:catalog                       (--all 기본)
//   npx tsx scripts/fetch-season-catalog.ts --year=2024
//   npx tsx scripts/fetch-season-catalog.ts --years=2023,2024,2025
//   npx tsx scripts/fetch-season-catalog.ts --all --smoke=2
//
// 출력:
//   public/seasons/{year}.json    (atomic write, critic C3)
//   public/seasons/index.json     (atomic upsert, 다른 연도 entry 보존)
//
// 인자:
//   --year=YYYY                  단일 연도 (기존 모드 보존)
//   --years=2023,2024,...        CSV 다중 연도
//   --all                        KNOWN_SEASONS 전체
//   --out=DIR                    기본 public/seasons
//   --smoke=N                    각 연도당 N개 meeting만 처리

import { resolve } from 'node:path';
import { buildSeasonCatalog } from './_lib/seasonCatalog.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import { KNOWN_SEASONS } from './_lib/seasonsList.js';
import { upsertSeasonsIndex } from './_lib/seasonsIndex.js';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';

export interface ParsedArgs {
  years: number[];
  outDir: string;
  smoke?: number;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const map = new Map<string, string>();
  const flags = new Set<string>();
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) {
      map.set(m[1], m[2]);
    } else if (arg.startsWith('--')) {
      flags.add(arg.slice(2));
    }
  }

  const yearStr = map.get('year');
  const yearsStr = map.get('years');
  const all = flags.has('all');
  const modes = [yearStr ? 1 : 0, yearsStr ? 1 : 0, all ? 1 : 0].reduce((a, b) => a + b, 0);
  if (modes === 0) {
    throw new Error('Specify one of --year=YYYY, --years=YYYY,..., or --all');
  }
  if (modes > 1) {
    throw new Error('Use exactly one of --year, --years, --all (not multiple)');
  }

  let years: number[];
  if (all) {
    years = [...KNOWN_SEASONS];
  } else if (yearStr) {
    years = [parseYear(yearStr)];
  } else {
    years = (yearsStr as string)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(parseYear);
    if (years.length === 0) throw new Error('--years requires at least one value');
  }

  const out = map.get('out') ?? 'public/seasons';
  const smokeStr = map.get('smoke');
  const smoke = smokeStr ? Number(smokeStr) : undefined;
  return { years, outDir: resolve(process.cwd(), out), smoke };
}

function parseYear(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 2023) {
    throw new Error(`Invalid year: ${raw} (must be integer >= 2023)`);
  }
  return n;
}

async function processYear(args: { year: number; outDir: string; smoke?: number }): Promise<'built' | 'skipped'> {
  const { year, outDir, smoke } = args;
  const client = new OpenF1Client();
  const startedAt = Date.now();
  const catalog = await buildSeasonCatalog({
    client,
    year,
    meetingLimit: smoke,
    log: (msg) => console.log(msg),
  });
  if (!catalog) {
    console.log(`[fetch-season-catalog] year=${year} skipped (no meetings yet)`);
    return 'skipped';
  }
  const seasonFile = `${outDir}/${year}.json`;
  writeJsonAtomicSync(seasonFile, catalog);
  upsertSeasonsIndex(outDir, {
    year,
    generated_at: catalog.generated_at,
    source: catalog.source,
  });
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const stats = client.stats;
  console.log(
    `[fetch-season-catalog] year=${year} done in ${elapsedSec}s — ` +
      `requests=${stats.requests_total} retries=${stats.retries_total} ` +
      `429=${stats.rate_429_count} 5xx=${stats.server_5xx_count}`,
  );
  console.log(`[fetch-season-catalog] wrote ${seasonFile}`);
  return 'built';
}

async function main(): Promise<void> {
  const { years, outDir, smoke } = parseArgs(process.argv.slice(2));
  let built = 0;
  let skipped = 0;
  let failed = 0;
  for (const year of years) {
    try {
      const outcome = await processYear({ year, outDir, smoke });
      if (outcome === 'built') built += 1;
      else skipped += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[fetch-season-catalog] year=${year} FAILED: ${msg}`);
    }
  }
  console.log(
    `[fetch-season-catalog] summary — built=${built} skipped=${skipped} failed=${failed} (total=${years.length})`,
  );
  // exit 정책: 빌드가 0개인데 실패가 있으면 hard fail (CI silent degradation 방지).
  // skipped만 있고 실패 없으면 정상 (미래 시즌 OpenF1 미노출).
  // 빌드가 ≥1이면 일부 실패도 partial commit + 다음 cron 재시도 허용 (warning은 summary 로그로 노출).
  if (built === 0 && failed > 0) process.exit(1);
}

// CLI 진입은 main 호출 (vitest에서 import 시 main 실행 방지를 위해 if문으로 분기).
// (ubuntu-latest CI + Mac/Linux 로컬 대상. Windows 지원 추가 시
// fileURLToPath(import.meta.url) 비교로 교체 필요 — file:///C:/... 3-slash 차이.)
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch((err: Error) => {
    console.error('[fetch-season-catalog] FAILED:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
