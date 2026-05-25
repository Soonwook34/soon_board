// 메인 페이지 컨테이너 — plan main-page-implementation.md §1, §12 단계 4 / 7 / 10.
// 책임:
//   - 진입 시 loadCatalogIndex() + 현재 시즌 loadSeason()
//   - uiStore의 season 변경 추적 → 해당 시즌 lazy load (이미 캐시면 즉시)
//   - 자식 컴포넌트 조립 (NarrowScreenBanner / 헤더+검색바 / Hero / SeasonPicker+필터 / GpGrid)
//   - 현재 연도 시즌이 캐시 로드 완료된 후 1회 백그라운드 재검증 (인수 12) → 변경 시 Toast

import { useEffect, useMemo, useRef, useState } from 'react';
import { GpGrid } from './GpGrid';
import { Hero } from './Hero';
import { NarrowScreenBanner } from './NarrowScreenBanner';
import { SeasonPicker } from './SeasonPicker';
import { FilterChips, SearchBar } from './SearchFilter';
import { SimBadge } from './SimBadge';
import { Toast } from './Toast';
import { selectInitialSeason } from './initialSeason';
import { loadCatalogIndex, loadSeason } from './stores/catalogStore';
import { revalidateCurrentSeason } from './stores/revalidateSeason';
import { setExpandedGp, setSeason } from './stores/uiStore';
import { useCatalogIndex, useSeasonCatalog, useUiState } from './stores/hooks';

export function MainPage() {
  const index = useCatalogIndex();
  const ui = useUiState();
  const effectiveSeason = useMemo(() => selectInitialSeason(index, ui.season), [index, ui.season]);
  const seasonData = useSeasonCatalog(effectiveSeason);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // 같은 mount 안에서 (year별로) 1회만 백그라운드 재검증 (StrictMode 이중 호출 dedup).
  const revalidatedYearsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    loadCatalogIndex().catch((err) => {
      console.error('[MainPage] failed to load /seasons/index.json', err);
    });
  }, []);

  useEffect(() => {
    if (effectiveSeason === null) return;
    const isCurrent = effectiveSeason === new Date().getFullYear();
    loadSeason(effectiveSeason)
      .then(() => {
        if (!isCurrent || revalidatedYearsRef.current.has(effectiveSeason)) return [];
        revalidatedYearsRef.current.add(effectiveSeason);
        return revalidateCurrentSeason(effectiveSeason);
      })
      .then((changes) => {
        if (changes.length > 0) setToastMessage('일정이 업데이트되었습니다');
      })
      .catch((err) => {
        console.error(`[MainPage] failed to load /seasons/${effectiveSeason}.json`, err);
      });
  }, [effectiveSeason]);

  const now = useMemo(() => new Date(), []);

  return (
    <main style={{ minHeight: '100%' }}>
      <NarrowScreenBanner />
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '20px', letterSpacing: '0.04em' }}>Soon Board</h1>
        <SearchBar />
      </header>

      <Hero seasons={seasonData ? [seasonData] : []} />

      <section
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          padding: '20px 32px',
          borderBottom: '1px solid var(--color-border)',
          flexWrap: 'wrap',
        }}
      >
        <SeasonPicker
          index={index}
          currentSeason={effectiveSeason}
          onChange={(y) => setSeason(y)}
        />
        <FilterChips />
      </section>

      <section style={{ padding: '24px 32px' }}>
        <GpGrid
          meetings={seasonData?.meetings ?? null}
          expandedGp={ui.expandedGp}
          onExpandGp={setExpandedGp}
          search={ui.search}
          sessionTypes={ui.sessionTypes}
          statuses={ui.statuses}
          now={now}
        />
      </section>

      {toastMessage !== null && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}

      <SimBadge />

      {/* Footer 자리 (deployment-architecture.md §6.2, critic M8) — 후속 phase */}
    </main>
  );
}
