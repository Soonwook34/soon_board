import { describe, expect, it } from 'vitest';
import { parseArgs } from '../fetch-season-catalog';
import { KNOWN_SEASONS } from '../_lib/seasonsList';

describe('fetch-season-catalog parseArgs', () => {
  it('parses single --year=YYYY (backward compatible)', () => {
    const out = parseArgs(['--year=2024']);
    expect(out.years).toEqual([2024]);
  });

  it('expands --all to KNOWN_SEASONS', () => {
    const out = parseArgs(['--all']);
    expect(out.years).toEqual([...KNOWN_SEASONS]);
  });

  it('parses --years=YYYY,YYYY CSV with trimming', () => {
    const out = parseArgs(['--years=2023, 2025 ,2027']);
    expect(out.years).toEqual([2023, 2025, 2027]);
  });

  it('throws when no mode is specified', () => {
    expect(() => parseArgs([])).toThrow(/Specify one of --year/);
  });

  it('throws when more than one mode is specified', () => {
    expect(() => parseArgs(['--year=2024', '--all'])).toThrow(/exactly one of --year, --years, --all/);
    expect(() => parseArgs(['--year=2024', '--years=2025'])).toThrow(/exactly one of/);
  });

  it('throws on invalid year value', () => {
    expect(() => parseArgs(['--year=2020'])).toThrow(/must be integer >= 2023/);
    expect(() => parseArgs(['--years=2024,not-a-year'])).toThrow(/Invalid year/);
  });

  it('passes optional --smoke=N and --out=DIR through', () => {
    const out = parseArgs(['--year=2024', '--smoke=2', '--out=tmp/seasons']);
    expect(out.smoke).toBe(2);
    expect(out.outDir.endsWith('tmp/seasons')).toBe(true);
  });
});
