import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../countdownFormat';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatCountdown', () => {
  it('returns "now" when remaining ≤ 0', () => {
    expect(formatCountdown(0)).toBe('now');
    expect(formatCountdown(-1)).toBe('now');
    expect(formatCountdown(-9999)).toBe('now');
  });

  it('formats sub-minute as "in {s}s"', () => {
    expect(formatCountdown(45 * SEC)).toBe('in 45s');
    expect(formatCountdown(1 * SEC)).toBe('in 1s');
    expect(formatCountdown(45 * SEC + 250)).toBe('in 46s'); // ceil
  });

  it('formats sub-hour as "in {m}m {s}s"', () => {
    expect(formatCountdown(5 * MIN + 12 * SEC)).toBe('in 5m 12s');
    expect(formatCountdown(1 * MIN)).toBe('in 1m 0s');
    expect(formatCountdown(59 * MIN + 59 * SEC)).toBe('in 59m 59s');
  });

  it('formats sub-day as "in {h}h {m}m"', () => {
    expect(formatCountdown(2 * HOUR + 30 * MIN)).toBe('in 2h 30m');
    expect(formatCountdown(1 * HOUR)).toBe('in 1h 0m');
    expect(formatCountdown(23 * HOUR + 59 * MIN + 30 * SEC)).toBe('in 23h 59m');
  });

  it('formats multi-day as "in {d}d {h}h"', () => {
    expect(formatCountdown(1 * DAY)).toBe('in 1d 0h');
    expect(formatCountdown(2 * DAY + 14 * HOUR + 32 * MIN)).toBe('in 2d 14h');
    expect(formatCountdown(10 * DAY + 23 * HOUR + 59 * MIN + 59 * SEC)).toBe('in 10d 23h');
  });

  it('handles exact boundary transitions', () => {
    expect(formatCountdown(DAY)).toBe('in 1d 0h'); // 24h ≥ DAY → days
    expect(formatCountdown(HOUR)).toBe('in 1h 0m'); // 1h boundary → hours
    expect(formatCountdown(MIN)).toBe('in 1m 0s'); // 1m boundary → minutes
    expect(formatCountdown(MIN - 1)).toBe('in 60s'); // just below 1m → seconds (ceil)
  });
});
