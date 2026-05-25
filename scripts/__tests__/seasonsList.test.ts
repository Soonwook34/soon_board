import { describe, expect, it } from 'vitest';
import { KNOWN_SEASONS } from '../_lib/seasonsList';

describe('KNOWN_SEASONS', () => {
  it('contains exactly the planned years [2023, 2024, 2025, 2026, 2027]', () => {
    expect([...KNOWN_SEASONS]).toEqual([2023, 2024, 2025, 2026, 2027]);
  });

  it('is sorted ascending', () => {
    const sorted = [...KNOWN_SEASONS].sort((a, b) => a - b);
    expect([...KNOWN_SEASONS]).toEqual(sorted);
  });

  it('has no duplicates', () => {
    expect(new Set(KNOWN_SEASONS).size).toBe(KNOWN_SEASONS.length);
  });

  it('all years are integers >= 2023 (matches fetch-season-catalog --year validation)', () => {
    for (const y of KNOWN_SEASONS) {
      expect(Number.isInteger(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(2023);
    }
  });
});
