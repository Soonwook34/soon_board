// 시뮬레이션 모드 시각 인디케이터 — plan main-page-implementation.md §12 단계 14 + 인수 16.
// ?now=ISO8601 활성 시 화면 모서리에 'SIM' + 시각 표시 → 개발자가 시뮬레이션 상태를
// 자명하게 인지 (production은 readSimulatedNowMs가 차단하므로 본 컴포넌트는 자동으로 null).

import { useRef } from 'react';
import { VERCEL_ENV } from '../shared/env';
import { readSimulatedNowMs } from '../shared/simulatedNow';

export function SimBadge() {
  // mount 시점에 1회 평가 (useNowSecond와 동일 패턴). useMemo([])는 의도된 mount-time이지만
  // exhaustive-deps lint에 false-cache-invalidation 의미로 오해될 수 있어 useRef로 통일.
  const simulatedRef = useRef<number | null | undefined>(undefined);
  if (simulatedRef.current === undefined) {
    simulatedRef.current =
      typeof window === 'undefined'
        ? null
        : readSimulatedNowMs(window.location.search, {
            dev: import.meta.env.DEV,
            vercelEnv: VERCEL_ENV,
          });
  }
  const simulated = simulatedRef.current;
  if (simulated === null) return null;

  const iso = new Date(simulated).toISOString();
  return (
    <div
      data-testid="sim-badge"
      style={{
        position: 'fixed',
        bottom: '12px',
        left: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '999px',
        background: 'var(--color-accent)',
        color: 'var(--color-text-on-accent)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        zIndex: 70,
      }}
    >
      <span>SIM</span>
      <span>{iso}</span>
    </div>
  );
}
