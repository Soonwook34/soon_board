// US-4 — tyreColors: F1 표준 색 + 단문자.
import { describe, expect, it } from 'vitest';
import { tyreColor, tyreLetter } from '../tyreColors';

describe('tyreColor', () => {
  it('F1 표준 컴파운드 색 (대소문자 무시)', () => {
    expect(tyreColor('SOFT')).toBe('#ef4444');
    expect(tyreColor('medium')).toBe('#f59e0b');
    expect(tyreColor('Hard')).toBe('#e5e7eb');
    expect(tyreColor('INTERMEDIATE')).toBe('#10b981');
    expect(tyreColor('wet')).toBe('#3b82f6');
  });
  it('unknown/null 은 회색 fallback', () => {
    expect(tyreColor('UNKNOWN')).toBe('#9ca3af');
    expect(tyreColor(null)).toBe('#9ca3af');
    expect(tyreColor(undefined)).toBe('#9ca3af');
  });
});

describe('tyreLetter', () => {
  it('S/M/H/I/W', () => {
    expect(tyreLetter('SOFT')).toBe('S');
    expect(tyreLetter('MEDIUM')).toBe('M');
    expect(tyreLetter('HARD')).toBe('H');
    expect(tyreLetter('INTERMEDIATE')).toBe('I');
    expect(tyreLetter('WET')).toBe('W');
    expect(tyreLetter(null)).toBe('?');
  });
});
