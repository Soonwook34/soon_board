// scripts/curate-residual.ts — residual report listing 회귀.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { curateResidual, formatRow, parseCliArgs } from '../curate-residual.js';
import type { TrackOutlinesIndex } from '../_lib/trackOutlinesIndex.js';
import type { ResidualReport } from '../build-all-circuits.js';

const TMP = join(tmpdir(), `curate-residual-test-${process.pid}`);

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function writeIndex(entries: TrackOutlinesIndex['entries']): void {
  const idx: TrackOutlinesIndex = {
    generated_at: '2026-05-27T00:00:00.000Z',
    source: 'julesr0y/f1-circuits-svg',
    license: 'CC-BY-4.0',
    entries,
  };
  writeFileSync(join(TMP, 'index.json'), JSON.stringify(idx));
}

function writeReport(entries: ResidualReport['entries']): void {
  const r: ResidualReport = { generated_at: '2026-05-27T00:00:00.000Z', entries };
  writeFileSync(join(TMP, 'residual-report.json'), JSON.stringify(r));
}

describe('curate-residual — threshold filter', () => {
  it('5 entry index + 일부 report — threshold=0.7 미달만 표시 + confidence ↑ 정렬', () => {
    writeIndex([
      { circuit_key: 1, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.95, generated_at: '' },
      { circuit_key: 2, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.45, generated_at: '' },
      { circuit_key: 3, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.62, generated_at: '' },
      { circuit_key: 4, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.85, generated_at: '' },
      { circuit_key: 5, year: 2024, track: true, pitlane: true, openf1_transform_confidence: null, generated_at: '' },
    ]);
    writeReport([
      { circuit_key: 2, year: 2024, status: 'ok', rmse: 8.1, confidence: 0.45 },
      { circuit_key: 5, year: 2024, status: 'extract-failed', error: 'insufficient samples' },
    ]);

    const rows = curateResidual({ outputDir: TMP, threshold: 0.7 });
    // threshold 0.7 미달: 2 (0.45), 3 (0.62), 5 (null/extract-failed) — 3개.
    expect(rows.map((r) => r.circuit_key)).toEqual([5, 2, 3]); // 정렬: extract-failed → low conf → higher conf
  });

  it('--all → 전부 표시', () => {
    writeIndex([
      { circuit_key: 1, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.95, generated_at: '' },
      { circuit_key: 2, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.45, generated_at: '' },
    ]);
    const rows = curateResidual({ outputDir: TMP, all: true });
    expect(rows).toHaveLength(2);
  });
});

describe('curate-residual — graceful with missing residual-report', () => {
  it('report 미존재 시 index 만으로 confidence 정렬', () => {
    writeIndex([
      { circuit_key: 7, year: 2024, track: true, pitlane: false, openf1_transform_confidence: 0.3, generated_at: '' },
      { circuit_key: 8, year: 2024, track: true, pitlane: false, openf1_transform_confidence: 0.8, generated_at: '' },
    ]);
    // residual-report.json 미작성
    const rows = curateResidual({ outputDir: TMP, threshold: 0.7 });
    expect(rows).toHaveLength(1);
    expect(rows[0].circuit_key).toBe(7);
    expect(rows[0].status).toBe('ok'); // report 가 없으면 ok 가정 (index 의 confidence 만 보고 판단)
  });
});

describe('curate-residual — svg-missing in report but not in index', () => {
  it('report 에는 있지만 index 에 없는 entry 도 listing 에 포함', () => {
    writeIndex([
      { circuit_key: 1, year: 2024, track: true, pitlane: true, openf1_transform_confidence: 0.95, generated_at: '' },
    ]);
    writeReport([
      { circuit_key: 99, year: 2024, status: 'svg-missing', error: 'SVG not found' },
    ]);
    const rows = curateResidual({ outputDir: TMP, threshold: 0.7 });
    expect(rows.some((r) => r.circuit_key === 99 && r.status === 'svg-missing')).toBe(true);
  });
});

describe('formatRow', () => {
  it('정상 row 포맷', () => {
    const s = formatRow({
      circuit_key: 63,
      year: 2024,
      confidence: 0.752,
      rmse: 4.13,
      status: 'ok',
    });
    expect(s).toContain('63-2024');
    expect(s).toContain('confidence=0.752');
    expect(s).toContain('rmse=4.13');
    expect(s).toContain('status=ok');
  });

  it('confidence null + error 포함', () => {
    const s = formatRow({
      circuit_key: 99,
      year: 2024,
      confidence: null,
      rmse: null,
      status: 'svg-missing',
      error: 'SVG not found',
    });
    expect(s).toContain('confidence=   N/A');
    expect(s).toContain('rmse=  N/A');
    expect(s).toContain('— SVG not found');
  });
});

describe('parseCliArgs', () => {
  it('--threshold + --all + --json', () => {
    const a = parseCliArgs(['--threshold=0.9', '--all', '--json']);
    expect(a).toEqual({ threshold: 0.9, all: true, json: true });
  });

  it('default', () => {
    expect(parseCliArgs([])).toEqual({ threshold: undefined, all: false, json: false });
  });
});
