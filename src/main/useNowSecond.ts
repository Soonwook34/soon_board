// 1Hz now tick — plan main-page-implementation.md §4.4 (성능 주의) + §5 (visibility resync).
// nextHeroSession은 가용 시즌 × ~120 세션 = 수백 회 classify() 호출. RAF tick은 과도 —
// 1초 단위로만 갱신. Countdown.tsx와 동일한 drift-free 패턴 (매 tick Date.now() 재읽기).
//
// visibilitychange: Chrome/Firefox는 백그라운드 탭의 setInterval을 최대 60s 단위로 throttle.
// 포그라운드 복귀 시 즉시 setNow(Date.now())로 동기화해야 CountdownOverlay/Hero/ExpandedSessions
// 모두 정확한 status로 즉시 재평가 (plan §5 명시 요구).

import { useEffect, useState } from 'react';

export function useNowSecond(): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
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
  }, []);
  return now;
}
