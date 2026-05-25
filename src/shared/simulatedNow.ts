// ?now=ISO8601 시뮬레이션 — plan main-page-implementation.md §12 단계 14 + 인수 16, 17.
// production 차단 정책 (critic P0-3 use-site, 인수 17):
//   분기 = import.meta.env.DEV || VITE_VERCEL_ENV === 'preview'
//   PROD만으로는 Vite가 preview 빌드도 PROD=true로 잡아 분기가 깨짐.
// 잘못된 ISO나 production에서 ?now= 무시 → null 반환 → 호출자가 실 Date.now() fallback.

export interface SimulatedNowEnv {
  /** import.meta.env.DEV */
  dev: boolean;
  /** import.meta.env.VITE_VERCEL_ENV (production / preview / '') */
  vercelEnv: string;
}

export function readSimulatedNowMs(search: string, env: SimulatedNowEnv): number | null {
  const allowed = env.dev || env.vercelEnv === 'preview';
  if (!allowed) return null;
  const params = new URLSearchParams(search);
  const raw = params.get('now');
  if (raw === null || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}
