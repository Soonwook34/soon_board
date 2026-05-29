// 시즌 카탈로그 스토어 — plan main-page-implementation.md §3.3 + §12 단계 3, 10.
// 책임:
//   - 인덱스(/seasons/index.json) lazy load + 인메모리 캐시
//   - 시즌(/seasons/{year}.json) lazy load (year별 캐시)
//   - 동시 호출 dedupe (in-flight Promise 공유)
//   - subscribe 패턴으로 React useSyncExternalStore 연결
//   - _patchSessions: 런타임 재검증 결과 in-memory immutable patch (Phase 10)
//
// CORS ping (라이브/리플레이 진입)은 Phase 11 책임 — 본 모듈은 same-origin
// 정적 자산만 다루므로 CORS 무관. revalidateCurrentSeason은
// stores/revalidateSeason.ts에서 OpenF1 직접 호출.

import type { SeasonData, SeasonsIndex } from '../../shared/seasonData';
import { normalizeCancelled, type FreshSessionPatch } from '../derived/seasonDiff';

const DEFAULT_INDEX_URL = '/seasons/index.json';
const DEFAULT_SEASON_URL = (year: number): string => `/seasons/${year}.json`;

export interface CatalogStoreOptions {
  fetchImpl?: typeof fetch;
  indexUrl?: string;
  seasonUrl?: (year: number) => string;
}

function requireFetch(): typeof fetch {
  if (!globalThis.fetch) throw new Error('fetch is not available in this environment');
  return globalThis.fetch.bind(globalThis);
}

function makeDefaultOpts(): Required<CatalogStoreOptions> {
  return {
    fetchImpl: requireFetch(),
    indexUrl: DEFAULT_INDEX_URL,
    seasonUrl: DEFAULT_SEASON_URL,
  };
}

// 모듈 상태 — 단일 process/탭 내 공유. 테스트는 _resetCatalogStore()로 격리.
let opts = makeDefaultOpts();

let cachedIndex: SeasonsIndex | null = null;
let indexInflight: Promise<SeasonsIndex> | null = null;
const seasonCache = new Map<number, SeasonData>();
const seasonInflight = new Map<number, Promise<SeasonData>>();
const listeners = new Set<() => void>();
// useSyncExternalStore 호환을 위해 cache 변경 시점에만 새 배열 발행 — getter 가 매번 새 배열을
// 만들면 React 가 무한 리렌더로 인식한다.
let cachedAllSeasons: SeasonData[] = [];
let allSeasonsDirty = false;

export function configureCatalogStore(custom: CatalogStoreOptions): void {
  opts = { ...opts, ...custom } as Required<CatalogStoreOptions>;
}

export function getCatalogIndex(): SeasonsIndex | null {
  return cachedIndex;
}

export function getSeason(year: number): SeasonData | null {
  return seasonCache.get(year) ?? null;
}

/** 현재 메모리에 적재된 모든 시즌 — replay 가 다년도 session_key 검색 시 사용.
 *  반환 reference 는 cache 변경 시점에만 바뀐다 (useSyncExternalStore 호환). */
export function getAllSeasons(): SeasonData[] {
  if (allSeasonsDirty) {
    cachedAllSeasons = Array.from(seasonCache.values());
    allSeasonsDirty = false;
  }
  return cachedAllSeasons;
}

export async function loadCatalogIndex(): Promise<SeasonsIndex> {
  if (cachedIndex) return cachedIndex;
  if (indexInflight) return indexInflight;
  indexInflight = (async () => {
    try {
      const res = await opts.fetchImpl(opts.indexUrl);
      if (!res.ok) throw new Error(`catalog index ${res.status}: ${opts.indexUrl}`);
      const data = (await res.json()) as SeasonsIndex;
      cachedIndex = data;
      notify();
      return data;
    } finally {
      indexInflight = null;
    }
  })();
  return indexInflight;
}

export async function loadSeason(year: number): Promise<SeasonData> {
  const cached = seasonCache.get(year);
  if (cached) return cached;
  const inflight = seasonInflight.get(year);
  if (inflight) return inflight;
  const p = (async () => {
    try {
      const res = await opts.fetchImpl(opts.seasonUrl(year));
      if (!res.ok) throw new Error(`season ${year} ${res.status}: ${opts.seasonUrl(year)}`);
      const data = (await res.json()) as SeasonData;
      seasonCache.set(year, data);
      notify();
      return data;
    } finally {
      seasonInflight.delete(year);
    }
  })();
  seasonInflight.set(year, p);
  return p;
}

// In-memory patch — Phase 10 런타임 재검증.
// useSyncExternalStore가 변화를 감지하려면 새 객체 reference여야 하므로
// 변경된 meetings/sessions만 새 배열로 교체 (나머지는 reference 유지).
// 매칭 session_key가 없으면 no-op + notify 안 함.
export function _patchSessions(year: number, fresh: Map<number, FreshSessionPatch>): void {
  const cached = seasonCache.get(year);
  if (!cached) return;

  let anyChange = false;
  const newMeetings = cached.meetings.map((meeting) => {
    let meetingChanged = false;
    const newSessions = meeting.sessions.map((session) => {
      const patch = fresh.get(session.session_key);
      if (!patch) return session;
      const updated = { ...session };
      let sessionChanged = false;
      if (patch.date_start !== undefined && patch.date_start !== session.date_start) {
        updated.date_start = patch.date_start;
        sessionChanged = true;
      }
      if (patch.date_end !== undefined && patch.date_end !== session.date_end) {
        updated.date_end = patch.date_end;
        sessionChanged = true;
      }
      // is_cancelled는 false ↔ undefined 동치 정규화 후 비교 (diffSessions와 대칭).
      if (
        patch.is_cancelled !== undefined &&
        normalizeCancelled(patch.is_cancelled) !== normalizeCancelled(session.is_cancelled)
      ) {
        updated.is_cancelled = patch.is_cancelled;
        sessionChanged = true;
      }
      if (sessionChanged) {
        meetingChanged = true;
        return updated;
      }
      return session;
    });
    if (!meetingChanged) return meeting;
    anyChange = true;
    return { ...meeting, sessions: newSessions };
  });

  if (!anyChange) return;
  seasonCache.set(year, { ...cached, meetings: newMeetings });
  notify();
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  allSeasonsDirty = true;
  for (const l of listeners) l();
}

export function _resetCatalogStore(): void {
  cachedIndex = null;
  indexInflight = null;
  seasonCache.clear();
  seasonInflight.clear();
  listeners.clear();
  cachedAllSeasons = [];
  allSeasonsDirty = false;
  opts = makeDefaultOpts();
}
