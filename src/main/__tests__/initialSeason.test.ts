import { describe, expect, it } from 'vitest';
import { selectInitialSeason } from '../initialSeason';
import type { SeasonsIndex } from '../../shared/seasonData';

const mkIndex = (years: number[]): SeasonsIndex => ({
  generated_at: '2026-05-22T00:00:00Z',
  seasons: years.map((y) => ({ year: y, generated_at: '2026-05-22T00:00:00Z', source: 'openf1.org/v1' })),
});

describe('selectInitialSeason', () => {
  it('returns null when index and uiSeason both absent', () => {
    expect(selectInitialSeason(null, null)).toBeNull();
    expect(selectInitialSeason(mkIndex([]), null)).toBeNull();
  });

  it('returns uiSeason when provided, regardless of index contents', () => {
    expect(selectInitialSeason(mkIndex([2023, 2024]), 2023)).toBe(2023);
    expect(selectInitialSeason(null, 2024)).toBe(2024);
  });

  it('returns max year from index when uiSeason is null', () => {
    expect(selectInitialSeason(mkIndex([2023, 2024, 2025]), null)).toBe(2025);
    expect(selectInitialSeason(mkIndex([2024]), null)).toBe(2024);
  });

  it('honours uiSeason even when not present in index (URL-pinned year)', () => {
    expect(selectInitialSeason(mkIndex([2024]), 2099)).toBe(2099);
  });
});
