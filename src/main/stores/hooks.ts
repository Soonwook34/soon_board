// React hooks (useSyncExternalStore 기반) — catalogStore/uiStore의 thin wrapping.
// React 외부 라이브러리 의존 없음.

import { useSyncExternalStore } from 'react';
import { getAllSeasons, getCatalogIndex, getSeason, subscribeCatalog } from './catalogStore';
import { getUiState, subscribeUi } from './uiStore';
import type { SeasonData, SeasonsIndex } from '../../shared/seasonData';
import type { UiState } from './uiStore';

export function useCatalogIndex(): SeasonsIndex | null {
  return useSyncExternalStore(subscribeCatalog, getCatalogIndex, () => null);
}

export function useSeasonCatalog(year: number | null): SeasonData | null {
  return useSyncExternalStore(
    subscribeCatalog,
    () => (year === null ? null : getSeason(year)),
    () => null,
  );
}

const EMPTY_SEASONS: SeasonData[] = [];

/** 적재된 모든 시즌 — ReplayScreen 의 다년도 session_key 검색 용도.
 *  reference 안정성은 catalogStore.getAllSeasons 가 보장 (cache 변경 시점에만 새 배열). */
export function useAllSeasons(): SeasonData[] {
  return useSyncExternalStore(subscribeCatalog, getAllSeasons, () => EMPTY_SEASONS);
}

export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiState);
}
