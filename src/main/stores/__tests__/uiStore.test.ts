import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _resetUiStore,
  ALL_SESSION_TYPES,
  ALL_STATUSES,
  DEFAULT_STATUSES,
  configureUiStore,
  defaultUiState,
  getUiState,
  initUiStore,
  parseSearchParams,
  resetFilters,
  setExpandedGp,
  setSearch,
  setSeason,
  stringifyUiState,
  subscribeUi,
  toggleSessionType,
  toggleStatus,
  type UiState,
} from '../uiStore';

function ui(state: Partial<UiState>): UiState {
  return { ...defaultUiState(), ...state };
}

afterEach(() => {
  _resetUiStore();
});

describe('parseSearchParams', () => {
  it('returns default state for empty query', () => {
    const d = parseSearchParams('');
    expect(d.season).toBeNull();
    expect(d.expandedGp).toBeNull();
    expect(d.search).toBe('');
    expect(d.sessionTypes).toEqual(new Set(ALL_SESSION_TYPES));
    expect(d.statuses).toEqual(new Set(DEFAULT_STATUSES));
  });

  it('parses season and gp', () => {
    const s = parseSearchParams('?season=2024&gp=1229');
    expect(s.season).toBe(2024);
    expect(s.expandedGp).toBe(1229);
  });

  it('parses q', () => {
    expect(parseSearchParams('?q=monaco').search).toBe('monaco');
  });

  it('parses session filter list (lowercases, drops unknown)', () => {
    const s = parseSearchParams('?session=Race,Qualifying,hello');
    expect(s.sessionTypes).toEqual(new Set(['race', 'qualifying']));
  });

  it('parses status filter list including cancelled', () => {
    const s = parseSearchParams('?status=upcoming,live,cancelled');
    expect(s.statuses).toEqual(new Set(['upcoming', 'live', 'cancelled']));
  });

  it('ignores malformed numeric params', () => {
    const s = parseSearchParams('?season=abc&gp=NaN');
    expect(s.season).toBeNull();
    expect(s.expandedGp).toBeNull();
  });

  it('empty session= or status= produces empty Set (explicit user clear)', () => {
    const s = parseSearchParams('?session=&status=');
    expect(s.sessionTypes).toEqual(new Set());
    expect(s.statuses).toEqual(new Set());
  });

  it('handles leading "?" or absence thereof', () => {
    expect(parseSearchParams('season=2024').season).toBe(2024);
    expect(parseSearchParams('?season=2024').season).toBe(2024);
  });
});

describe('stringifyUiState', () => {
  it('returns empty string for default state', () => {
    expect(stringifyUiState(defaultUiState())).toBe('');
  });

  it('serialises individual fields', () => {
    expect(stringifyUiState(ui({ season: 2024 }))).toBe('?season=2024');
    expect(stringifyUiState(ui({ expandedGp: 1229 }))).toBe('?gp=1229');
    expect(stringifyUiState(ui({ search: 'monaco' }))).toBe('?q=monaco');
  });

  it('omits filter params when they match the defaults', () => {
    const s = ui({ sessionTypes: new Set(ALL_SESSION_TYPES), statuses: new Set(DEFAULT_STATUSES) });
    expect(stringifyUiState(s)).toBe('');
  });

  it('serialises a partial filter selection', () => {
    const s = ui({ sessionTypes: new Set(['race', 'qualifying']) });
    const q = stringifyUiState(s);
    expect(q).toContain('session=race%2Cqualifying');
  });

  it('serialises status filter when cancelled is added', () => {
    const s = ui({ statuses: new Set([...DEFAULT_STATUSES, 'cancelled' as const]) });
    const q = stringifyUiState(s);
    expect(q).toContain('status=past%2Clive%2Cupcoming%2Ccancelled');
  });
});

describe('parse/stringify round-trip', () => {
  it('default round-trips to default', () => {
    expect(parseSearchParams(stringifyUiState(defaultUiState()))).toEqual(defaultUiState());
  });

  it('full state round-trips identically', () => {
    const s: UiState = {
      season: 2024,
      expandedGp: 1229,
      search: 'monaco',
      sessionTypes: new Set(['race', 'qualifying']),
      statuses: new Set(['past', 'cancelled']),
    };
    expect(parseSearchParams(stringifyUiState(s))).toEqual(s);
  });

  it('handles unicode in q', () => {
    const s = ui({ search: '한국 GP' });
    expect(parseSearchParams(stringifyUiState(s)).search).toBe('한국 GP');
  });
});

describe('store actions', () => {
  let lastSearch = '';
  let popHandler: (() => void) | null = null;

  beforeEach(() => {
    lastSearch = '';
    popHandler = null;
    configureUiStore({
      readSearch: () => lastSearch,
      writeSearch: (s) => {
        lastSearch = s;
      },
      onPopState: (h) => {
        popHandler = h;
        return () => {
          popHandler = null;
        };
      },
    });
    initUiStore();
  });

  it('initUiStore reads initial state from URL', () => {
    _resetUiStore();
    lastSearch = '?season=2024&gp=1229';
    configureUiStore({
      readSearch: () => lastSearch,
      writeSearch: (s) => {
        lastSearch = s;
      },
      onPopState: () => () => {},
    });
    initUiStore();
    expect(getUiState().season).toBe(2024);
    expect(getUiState().expandedGp).toBe(1229);
  });

  it('setSeason updates state and URL', () => {
    setSeason(2024);
    expect(getUiState().season).toBe(2024);
    expect(lastSearch).toBe('?season=2024');
  });

  it('setExpandedGp / setSearch update URL', () => {
    setExpandedGp(1229);
    expect(lastSearch).toContain('gp=1229');
    setSearch('monaco');
    expect(lastSearch).toContain('q=monaco');
  });

  it('toggleSessionType flips membership', () => {
    toggleSessionType('race'); // remove (default has all)
    expect(getUiState().sessionTypes.has('race')).toBe(false);
    toggleSessionType('race'); // add back
    expect(getUiState().sessionTypes.has('race')).toBe(true);
  });

  it('toggleStatus flips membership', () => {
    toggleStatus('cancelled');
    expect(getUiState().statuses.has('cancelled')).toBe(true);
    toggleStatus('cancelled');
    expect(getUiState().statuses.has('cancelled')).toBe(false);
  });

  it('resetFilters keeps season + expandedGp, clears search and filter sets', () => {
    setSeason(2024);
    setExpandedGp(1229);
    setSearch('monaco');
    toggleStatus('cancelled');
    resetFilters();
    const s = getUiState();
    expect(s.season).toBe(2024);
    expect(s.expandedGp).toBe(1229);
    expect(s.search).toBe('');
    expect(s.statuses).toEqual(new Set(DEFAULT_STATUSES));
  });

  it('subscribe is called on every mutation', () => {
    const listener = vi.fn();
    subscribeUi(listener);
    setSeason(2024);
    setSearch('m');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('popstate handler re-syncs state from URL', () => {
    setSeason(2024);
    expect(getUiState().season).toBe(2024);
    // External URL change (browser back)
    lastSearch = '?season=2023';
    expect(popHandler).not.toBeNull();
    popHandler!();
    expect(getUiState().season).toBe(2023);
  });

  it('ALL_STATUSES contains the canonical 4 entries', () => {
    expect(new Set(ALL_STATUSES)).toEqual(new Set(['past', 'live', 'upcoming', 'cancelled']));
  });
});
