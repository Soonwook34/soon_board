// US-4 — flagIcons: category/flag → 아이콘.
import { describe, expect, it } from 'vitest';
import { flagIcon, flagIconCategory } from '../flagIcons';

describe('flagIconCategory', () => {
  it('SafetyCar / DRS / Flag / Other 분류', () => {
    expect(flagIconCategory({ category: 'SafetyCar' })).toBe('safetycar');
    expect(flagIconCategory({ category: 'Drs' })).toBe('drs');
    expect(flagIconCategory({ flag: 'YELLOW' })).toBe('flag');
    expect(flagIconCategory({ category: 'Flag', flag: 'CLEAR' })).toBe('flag');
    expect(flagIconCategory({ category: 'Other' })).toBe('other');
    expect(flagIconCategory({ flag: 'CLEAR' })).toBe('other'); // clear 는 깃발 아님
  });
});

describe('flagIcon', () => {
  it('카테고리별 이모지', () => {
    expect(flagIcon({ category: 'SafetyCar' })).toBe('🚨');
    expect(flagIcon({ flag: 'RED' })).toBe('🚩');
    expect(flagIcon({ category: 'Drs' })).toBe('🔵');
    expect(flagIcon({ category: 'CarEvent' })).toBe('📋');
  });
});
