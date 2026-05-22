import { describe, expect, it } from 'vitest';
import { formatLapDuration } from '../resultPreviewFormat';

describe('formatLapDuration', () => {
  it('formats 89.123s as 1:29.123', () => {
    expect(formatLapDuration(89.123)).toBe('1:29.123');
  });

  it('formats sub-minute durations with zero minute and ms padding', () => {
    expect(formatLapDuration(59.5)).toBe('0:59.500');
  });

  it('formats exact minute boundary', () => {
    expect(formatLapDuration(120)).toBe('2:00.000');
  });

  it('formats zero as 0:00.000', () => {
    expect(formatLapDuration(0)).toBe('0:00.000');
  });

  it('pads single-digit ms with leading zeros', () => {
    expect(formatLapDuration(75.005)).toBe('1:15.005');
  });

  it('returns em-dash for NaN', () => {
    expect(formatLapDuration(Number.NaN)).toBe('—');
  });

  it('returns em-dash for negative duration', () => {
    expect(formatLapDuration(-1)).toBe('—');
  });

  it('returns em-dash for Infinity', () => {
    expect(formatLapDuration(Number.POSITIVE_INFINITY)).toBe('—');
  });
});
