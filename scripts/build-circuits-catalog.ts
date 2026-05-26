#!/usr/bin/env tsx
// live-map plan §10 단계 14 — OpenF1 enumeration → circuits-candidates.json.
//
// 인간 큐레이터가 circuits.json 을 78서킷으로 확장할 때 입력으로 사용.
// 산출은 superset (모든 active (circuit_key, year)) — 큐레이터가 julesr0y_layout_id
// 매핑 + direction 결정 후 circuits.json 에 transfer.
//
// 사용:
//   npm run build:catalog                        # 2023..currentYear 전체
//   npm run build:catalog -- --from=2024 --to=2024
//   npm run build:catalog -- --output=foo.json

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonAtomicSync } from './_lib/atomicWrite.js';
import { OpenF1Client } from './_lib/openf1Client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_OUTPUT = join(REPO_ROOT, 'scripts/circuits-candidates.json');
const DEFAULT_FROM = 2023; // OpenF1 가용 시작 (replay-strategy §0)

interface RawSession {
  session_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
}

export interface CandidateEntry {
  circuit_key: number;
  year: number;
  circuit_short_name: string;
  country_name: string;
  first_session_key: number;
  session_count: number;
}

export interface CandidatesJson {
  generated_at: string;
  source: string;
  entries: CandidateEntry[];
}

export interface BuildCatalogOptions {
  from?: number;
  to?: number;
  client?: OpenF1Client;
  now?: Date;
}

export async function buildCircuitsCatalog(
  opts: BuildCatalogOptions = {},
): Promise<CandidatesJson> {
  const client = opts.client ?? new OpenF1Client();
  const from = opts.from ?? DEFAULT_FROM;
  const to = opts.to ?? new Date().getUTCFullYear();
  const now = opts.now ?? new Date();

  if (from > to) throw new Error(`build-circuits-catalog: from(${from}) > to(${to})`);

  // (circuit_key, year) → entry — 같은 (key, year) 의 여러 session 은 count 만 증분.
  const acc = new Map<string, CandidateEntry>();
  for (let year = from; year <= to; year++) {
    const sessions = await client.get<RawSession[]>('/v1/sessions', { year });
    for (const s of sessions) {
      const key = `${s.circuit_key}-${s.year}`;
      const existing = acc.get(key);
      if (existing) {
        existing.session_count++;
        if (s.session_key < existing.first_session_key) existing.first_session_key = s.session_key;
        continue;
      }
      acc.set(key, {
        circuit_key: s.circuit_key,
        year: s.year,
        circuit_short_name: s.circuit_short_name,
        country_name: s.country_name,
        first_session_key: s.session_key,
        session_count: 1,
      });
    }
  }

  const entries = Array.from(acc.values()).sort((a, b) => {
    if (a.circuit_key !== b.circuit_key) return a.circuit_key - b.circuit_key;
    return a.year - b.year;
  });

  return {
    generated_at: now.toISOString(),
    source: 'OpenF1 sessions',
    entries,
  };
}

// ── CLI ────────────────────────────────────────────────────────────────

export function parseCliArgs(argv: string[]): {
  from?: number;
  to?: number;
  output?: string;
} {
  const out: { from?: number; to?: number; output?: string } = {};
  for (const arg of argv) {
    const fm = /^--from=(\d+)$/.exec(arg);
    if (fm) out.from = Number(fm[1]);
    const tm = /^--to=(\d+)$/.exec(arg);
    if (tm) out.to = Number(tm[1]);
    const om = /^--output=(.+)$/.exec(arg);
    if (om) out.output = om[1];
  }
  return out;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === resolve(entry);
}

if (isMainModule()) {
  const args = parseCliArgs(process.argv.slice(2));
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  buildCircuitsCatalog({ from: args.from, to: args.to })
    .then((result) => {
      writeJsonAtomicSync(outputPath, result, { pretty: true });
      console.log(`✓ ${outputPath} — ${result.entries.length} (circuit_key, year) entries`);
    })
    .catch((err: unknown) => {
      console.error('build-circuits-catalog failed:', err);
      process.exit(1);
    });
}
