// 프로파일 레지스트리 — 세션 종류 → DashboardProfile. qualifying-session-dashboard.md §3.2.

import { isQualifyingFamily, type SessionKind } from '../../shared/sessionKind';
import { defaultProfile } from './defaultProfile';
import { qualifyingProfile } from './qualifyingProfile';
import type { DashboardProfile } from './types';

/**
 * 세션 종류에 맞는 대시보드 프로파일을 반환. 퀄리파잉 계열(Qualifying/Sprint Qualifying)은
 * qualifyingProfile, 그 외/미지정은 default(회귀 안전 기준선).
 */
export function resolveProfile(kind: SessionKind | null): DashboardProfile {
  if (isQualifyingFamily(kind)) return qualifyingProfile;
  return defaultProfile;
}

export { defaultProfile } from './defaultProfile';
export { qualifyingProfile } from './qualifyingProfile';
export type { DashboardProfile, ProfileRenderContext } from './types';
