import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSeasonsIndex, upsertSeasonsIndex } from '../_lib/seasonsIndex.js';
import { writeJsonAtomicSync } from '../_lib/atomicWrite.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'seasons-index-test-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readSeasonsIndex', () => {
  it('returns empty seasons when index.json missing', () => {
    const idx = readSeasonsIndex(dir);
    expect(idx.seasons).toEqual([]);
  });

  it('gracefully recovers from malformed JSON', () => {
    writeFileSync(join(dir, 'index.json'), 'not-json', 'utf8');
    const idx = readSeasonsIndex(dir);
    expect(idx.seasons).toEqual([]);
  });
});

describe('upsertSeasonsIndex', () => {
  it('inserts a new year entry, sorts by year', () => {
    upsertSeasonsIndex(dir, { year: 2024, generated_at: '2024-06-15T00:00:00.000Z', source: 'openf1.org/v1' });
    upsertSeasonsIndex(dir, { year: 2023, generated_at: '2024-06-15T00:00:00.000Z', source: 'openf1.org/v1' });
    const raw = readFileSync(join(dir, 'index.json'), 'utf8');
    const idx = JSON.parse(raw) as ReturnType<typeof readSeasonsIndex>;
    expect(idx.seasons.map((s) => s.year)).toEqual([2023, 2024]);
  });

  it('replaces an existing entry for the same year', () => {
    upsertSeasonsIndex(dir, { year: 2024, generated_at: '2024-05-01T00:00:00.000Z', source: 'openf1.org/v1' });
    upsertSeasonsIndex(dir, { year: 2024, generated_at: '2024-06-15T00:00:00.000Z', source: 'openf1.org/v1' });
    const idx = readSeasonsIndex(dir);
    expect(idx.seasons).toHaveLength(1);
    expect(idx.seasons[0].generated_at).toBe('2024-06-15T00:00:00.000Z');
  });
});

describe('writeJsonAtomicSync', () => {
  it('writes via tmp + rename (no partial file lingers)', () => {
    const target = join(dir, 'nested', 'out.json');
    writeJsonAtomicSync(target, { a: 1 });
    expect(existsSync(target)).toBe(true);
    expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ a: 1 });
    // No .tmp leftover
    const targetTmp = `${target}.tmp`;
    expect(existsSync(targetTmp)).toBe(false);
  });
});
