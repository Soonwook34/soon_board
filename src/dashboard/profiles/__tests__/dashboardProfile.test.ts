// 프로파일 레지스트리 계약 테스트 — US-003. (렌더는 기존 DashboardApp 테스트가 회귀 보장)

import { describe, expect, it } from 'vitest';
import { resolveProfile, defaultProfile, qualifyingProfile } from '../index';
import type { SessionKind } from '../../../shared/sessionKind';

describe('resolveProfile', () => {
  const kinds: ReadonlyArray<SessionKind | null> = [
    'race',
    'sprint',
    'practice',
    'qualifying',
    'sprint_qualifying',
    null,
  ];

  it.each(kinds)('항상 유효한 프로파일(3 슬롯 렌더 함수)을 반환 — kind=%s', (kind) => {
    const p = resolveProfile(kind);
    expect(p).toBeTruthy();
    expect(typeof p.renderProgress).toBe('function');
    expect(typeof p.renderSidebar).toBe('function');
    expect(typeof p.renderBadges).toBe('function');
  });

  it('비-퀄리/미지정 세션은 default 프로파일(회귀 안전 기준선)', () => {
    expect(resolveProfile('race')).toBe(defaultProfile);
    expect(resolveProfile('practice')).toBe(defaultProfile);
    expect(resolveProfile('sprint')).toBe(defaultProfile);
    expect(resolveProfile(null)).toBe(defaultProfile);
    expect(defaultProfile.kind).toBe('default');
  });

  it('퀄리파잉 계열(Qualifying/Sprint Qualifying)은 qualifyingProfile', () => {
    expect(resolveProfile('qualifying')).toBe(qualifyingProfile);
    expect(resolveProfile('sprint_qualifying')).toBe(qualifyingProfile);
    expect(qualifyingProfile.kind).toBe('qualifying');
  });
});
