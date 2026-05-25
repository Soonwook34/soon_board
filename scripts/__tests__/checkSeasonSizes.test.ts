import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUDGET, checkSeasonSizes } from '../check-season-sizes';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(resolve(tmpdir(), 'check-season-sizes-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeJson(name: string, body: unknown): void {
  writeFileSync(resolve(tmp, name), JSON.stringify(body));
}

describe('checkSeasonSizes', () => {
  it('reports ok=true for small payloads within budget', () => {
    writeJson('2024.json', { year: 2024, meetings: [] });
    const out = checkSeasonSizes(tmp);
    expect(out).toHaveLength(1);
    expect(out[0].ok).toBe(true);
    expect(out[0].rawBytes).toBeGreaterThan(0);
    expect(out[0].rawBytes).toBeLessThanOrEqual(DEFAULT_BUDGET.rawBytes);
  });

  it('reports ok=false when raw size exceeds the budget', () => {
    // 110 KB of highly repetitive payload — easily compresses but raw > 100 KB.
    // Use random-ish payload that doesn't compress much by combining with structure.
    const bigArray = Array.from({ length: 200 }, (_, i) => ({
      session_key: i,
      payload: `repeating-content-${i}`.repeat(50),
    }));
    writeJson('2025.json', { year: 2025, meetings: bigArray });
    const out = checkSeasonSizes(tmp);
    expect(out[0].rawBytes).toBeGreaterThan(DEFAULT_BUDGET.rawBytes);
    expect(out[0].ok).toBe(false);
  });

  it('reports ok=false when gzip exceeds a tight custom budget while raw stays under', () => {
    // Pseudo-incompressible: LCG-driven random charset (gzip 효율 낮음, raw 대비 압축률 ~50%).
    const rng = (n: number) => {
      let s = '';
      let x = 0x12345678;
      for (let i = 0; i < n; i++) {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        s += String.fromCharCode(33 + (x % 94));
      }
      return s;
    };
    writeJson('2026.json', { blob: rng(30_000) });
    // raw 80 KB (충분히 큼) + gzip 5 KB (tight) → raw 통과, gzip만 단독 초과.
    const out = checkSeasonSizes(tmp, { budget: { rawBytes: 80 * 1024, gzipBytes: 5 * 1024 } });
    expect(out[0].rawBytes).toBeLessThanOrEqual(80 * 1024);
    expect(out[0].gzipBytes).toBeGreaterThan(5 * 1024);
    expect(out[0].ok).toBe(false);
  });

  it('returns empty array for a directory with no .json files', () => {
    mkdirSync(resolve(tmp, 'sub'));
    writeFileSync(resolve(tmp, 'README.txt'), 'not json');
    expect(checkSeasonSizes(tmp)).toEqual([]);
  });

  it('excludes index.json by default (its budget is separate)', () => {
    writeJson('index.json', { generated_at: 'x', seasons: [] });
    writeJson('2024.json', { year: 2024, meetings: [] });
    const out = checkSeasonSizes(tmp);
    expect(out.map((r) => r.file)).toEqual(['2024.json']);
  });

  it('measures the real public/seasons/2024.json against the default budget', () => {
    const repoSeasons = resolve(__dirname, '..', '..', 'public', 'seasons');
    const results = checkSeasonSizes(repoSeasons);
    const seen2024 = results.find((r) => r.file === '2024.json');
    expect(seen2024).toBeTruthy();
    expect(seen2024!.ok).toBe(true);
  });
});
