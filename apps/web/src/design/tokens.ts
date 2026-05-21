/**
 * SOON BOARD design tokens.
 *
 * Single source of truth: Tailwind config and globals.css both derive from this object.
 * Never re-declare token values elsewhere. If you need a new token, add it here first.
 *
 * Plan v2.3 §Technical Context — dark telemetry mirror + F1 red accent + Orbitron/Orbit/JetBrains Mono.
 */

export const tokens = {
  color: {
    // Base — dark telemetry mirror
    bg: {
      base: '#0A0A0F', // page background
      surface: '#13131A', // cards / panels
      raised: '#1C1C24', // hover / active
      border: '#2A2A35', // dividers
    },
    // Text
    text: {
      primary: '#F5F5F0', // body, large numbers
      secondary: '#A8A8B5', // sub-info
      tertiary: '#6B6B7A', // disabled / hint
      inverse: '#0A0A0F', // text on light surfaces (rare)
    },
    // Accent — F1 red. The "ON" in SOON BOARD + live indicator + red flag.
    accent: {
      DEFAULT: '#E10600', // F1 logo red, AAA contrast on bg.base (5.36:1)
      hover: '#FF1801',
      dim: '#8B0400',
    },
    // Race control statuses
    status: {
      green: '#10B981',
      yellow: '#F59E0B',
      red: '#E10600',
      blue: '#3B82F6',
      purple: '#A855F7', // overall best sector
      gray: '#374151',
    },
    // Tyre compounds (F1 broadcast convention)
    tyre: {
      soft: '#E10600',
      medium: '#FCD34D',
      hard: '#F5F5F0',
      intermediate: '#10B981',
      wet: '#3B82F6',
    },
  },
  font: {
    family: {
      // Plan v2.2: Orbitron + Orbit (Google Fonts confirmed by user) + JetBrains Mono only.
      display: ['Orbitron', 'Orbit', 'system-ui', 'sans-serif'] as const,
      body: ['Orbitron', 'Orbit', 'system-ui', 'sans-serif'] as const,
      mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'] as const,
    },
    size: {
      xs: '11px',
      sm: '13px',
      base: '15px',
      lg: '18px',
      xl: '24px',
      '2xl': '32px',
      '3xl': '48px',
      '4xl': '72px',
    },
    weight: {
      regular: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      black: '900',
    },
    feature: {
      // Apply via `font-feature-settings: 'tnum'` for column-aligned numbers.
      tabular: 'tabular-nums',
    },
  },
  space: {
    '0': '0',
    '1': '4px',
    '2': '8px',
    '3': '12px',
    '4': '16px',
    '5': '24px',
    '6': '32px',
    '7': '48px',
    '8': '64px',
  },
  radius: {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  shadow: {
    // Dark UI prefers borders over shadows. Use ring for focus and glow for live indicators only.
    ring: '0 0 0 1px var(--ring-color, #2A2A35)',
    glow: '0 0 16px var(--glow-color, rgba(225, 6, 0, 0.5))',
  },
  motion: {
    duration: {
      fast: '150ms',
      base: '250ms',
      slow: '400ms',
    },
    ease: {
      standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
      emphasize: 'cubic-bezier(0.2, 0, 0, 1)',
    },
  },
} as const;

export type Tokens = typeof tokens;
