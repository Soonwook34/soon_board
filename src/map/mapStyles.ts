// 맵 전용 시각 상수 — live-map §2.3.
//
// 색상은 모두 src/style/tokens.ts 에서 import (live-map 인수 20: 다크 모드 토큰 일관).
// F1 팀 색·OpenF1 raw hex 만 예외 (Phase 6 마커 컴포넌트에서 처리).

import { color, font } from '../style/tokens.js';

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

  // ── Phase 6 marker 상수 (live-map §4.1) ──────────────────────────────
  /** 마커 최소 크기 (직경 px). */
  markerSizeMin: 18,
  /** 마커 최대 크기 (직경 px). 동적 계산은 Phase 14. */
  markerSizeMax: 32,
  /** 마커 외곽 stroke 색 (흰 테두리). */
  markerBorderColor: color.textPrimary,
  /** 마커 외곽 stroke 두께. */
  markerBorderWidth: 1.5,
  /** 마커 중앙 driver_number 폰트. */
  driverNumberFontFamily: font.family,
  driverNumberFontWeight: font.weight.bold,
  /** 라벨 (name_acronym) 폰트 크기. */
  labelFontSize: font.size.xs,
  /** 라벨 마커 아래 오프셋 (px). */
  labelOffsetPx: 6,
  /** 라벨 색. */
  labelColor: color.textPrimary,

  // ── Phase 7 trail + state 토큰 (live-map §4.2 + §4.3) ───────────────
  /** 트레일 가장 오래된 점 alpha. */
  trailAlphaStart: 0,
  /** 트레일 가장 최근 점 alpha. */
  trailAlphaEnd: 0.3,
  /** 트레일 line 두께 (px). */
  trailLineWidth: 2,
  /** 연결 끊김 (disconnected) 마커 alpha. plan §4.2 "dim 50%". */
  disconnectedAlpha: 0.5,
  /** 리타이어 마커 fill (grayscale). plan §4.2 "마커 grayscale". */
  retiredFill: color.textMuted,
} as const;
