// sessionKind SSOT 단위 테스트 — qualifying-session-dashboard.md §2 / US-001.

import { describe, expect, it } from 'vitest';
import {
  resolveSessionKind,
  isQualifyingFamily,
  SEGMENT_DURATIONS_MIN,
  type SessionKind,
} from '../sessionKind';

describe('resolveSessionKind — (session_type, session_name) 조합', () => {
  // [session_type, session_name, expected]
  const cases: ReadonlyArray<[string, string, SessionKind | null]> = [
    ['Practice', 'Practice 1', 'practice'],
    ['Practice', 'Practice 2', 'practice'],
    ['Practice', 'Practice 3', 'practice'],
    ['Qualifying', 'Qualifying', 'qualifying'],
    ['Qualifying', 'Sprint Qualifying', 'sprint_qualifying'],
    ['Qualifying', 'Sprint Shootout', 'sprint_qualifying'],
    ['Race', 'Sprint', 'sprint'],
    ['Race', 'Race', 'race'],
  ];

  it.each(cases)('(%s, %s) → %s', (type, name, expected) => {
    expect(resolveSessionKind(type, name)).toBe(expected);
  });

  it('두 필드 조합 필수 — session_type 단독으로는 오판되는 케이스를 정확히 분기', () => {
    // session_type 만 보면 Race 지만 실제로는 Sprint
    expect(resolveSessionKind('Race', 'Sprint')).toBe('sprint');
    // session_type 만 보면 Qualifying 지만 실제로는 Sprint Qualifying
    expect(resolveSessionKind('Qualifying', 'Sprint Qualifying')).toBe('sprint_qualifying');
    // 일반 퀄리/레이스는 그대로
    expect(resolveSessionKind('Qualifying', 'Qualifying')).toBe('qualifying');
    expect(resolveSessionKind('Race', 'Race')).toBe('race');
  });

  it('대소문자/공백 무시', () => {
    expect(resolveSessionKind('  QUALIFYING  ', '  qualifying ')).toBe('qualifying');
    expect(resolveSessionKind('race', 'SPRINT')).toBe('sprint');
  });

  it('매핑 불가 → null', () => {
    expect(resolveSessionKind('Warmup', 'Warmup')).toBeNull();
    expect(resolveSessionKind('', '')).toBeNull();
  });
});

describe('isQualifyingFamily', () => {
  it('qualifying / sprint_qualifying 만 true', () => {
    expect(isQualifyingFamily('qualifying')).toBe(true);
    expect(isQualifyingFamily('sprint_qualifying')).toBe(true);
    expect(isQualifyingFamily('race')).toBe(false);
    expect(isQualifyingFamily('sprint')).toBe(false);
    expect(isQualifyingFamily('practice')).toBe(false);
    expect(isQualifyingFamily(null)).toBe(false);
  });
});

describe('SEGMENT_DURATIONS_MIN — 세그먼트 제한시간 SSOT', () => {
  it('Qualifying = 18/15/12, Sprint Qualifying = 12/10/8 (서로 다름)', () => {
    expect(SEGMENT_DURATIONS_MIN.qualifying).toEqual([18, 15, 12]);
    expect(SEGMENT_DURATIONS_MIN.sprint_qualifying).toEqual([12, 10, 8]);
    expect(SEGMENT_DURATIONS_MIN.qualifying).not.toEqual(SEGMENT_DURATIONS_MIN.sprint_qualifying);
  });
});
