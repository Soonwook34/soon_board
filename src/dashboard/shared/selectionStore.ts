// dashboard §2.5/§3.7 — 선택된 드라이버 전역 스토어 (모듈 스코프, provider 불필요).
// 리더보드 행/맵 마커 클릭이 write, 사이드 패널(단계 8)이 read. useSyncExternalStore 로 구독.
// 같은 driver 재클릭은 toggle(해제) — §3.7 "다시 클릭 시 닫힘".

import { useSyncExternalStore } from 'react';

let selectedDriver: number | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** 드라이버 선택. 같은 번호 재선택 시 해제(toggle, §3.7). */
export function selectDriver(driverNumber: number): void {
  selectedDriver = selectedDriver === driverNumber ? null : driverNumber;
  emit();
}

/** 명시적 선택 해제 (X 버튼·모드 전환 시 reset). */
export function clearSelection(): void {
  if (selectedDriver === null) return;
  selectedDriver = null;
  emit();
}

export function getSelectedDriver(): number | null {
  return selectedDriver;
}

export function subscribeSelection(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 테스트 전용 리셋 — 선택값 + 리스너 초기화. */
export function _resetSelection(): void {
  selectedDriver = null;
  listeners.clear();
}

/** 선택된 driver_number 구독 훅. 없으면 null. */
export function useSelectedDriver(): number | null {
  return useSyncExternalStore(subscribeSelection, getSelectedDriver, getSelectedDriver);
}
