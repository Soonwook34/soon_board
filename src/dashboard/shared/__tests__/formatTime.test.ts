// US-8B — formatTime SSOT 단위 테스트 (lap/sector/gap 포맷 + 경계/null).
import { describe, expect, it } from 'vitest';
import { formatGap, formatLapTime, formatSector } from '../formatTime';

describe('formatLapTime', () => {
  it('분:초.밀리 — 1:31.456', () => {
    expect(formatLapTime(91.456)).toBe('1:31.456');
  });

  it('초<10 zero-pad — 65.4 → 1:05.400', () => {
    expect(formatLapTime(65.4)).toBe('1:05.400');
  });

  it('1분 미만 — 0:09.999', () => {
    expect(formatLapTime(9.999)).toBe('0:09.999');
  });

  it('null/음수/NaN 은 —', () => {
    expect(formatLapTime(null)).toBe('—');
    expect(formatLapTime(undefined)).toBe('—');
    expect(formatLapTime(-1)).toBe('—');
    expect(formatLapTime(Number.NaN)).toBe('—');
  });
});

describe('formatSector', () => {
  it('소수 3자리 — 28.123', () => {
    expect(formatSector(28.123)).toBe('28.123');
  });

  it('null/음수 은 —', () => {
    expect(formatSector(null)).toBe('—');
    expect(formatSector(-0.5)).toBe('—');
  });
});

describe('formatGap', () => {
  it('숫자 → +s.mmm', () => {
    expect(formatGap(1.234)).toBe('+1.234');
  });

  it('문자열(lapped) passthrough', () => {
    expect(formatGap('+1 LAP')).toBe('+1 LAP');
  });

  it('null → —', () => {
    expect(formatGap(null)).toBe('—');
    expect(formatGap(undefined)).toBe('—');
  });
});
