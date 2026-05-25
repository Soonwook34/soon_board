// 맵 전용 시각 상수 — live-map §2.3.
//
// 색상은 모두 src/style/tokens.ts 에서 import (live-map 인수 20: 다크 모드 토큰 일관).
// F1 팀 색·OpenF1 raw hex 만 예외 (Phase 6 마커 컴포넌트에서 처리).

import { color } from '../style/tokens.js';

export const mapStyles = {
  /** 캔버스 배경 (clearRect 후 fillRect). */
  bgPrimary: color.bgBase,
  /** 메인 트랙 stroke 색. */
  trackStroke: color.bgElevated,
  /** 메인 트랙 stroke 두께 (canvas px). */
  trackStrokeWidth: 6,
  /** 핏레인 stroke 색 (회색 파선). */
  pitlaneStroke: color.bgSurface,
  /** 핏레인 stroke 두께. */
  pitlaneStrokeWidth: 3,
  /** 핏레인 dash pattern: [dash, gap]. live-map §4.5 표 — "회색 파선 (대시 4px/2px)". */
  pitlaneDashPattern: [4, 2] as const,
  /** 로딩 placeholder 텍스트 색. */
  loadingTextColor: color.textSecondary,
} as const;
