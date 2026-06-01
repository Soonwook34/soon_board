// dashboard §2.6 — F1 표준 컴파운드 색. raw hex 는 F1 표준색이라 인수 19 예외 (토큰 미경유 허용).

const TYRE_COLORS = {
  SOFT: '#ef4444', // 빨강
  MEDIUM: '#f59e0b', // 노랑
  HARD: '#e5e7eb', // 흰/회
  INTERMEDIATE: '#10b981', // 초록
  WET: '#3b82f6', // 파랑
} as const;

const UNKNOWN_COLOR = '#9ca3af';

export type Compound = keyof typeof TYRE_COLORS;

/** compound(대소문자 무시) → F1 표준 hex. unknown/null 은 회색 fallback. */
export function tyreColor(compound: string | null | undefined): string {
  if (!compound) return UNKNOWN_COLOR;
  const key = compound.toUpperCase() as Compound;
  return TYRE_COLORS[key] ?? UNKNOWN_COLOR;
}

/** 리더보드/막대 라벨용 단문자. SOFT→S, MEDIUM→M, HARD→H, INTERMEDIATE→I, WET→W. */
export function tyreLetter(compound: string | null | undefined): string {
  if (!compound) return '?';
  const c = compound.toUpperCase();
  if (c === 'INTERMEDIATE') return 'I';
  return c.charAt(0) || '?';
}
