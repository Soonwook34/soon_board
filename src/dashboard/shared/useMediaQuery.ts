// dashboard §1.5/§3.7 — viewport 미디어 쿼리 구독 훅. 사이드 패널 자동 닫힘(<1280px) 등
// JS 기반 반응형 분기에 사용 (레이아웃 자체는 CSS Grid/미디어쿼리, 동작 트리거만 JS).
// SSR/비지원 환경에서는 false (graceful).

import { useEffect, useState } from 'react';

function evaluate(query: string): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => evaluate(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange(); // 렌더~effect 사이 변화 동기화.
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
