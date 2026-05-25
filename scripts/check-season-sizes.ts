#!/usr/bin/env tsx
// 시즌 카탈로그 JSON size budget 자동 검증 — main-page-implementation.md §12 단계 13 + 인수 1.
// 각 public/seasons/{year}.json 파일에 대해 raw size ≤ 100 KB / gzip size ≤ 20 KB 보장.
// CI cron 산출물 회귀 차단용 + 로컬 fetch 검증 후 즉시 실행 가능.

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export interface SizeBudget {
  rawBytes: number;
  gzipBytes: number;
}

export const DEFAULT_BUDGET: SizeBudget = {
  rawBytes: 100 * 1024, // 100 KB
  gzipBytes: 20 * 1024, // 20 KB
};

export interface CheckResult {
  file: string;
  rawBytes: number;
  gzipBytes: number;
  ok: boolean;
}

export interface CheckOptions {
  budget?: SizeBudget;
  /** 'index.json'은 카탈로그 size budget 대상 아님 (별도). 기본 true로 스킵. */
  excludeIndex?: boolean;
}

export function checkSeasonSizes(jsonDir: string, opts: CheckOptions = {}): CheckResult[] {
  const budget = opts.budget ?? DEFAULT_BUDGET;
  const excludeIndex = opts.excludeIndex ?? true;
  const entries = readdirSync(jsonDir).filter((name) => name.endsWith('.json'));
  const targets = entries.filter((name) => !(excludeIndex && name === 'index.json'));
  return targets.map((name) => {
    const path = resolve(jsonDir, name);
    const buf = readFileSync(path);
    const gz = gzipSync(buf);
    return {
      file: name,
      rawBytes: buf.byteLength,
      gzipBytes: gz.byteLength,
      ok: buf.byteLength <= budget.rawBytes && gz.byteLength <= budget.gzipBytes,
    };
  });
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

async function main(): Promise<void> {
  const jsonDir = resolve(process.cwd(), 'public/seasons');
  try {
    statSync(jsonDir);
  } catch {
    console.error(`[check-season-sizes] directory not found: ${jsonDir}`);
    process.exit(1);
  }
  const results = checkSeasonSizes(jsonDir);
  if (results.length === 0) {
    console.log(`[check-season-sizes] no season JSONs found under ${jsonDir}`);
    return;
  }
  const failures = results.filter((r) => !r.ok);
  for (const r of results) {
    const marker = r.ok ? '✓' : '✗';
    console.log(
      `${marker} ${r.file}: raw=${formatKB(r.rawBytes)} (≤ ${formatKB(DEFAULT_BUDGET.rawBytes)}), ` +
        `gzip=${formatKB(r.gzipBytes)} (≤ ${formatKB(DEFAULT_BUDGET.gzipBytes)})`,
    );
  }
  if (failures.length > 0) {
    console.error(`[check-season-sizes] ${failures.length} season(s) over budget — 인수 1 위반`);
    process.exit(1);
  }
  console.log(`[check-season-sizes] OK: ${results.length} season(s) within budget`);
}

// CLI 진입 가드 (ubuntu-latest + Mac/Linux 로컬 대상. Windows 지원 추가 시
// fileURLToPath(import.meta.url) 비교로 교체 필요.)
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  main().catch((err: Error) => {
    console.error('[check-season-sizes] FAILED:', err.message);
    process.exit(1);
  });
}
