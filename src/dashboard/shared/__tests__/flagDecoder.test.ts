// US-6 — flagDecoder.flagKind + activeFlags.activeFlag (still-active 판정, 인수 9).
import { describe, expect, it } from 'vitest';
import { flagKind } from '../flagDecoder';
import { activeFlag } from '../../derived/activeFlags';
import type { RaceControlRecord } from '../../../shared/openf1Types';

const T0 = Date.parse('2024-03-02T15:00:00.000Z');
const at = (sec: number) => new Date(T0 + sec * 1000);

function rc(sec: number, partial: Partial<RaceControlRecord>): RaceControlRecord {
  return {
    date: at(sec),
    session_key: 1,
    meeting_key: 1,
    category: '',
    flag: null,
    scope: null,
    sector: null,
    driver_number: null,
    lap_number: null,
    message: '',
    qualifying_phase: null,
    ...partial,
  };
}

describe('flagKind', () => {
  it('flag/category 필드로 종류 판정', () => {
    expect(flagKind({ flag: 'CHEQUERED', category: '', message: '' })).toBe('chequered');
    expect(flagKind({ flag: 'RED', category: '', message: '' })).toBe('red');
    expect(flagKind({ flag: 'YELLOW', category: '', message: '' })).toBe('yellow');
    expect(flagKind({ flag: 'DOUBLE YELLOW', category: '', message: '' })).toBe('yellow');
    expect(flagKind({ flag: 'GREEN', category: '', message: '' })).toBe('green');
    expect(flagKind({ flag: 'CLEAR', category: '', message: '' })).toBe('clear');
    expect(flagKind({ flag: null, category: 'SafetyCar', message: '' })).toBe('safetycar');
    expect(flagKind({ flag: null, category: 'Other', message: 'DRS ENABLED' })).toBe('other');
  });
});

describe('activeFlag (still-active)', () => {
  const messages = [
    rc(10, { flag: 'YELLOW', category: 'Flag', message: 'YELLOW SECTOR 4' }),
    rc(20, { flag: 'GREEN', category: 'Flag', message: 'GREEN SECTOR 4' }),
  ];

  it('YELLOW 구간에서는 YELLOW 활성', () => {
    expect(activeFlag(messages, at(15))?.kind).toBe('yellow');
  });

  it('GREEN 직후 5초간 GREEN 활성', () => {
    expect(activeFlag(messages, at(22))?.kind).toBe('green');
  });

  it('GREEN 5초 경과 후 만료 → null (인수 9)', () => {
    expect(activeFlag(messages, at(26))).toBeNull();
  });

  it('CHEQUERED 는 이후 계속 활성', () => {
    const m = [...messages, rc(100, { flag: 'CHEQUERED', message: 'CHEQUERED FLAG' })];
    expect(activeFlag(m, at(500))?.kind).toBe('chequered');
  });

  it('SafetyCar 종료 메시지면 만료', () => {
    const m = [rc(30, { category: 'SafetyCar', message: 'SAFETY CAR DEPLOYED' })];
    expect(activeFlag(m, at(35))?.kind).toBe('safetycar');
    const ended = [...m, rc(60, { category: 'SafetyCar', message: 'SAFETY CAR IN THIS LAP' })];
    expect(activeFlag(ended, at(65))).toBeNull();
  });

  it('미래 메시지 미포함 (date≤t)', () => {
    expect(activeFlag(messages, at(5))).toBeNull(); // 첫 메시지(10s) 이전
  });

  it('RED 는 이후 GREEN 이 supersede 할 때까지 활성', () => {
    const red = [rc(10, { flag: 'RED', category: 'Flag', message: 'RED FLAG' })];
    expect(activeFlag(red, at(500))?.kind).toBe('red'); // 오랜 시간 후에도 활성
    const cleared = [...red, rc(600, { flag: 'GREEN', category: 'Flag', message: 'GREEN' })];
    expect(activeFlag(cleared, at(601))?.kind).toBe('green'); // GREEN 직후
    expect(activeFlag(cleared, at(610))).toBeNull(); // GREEN 5s 경과 → 만료
  });
});
