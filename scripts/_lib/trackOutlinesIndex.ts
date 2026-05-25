// public/trackOutlines/index.json reader + upsert — live-map §1.3.6.
//
// 부분 빌드 (e.g. 한 서킷만 재빌드) 시 다른 entry 보존. seasonsIndex.ts 와 동일 패턴.
// atomic write (critic C3) — tmp 파일 + rename, 부분 상태 노출 없음.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeJsonAtomicSync } from './atomicWrite.js';

export interface TrackOutlinesEntry {
  circuit_key: number;
  year: number;
  /** 메인 트랙 polyline 생성 여부. Phase 1 산출물. */
  track: boolean;
  /** 핏레인 polyline 생성 여부. Phase 8 산출물. */
  pitlane: boolean;
  /** OpenF1 affine transform 잔차 품질 점수 (Phase 2 산출). 미산출 시 null. */
  openf1_transform_confidence: number | null;
  /** 해당 entry 산출 시각. */
  generated_at: string;
}

export interface TrackOutlinesIndex {
  generated_at: string;
  source: string;
  license: string;
  entries: TrackOutlinesEntry[];
}

const DEFAULT_SOURCE = 'julesr0y/f1-circuits-svg';
const DEFAULT_LICENSE = 'CC-BY-4.0';

export function readTrackOutlinesIndex(dir: string): TrackOutlinesIndex {
  const indexPath = join(dir, 'index.json');
  const empty: TrackOutlinesIndex = {
    generated_at: new Date(0).toISOString(),
    source: DEFAULT_SOURCE,
    license: DEFAULT_LICENSE,
    entries: [],
  };
  if (!existsSync(indexPath)) return empty;
  const raw = readFileSync(indexPath, 'utf8');
  try {
    const parsed = JSON.parse(raw) as TrackOutlinesIndex;
    if (!parsed.entries || !Array.isArray(parsed.entries)) return empty;
    return {
      ...empty,
      ...parsed,
      entries: parsed.entries,
    };
  } catch {
    return empty;
  }
}

export interface UpsertOptions {
  source?: string;
  license?: string;
  now?: Date;
}

export function upsertTrackOutlinesIndex(
  dir: string,
  entry: TrackOutlinesEntry,
  opts: UpsertOptions = {},
): void {
  const current = readTrackOutlinesIndex(dir);
  const others = current.entries.filter(
    (e) => !(e.circuit_key === entry.circuit_key && e.year === entry.year),
  );
  const next: TrackOutlinesIndex = {
    generated_at: (opts.now ?? new Date()).toISOString(),
    source: opts.source ?? current.source ?? DEFAULT_SOURCE,
    license: opts.license ?? current.license ?? DEFAULT_LICENSE,
    entries: [...others, entry].sort(
      (a, b) => a.circuit_key - b.circuit_key || a.year - b.year,
    ),
  };
  writeJsonAtomicSync(join(dir, 'index.json'), next);
}
