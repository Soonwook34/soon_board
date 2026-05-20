import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'soon-accent': '#E10600',
        'soon-neon': '#00FF94',
        'soon-muted': '#9CA3AF',
        'bg-base': '#0A0A0B',
        'bg-elev1': '#14141A',
        'bg-elev2': '#1F1F28',
        'tire-soft': '#FF3333',
        'tire-medium': '#FFD600',
        'tire-hard': '#FFFFFF',
        'tire-inter': '#43B02A',
        'tire-wet': '#0067AD',
      },
      fontFamily: {
        display: [
          'Formula1 Wide',
          'Formula1',
          'Orbit',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
        sans: [
          'Formula1',
          'Orbit',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Helvetica Neue',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}

export default config
