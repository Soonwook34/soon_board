// 다크 모드 디자인 토큰 (main-page-implementation.md §12 단계 0-f)
// 모든 색·여백·타이포는 이 파일을 통해서만 사용. raw hex 코드 사용 금지 (인수 19).
// 팀 컬러(F1 팀 색상)는 OpenF1 응답의 raw hex를 그대로 보존하므로 예외.

export const color = {
  // 배경 3단계 (어두운 → 밝은 방향)
  bgBase: '#0a0d12',
  bgSurface: '#13171f',
  bgElevated: '#1c2230',

  // 텍스트 3단계
  textPrimary: '#e8eaf0',
  textSecondary: '#a3a9b9',
  textMuted: '#5b6273',

  // 강조 (F1 빨강 베이스)
  accent: '#e10600',
  accentHover: '#ff1a14',
  textOnAccent: '#ffffff', // accent/live 배경 위 텍스트 (WCAG AA contrast 보장)

  // 상태
  live: '#ef4444',
  upcoming: '#3b82f6',
  past: '#6b7280',
  cancelled: '#374151',

  // 경계선
  border: '#262d3a',
  borderStrong: '#3a4252',
} as const;

export const space = {
  '0': '0',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '24px',
  '6': '32px',
  '8': '48px',
  '10': '64px',
} as const;

export const radius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  pill: '999px',
} as const;

export const font = {
  family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  familyMono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  size: {
    xs: '11px',
    sm: '13px',
    base: '15px',
    lg: '18px',
    xl: '22px',
    '2xl': '28px',
    '3xl': '36px',
    '4xl': '48px',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  leading: {
    tight: 1.2,
    normal: 1.5,
  },
} as const;

export const breakpoint = {
  narrow: '1024px',
  desktop: '1280px',
} as const;

export const tokens = { color, space, radius, font, breakpoint } as const;
export type Tokens = typeof tokens;
