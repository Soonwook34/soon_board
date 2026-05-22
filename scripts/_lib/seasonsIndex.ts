// public/seasons/index.json reader + updater.
// 단일 시즌 빌드 시 다른 연도 entry는 보존 (누적 upsert). 한 시즌 step 실패 시 호출 안 됨.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomicSync } from './atomicWrite.js';

export interface SeasonIndexEntry {
  year: number;
  generated_at: string;
  source: string;
}

export interface SeasonsIndex {
  generated_at: string;
  seasons: SeasonIndexEntry[];
}

export function readSeasonsIndex(seasonsDir: string): SeasonsIndex {
  const indexPath = join(seasonsDir, 'index.json');
  if (!existsSync(indexPath)) {
    return { generated_at: new Date(0).toISOString(), seasons: [] };
  }
  const raw = readFileSync(indexPath, 'utf8');
  try {
    const parsed = JSON.parse(raw) as SeasonsIndex;
    if (!parsed.seasons || !Array.isArray(parsed.seasons)) {
      return { generated_at: new Date(0).toISOString(), seasons: [] };
    }
    return parsed;
  } catch {
    return { generated_at: new Date(0).toISOString(), seasons: [] };
  }
}

export function upsertSeasonsIndex(
  seasonsDir: string,
  entry: SeasonIndexEntry,
  now: Date = new Date(),
): void {
  const current = readSeasonsIndex(seasonsDir);
  const others = current.seasons.filter((s) => s.year !== entry.year);
  const next: SeasonsIndex = {
    generated_at: now.toISOString(),
    seasons: [...others, entry].sort((a, b) => a.year - b.year),
  };
  writeJsonAtomicSync(join(seasonsDir, 'index.json'), next);
}
