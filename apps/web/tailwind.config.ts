import type { Config } from 'tailwindcss';

import { tokens } from './src/design/tokens';

const config: Config = {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      bg: tokens.color.bg,
      text: tokens.color.text,
      accent: tokens.color.accent,
      status: tokens.color.status,
      tyre: tokens.color.tyre,
    },
    extend: {
      fontFamily: {
        // Spread to break the `as const` readonly inference — Tailwind expects mutable string[].
        display: [...tokens.font.family.display],
        body: [...tokens.font.family.body],
        mono: [...tokens.font.family.mono],
      },
      fontSize: tokens.font.size,
      fontWeight: tokens.font.weight,
      spacing: tokens.space,
      borderRadius: tokens.radius,
      boxShadow: {
        ring: 'var(--shadow-ring)',
        glow: 'var(--shadow-glow)',
      },
      transitionDuration: tokens.motion.duration,
      transitionTimingFunction: tokens.motion.ease,
    },
  },
  plugins: [],
};

export default config;
