// scripts/_lib/trackOutlinesIndex.ts 단위 테스트 — atomic upsert + (key,year) 보존 (critic C3).

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readTrackOutlinesIndex,
  upsertTrackOutlinesIndex,
  type TrackOutlinesIndex,
} from '../_lib/trackOutlinesIndex.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'track-outlines-index-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('readTrackOutlinesIndex', () => {
  it('returns empty index when file absent', () => {
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries).toEqual([]);
    expect(idx.source).toBe('julesr0y/f1-circuits-svg');
    expect(idx.license).toBe('CC-BY-4.0');
  });

  it('returns empty index when file is malformed JSON', () => {
    writeFileSync(join(dir, 'index.json'), '{not json');
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries).toEqual([]);
  });

  it('returns empty when entries array is missing', () => {
    writeFileSync(
      join(dir, 'index.json'),
      JSON.stringify({ generated_at: 'x', source: 's', license: 'l' }),
    );
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries).toEqual([]);
  });

  it('preserves valid entries', () => {
    const seed: TrackOutlinesIndex = {
      generated_at: '2026-05-22T00:00:00.000Z',
      source: 'julesr0y/f1-circuits-svg',
      license: 'CC-BY-4.0',
      entries: [
        {
          circuit_key: 63,
          year: 2024,
          track: true,
          pitlane: false,
          openf1_transform_confidence: null,
          generated_at: '2026-05-22T00:00:00.000Z',
        },
      ],
    };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(seed));
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0].circuit_key).toBe(63);
  });
});

describe('upsertTrackOutlinesIndex', () => {
  it('creates index when file absent', () => {
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 63,
      year: 2024,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: '2026-05-22T00:00:00.000Z',
    });
    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as TrackOutlinesIndex;
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0].circuit_key).toBe(63);
  });

  it('preserves other (key,year) entries when updating one', () => {
    const seed: TrackOutlinesIndex = {
      generated_at: '2026-05-22T00:00:00.000Z',
      source: 'julesr0y/f1-circuits-svg',
      license: 'CC-BY-4.0',
      entries: [
        {
          circuit_key: 63,
          year: 2024,
          track: true,
          pitlane: false,
          openf1_transform_confidence: null,
          generated_at: '2026-05-22T00:00:00.000Z',
        },
        {
          circuit_key: 70,
          year: 2021,
          track: true,
          pitlane: false,
          openf1_transform_confidence: 0.92,
          generated_at: '2026-05-22T00:00:00.000Z',
        },
      ],
    };
    writeFileSync(join(dir, 'index.json'), JSON.stringify(seed));

    upsertTrackOutlinesIndex(dir, {
      circuit_key: 63,
      year: 2024,
      track: true,
      pitlane: true,
      openf1_transform_confidence: 0.97,
      generated_at: '2026-05-23T00:00:00.000Z',
    });

    const idx = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as TrackOutlinesIndex;
    expect(idx.entries).toHaveLength(2);
    const bahrain = idx.entries.find((e) => e.circuit_key === 63 && e.year === 2024);
    const yas = idx.entries.find((e) => e.circuit_key === 70 && e.year === 2021);
    expect(bahrain?.pitlane).toBe(true);
    expect(bahrain?.openf1_transform_confidence).toBe(0.97);
    expect(yas?.openf1_transform_confidence).toBe(0.92); // unchanged
  });

  it('distinguishes same circuit_key across different years', () => {
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 70,
      year: 2020,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: '2026-05-22T00:00:00.000Z',
    });
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 70,
      year: 2021,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: '2026-05-22T00:00:00.000Z',
    });
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries).toHaveLength(2);
  });

  it('sorts entries by circuit_key then year', () => {
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 70,
      year: 2021,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: 'x',
    });
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 63,
      year: 2024,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: 'x',
    });
    upsertTrackOutlinesIndex(dir, {
      circuit_key: 70,
      year: 2020,
      track: true,
      pitlane: false,
      openf1_transform_confidence: null,
      generated_at: 'x',
    });
    const idx = readTrackOutlinesIndex(dir);
    expect(idx.entries.map((e) => [e.circuit_key, e.year])).toEqual([
      [63, 2024],
      [70, 2020],
      [70, 2021],
    ]);
  });
});
