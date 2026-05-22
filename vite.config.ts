/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// critic P0-3: Vite는 vercel.json env 매핑을 자동 인라인하지 않음.
// VITE_VERCEL_ENV는 빌드 셸의 process.env.VERCEL_ENV로 명시 주입해야
// production gate (`?now=...` 차단 등)가 fail-open/fail-closed 되지 않음.
// 누락 시 import.meta.env.VITE_VERCEL_ENV는 항상 ''로 인라인되어
// 인수 17이 항상 실패. (.omc/plans/main-page-implementation.md §12 단계 0-b1)
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
});
