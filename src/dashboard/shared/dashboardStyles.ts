// dashboard §6 — 패널 공통 스타일 토큰. 배경·텍스트·구분선은 src/style/tokens.ts 에서만 import
// (인수 19: raw hex 금지, F1 표준색만 예외 → tyreColors/sectorColors 에 격리).

import type { CSSProperties } from 'react';
import { color, font, radius, space } from '../../style/tokens';
// 패널별 제목/세부 스타일은 각 패널(단계 4+)이 actual 디자인에 맞춰 정의한다. 본 모듈은
// 모든 패널이 공유하는 최소 primitive(색 토큰 + 컨테이너)만 노출 — 추측성 composite 미포함.

/** 대시보드 전반의 monospace 폰트 패밀리(CSS 변수 + 폴백). 숫자/시간 정렬용. */
export const MONO = 'var(--font-mono, monospace)';

export const dashboardColors = {
  panelBg: color.bgSurface,
  panelBgElevated: color.bgElevated,
  text: color.textPrimary,
  textSecondary: color.textSecondary,
  textMuted: color.textMuted,
  border: color.border,
  borderStrong: color.borderStrong,
  textOnAccent: color.textOnAccent, // accent/live 배경 위 텍스트 (WCAG AA 보장)
} as const;

/** 패널 컨테이너 기본 스타일 (배경·테두리·라운드·패딩). 패널별로 spread 후 override. */
export const panelStyle: CSSProperties = {
  background: dashboardColors.panelBg,
  border: `1px solid ${dashboardColors.border}`,
  borderRadius: radius.md,
  color: dashboardColors.text,
  padding: space['3'],
  fontFamily: font.family,
};
