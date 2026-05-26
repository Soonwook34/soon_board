// live-map plan §4.1.1 — 마커 라벨 토글 (기본 ON, localStorage 복원).
//
// 사용:
//   <MarkerLabelProvider><Map /></MarkerLabelProvider>
//   const { showLabel, setShowLabel } = useMarkerLabel();
//
// Provider 없이 useMarkerLabel 호출 시 default true (안전한 fallback).

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export const MARKER_LABEL_STORAGE_KEY = 'live_map.marker_label';

interface MarkerLabelContextValue {
  showLabel: boolean;
  setShowLabel: (v: boolean) => void;
}

const DEFAULT_VALUE: MarkerLabelContextValue = {
  showLabel: true,
  setShowLabel: () => {},
};

export const MarkerLabelContext = createContext<MarkerLabelContextValue>(DEFAULT_VALUE);

function readInitial(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage.getItem(MARKER_LABEL_STORAGE_KEY);
    // plan §4.1.1 "기본 ON" — null/손상 모두 default true. 명시적 'false' 만 false.
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function MarkerLabelProvider({ children }: { children: ReactNode }) {
  const [showLabel, setShowLabelState] = useState<boolean>(readInitial);

  const setShowLabel = useCallback((v: boolean) => {
    setShowLabelState(v);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(MARKER_LABEL_STORAGE_KEY, v ? 'true' : 'false');
    } catch {
      // localStorage 사용 불가 (private mode 등) — silent. state 는 메모리에 유지.
    }
  }, []);

  // 다른 탭에서의 변경 동기화
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MARKER_LABEL_STORAGE_KEY) return;
      setShowLabelState(e.newValue !== 'false');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return createElement(MarkerLabelContext.Provider, { value: { showLabel, setShowLabel } }, children);
}

export function useMarkerLabel(): MarkerLabelContextValue {
  return useContext(MarkerLabelContext);
}
