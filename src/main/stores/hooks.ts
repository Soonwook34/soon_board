// React hooks (useSyncExternalStore 기반) — catalogStore/uiStore의 thin wrapping.
// React 외부 라이브러리 의존 없음.

import { useSyncExternalStore } from 'react';
import { getCatalogIndex, getSeason, subscribeCatalog } from './catalogStore';
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

export function useUiState(): UiState {
  return useSyncExternalStore(subscribeUi, getUiState, getUiState);
}
