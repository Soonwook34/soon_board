#!/usr/bin/env tsx
// 시즌 카탈로그 빌드 entry — .omc/plans/main-page-implementation.md §12 단계 1.
//
// 사용법:
//   npm run fetch:catalog -- --year=2024
//   npx tsx scripts/fetch-season-catalog.ts --year=2024 --smoke=2
//   tsx scripts/fetch-season-catalog.ts --year=2024 --out=public/seasons
//
// 출력:
//   public/seasons/{year}.json    (atomic write, critic C3)
//   public/seasons/index.json     (atomic upsert, 다른 연도 entry 보존)
//
// 인자:
//   --year=YYYY      필수
//   --out=DIR        기본 public/seasons
//   --smoke=N        N개 meeting만 처리 (빠른 검증용)

import { resolve } from 'node:path';
import { buildSeasonCatalog } from './_lib/seasonCatalog.js';
import { OpenF1Client } from './_lib/openf1Client.js';
import { upsertSeasonsIndex } from './_lib/seasonsIndex.js';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';

interface Args {
  year: number;
  outDir: string;
  smoke?: number;
}

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) map.set(m[1], m[2]);
  }
  const yearStr = map.get('year');
  if (!yearStr) {
    throw new Error('Missing required --year=YYYY');
  }
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 2023) {
    throw new Error(`Invalid --year: ${yearStr} (must be integer ≥ 2023)`);
  }
  const out = map.get('out') ?? 'public/seasons';
  const smokeStr = map.get('smoke');
  const smoke = smokeStr ? Number(smokeStr) : undefined;
  return { year, outDir: resolve(process.cwd(), out), smoke };
}

async function main(): Promise<void> {
  const { year, outDir, smoke } = parseArgs(process.argv.slice(2));
  const client = new OpenF1Client();
  const startedAt = Date.now();

  const catalog = await buildSeasonCatalog({
    client,
    year,
    meetingLimit: smoke,
    log: (msg) => console.log(msg),
  });

  if (!catalog) {
    console.log(`[fetch-season-catalog] year=${year} skipped (no meetings yet). index.json unchanged.`);
    return;
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
}

main().catch((err: Error) => {
  console.error('[fetch-season-catalog] FAILED:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
