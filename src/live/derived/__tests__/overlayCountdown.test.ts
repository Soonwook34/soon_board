import { describe, expect, it } from 'vitest';
import { formatHmsCountdown } from '../overlayCountdown';

describe('formatHmsCountdown', () => {
  it('formats zero as 00:00:00', () => {
    expect(formatHmsCountdown(0)).toBe('00:00:00');
  });

  it('formats one second', () => {
    expect(formatHmsCountdown(1000)).toBe('00:00:01');
  });

  it('formats one minute boundary', () => {
    expect(formatHmsCountdown(60_000)).toBe('00:01:00');
  });

  it('formats one hour boundary', () => {
    expect(formatHmsCountdown(3_600_000)).toBe('01:00:00');
  });

  it('keeps hours unbounded past 24 (no days rollover)', () => {
    // 25h 1m 1s = 25*3600 + 60 + 1 = 90_061 seconds
    expect(formatHmsCountdown(90_061_000)).toBe('25:01:01');
  });

  it('clamps negative durations to 00:00:00', () => {
    expect(formatHmsCountdown(-5000)).toBe('00:00:00');
  });

  it('returns placeholder for NaN', () => {
    expect(formatHmsCountdown(Number.NaN)).toBe('--:--:--');
  });

  it('returns placeholder for Infinity', () => {
    expect(formatHmsCountdown(Number.POSITIVE_INFINITY)).toBe('--:--:--');
  });
});
