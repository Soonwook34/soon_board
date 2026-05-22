// UI 상태 스토어 — plan main-page-implementation.md §6 (URL 보존), §7 (검색·필터), §9 (라우팅), §12 단계 3.
// 쿼리 형식:
//   ?season=YYYY      현재 선택된 시즌
//   ?gp=NNNNN         펼쳐진 GP(meeting_key)
//   ?q=text           검색어
//   ?session=race,qualifying,sprint,sprint_qualifying,practice
//   ?status=past,live,upcoming,cancelled
//
// 본 모듈은 wouter의 path 라우팅 외부에서 query만 다룬다 — wouter는 `/`, `/live/:key`,
// `/replay/:key` path 매칭만 담당.

export type SessionTypeFilter = 'race' | 'qualifying' | 'sprint' | 'sprint_qualifying' | 'practice';
export type StatusFilter = 'past' | 'live' | 'upcoming' | 'cancelled';

export const ALL_SESSION_TYPES: readonly SessionTypeFilter[] = [
  'race',
  'qualifying',
  'sprint',
  'sprint_qualifying',
  'practice',
];
export const ALL_STATUSES: readonly StatusFilter[] = ['past', 'live', 'upcoming', 'cancelled'];
export const DEFAULT_STATUSES: readonly StatusFilter[] = ['past', 'live', 'upcoming']; // cancelled OFF (plan §7.2)

export interface UiState {
  season: number | null;
  expandedGp: number | null;
  search: string;
  sessionTypes: ReadonlySet<SessionTypeFilter>;
  statuses: ReadonlySet<StatusFilter>;
}

export function defaultUiState(): UiState {
  return {
    season: null,
    expandedGp: null,
    search: '',
    sessionTypes: new Set(ALL_SESSION_TYPES),
    statuses: new Set(DEFAULT_STATUSES),
  };
}

// ─── Pure parse / stringify (unit-testable) ─────────────────────────────

const SESSION_TYPE_SET = new Set<string>(ALL_SESSION_TYPES);
const STATUS_SET = new Set<string>(ALL_STATUSES);

export function parseSearchParams(search: string): UiState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const state = defaultUiState();

  const seasonStr = params.get('season');
  if (seasonStr && /^\d{4}$/.test(seasonStr)) {
    state.season = Number(seasonStr);
  }

  const gpStr = params.get('gp');
  if (gpStr && /^\d+$/.test(gpStr)) {
    state.expandedGp = Number(gpStr);
  }

  const q = params.get('q');
  if (q !== null) state.search = q;

  const sessionStr = params.get('session');
  if (sessionStr !== null) {
    const tokens = sessionStr
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => SESSION_TYPE_SET.has(t)) as SessionTypeFilter[];
    state.sessionTypes = new Set(tokens);
  }

  const statusStr = params.get('status');
  if (statusStr !== null) {
    const tokens = statusStr
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => STATUS_SET.has(t)) as StatusFilter[];
    state.statuses = new Set(tokens);
  }

  return state;
}

export function stringifyUiState(state: UiState): string {
  const params = new URLSearchParams();

  if (state.season !== null) params.set('season', String(state.season));
  if (state.expandedGp !== null) params.set('gp', String(state.expandedGp));
  if (state.search !== '') params.set('q', state.search);

  if (!setsEqual(state.sessionTypes, new Set(ALL_SESSION_TYPES))) {
    const tokens = ALL_SESSION_TYPES.filter((t) => state.sessionTypes.has(t));
    params.set('session', tokens.join(','));
  }
  if (!setsEqual(state.statuses, new Set(DEFAULT_STATUSES))) {
    const tokens = ALL_STATUSES.filter((s) => state.statuses.has(s));
    params.set('status', tokens.join(','));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function setsEqual<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// ─── Module-scoped store (browser + tests) ───────────────────────────────

let state: UiState = defaultUiState();
let initialised = false;
const listeners = new Set<() => void>();

export interface UiStoreEnv {
  /** 현재 URL search 문자열 읽기. 기본 window.location.search. */
  readSearch?: () => string;
  /** URL search 문자열 쓰기. 기본 window.history.replaceState. */
  writeSearch?: (search: string) => void;
  /** popstate 이벤트 등록. 기본 window.addEventListener. */
  onPopState?: (handler: () => void) => () => void;
}

let env: Required<UiStoreEnv> = makeBrowserEnv();

function makeBrowserEnv(): Required<UiStoreEnv> {
  return {
    readSearch: () => (typeof window !== 'undefined' ? window.location.search : ''),
    writeSearch: (search) => {
      if (typeof window === 'undefined') return;
      const url = `${window.location.pathname}${search}${window.location.hash}`;
      window.history.replaceState(window.history.state, '', url);
    },
    onPopState: (handler) => {
      if (typeof window === 'undefined') return () => {};
      window.addEventListener('popstate', handler);
      return () => window.removeEventListener('popstate', handler);
    },
  };
}

export function configureUiStore(custom: UiStoreEnv): void {
  env = { ...env, ...custom };
}

export function initUiStore(): void {
  if (initialised) return;
  initialised = true;
  state = parseSearchParams(env.readSearch());
  env.onPopState(() => {
    state = parseSearchParams(env.readSearch());
    notify();
  });
}

export function getUiState(): UiState {
  if (!initialised) initUiStore();
  return state;
}

function mutate(updater: (prev: UiState) => UiState): void {
  const next = updater(getUiState());
  if (next === state) return;
  state = next;
  env.writeSearch(stringifyUiState(next));
  notify();
}

export function setSeason(year: number | null): void {
  mutate((prev) => ({ ...prev, season: year }));
}

export function setExpandedGp(meetingKey: number | null): void {
  mutate((prev) => ({ ...prev, expandedGp: meetingKey }));
}

export function setSearch(text: string): void {
  mutate((prev) => ({ ...prev, search: text }));
}

export function toggleSessionType(type: SessionTypeFilter): void {
  mutate((prev) => {
    const next = new Set(prev.sessionTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    return { ...prev, sessionTypes: next };
  });
}

export function toggleStatus(status: StatusFilter): void {
  mutate((prev) => {
    const next = new Set(prev.statuses);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    return { ...prev, statuses: next };
  });
}

export function resetFilters(): void {
  mutate(() => {
    const d = defaultUiState();
    return { ...d, season: state.season, expandedGp: state.expandedGp };
  });
}

export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const l of listeners) l();
}

export function _resetUiStore(): void {
  state = defaultUiState();
  initialised = false;
  listeners.clear();
  env = makeBrowserEnv();
}
