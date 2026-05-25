// 1Hz now tick — plan main-page-implementation.md §4.4 (성능 주의) + §5 (visibility resync) + 단계 14 (?now= 시뮬레이션).
// nextHeroSession은 가용 시즌 × ~120 세션 = 수백 회 classify() 호출. RAF tick은 과도 —
// 1초 단위로만 갱신. Countdown.tsx와 동일한 drift-free 패턴 (매 tick Date.now() 재읽기).
//
// visibilitychange: Chrome/Firefox는 백그라운드 탭의 setInterval을 최대 60s 단위로 throttle.
// 포그라운드 복귀 시 즉시 setNow(Date.now())로 동기화해야 CountdownOverlay/Hero/ExpandedSessions
// 모두 정확한 status로 즉시 재평가 (plan §5 명시 요구).
//
// ?now=ISO8601 시뮬레이션 (plan §12 단계 14 + 인수 16, 17): DEV 또는 preview에서만 활성.
// production은 readSimulatedNowMs 자체에서 차단. sim 활성 시 mount 시점에 simulated ms를 1회
// 평가해 frozen으로 반환 — 시각 회귀 테스트가 결정적이 되고 setInterval/visibility 등록 skip.
// (mount-time freeze이므로 주소창 ?now= 편집은 hot-reload — full remount — 후에야 반영.)

import { useEffect, useRef, useState } from 'react';
import { VERCEL_ENV } from '../shared/env';
import { readSimulatedNowMs } from '../shared/simulatedNow';

export function useNowSecond(): number {
  // 시뮬레이션 ms는 mount 시점에 1회만 평가 — useRef로 첫 평가 결과를 freeze.
  // SSR 환경 보호: window 미존재 시 sim 비활성으로 폴백.
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
  const [now, setNow] = useState<number>(() => simulated ?? Date.now());

  useEffect(() => {
    // sim 활성 시 frozen — tick 등록 skip.
    if (simulated !== null) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    function onVis() {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [simulated]);

  return now;
}
