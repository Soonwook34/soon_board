import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _patchSessions,
  _resetCatalogStore,
  configureCatalogStore,
  getCatalogIndex,
  getSeason,
  loadCatalogIndex,
  loadSeason,
  subscribeCatalog,
} from '../catalogStore';
import type { SeasonData, SeasonsIndex } from '../../../shared/seasonData';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAMPLE_INDEX: SeasonsIndex = {
  generated_at: '2026-05-22T07:47:33Z',
  seasons: [{ year: 2024, generated_at: '2026-05-22T07:26:20Z', source: 'openf1.org/v1' }],
};
const SAMPLE_SEASON_2024: SeasonData = {
  year: 2024,
  generated_at: '2026-05-22T07:26:20Z',
  source: 'openf1.org/v1',
  meetings: [{ meeting_key: 1, meeting_name: 'GP1', sessions: [] }],
};
const SAMPLE_SEASON_2023: SeasonData = { ...SAMPLE_SEASON_2024, year: 2023 };

afterEach(() => {
  _resetCatalogStore();
});

describe('catalogStore', () => {
  it('loadCatalogIndex caches the response (second call returns from cache, no second fetch)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });

    const first = await loadCatalogIndex();
    const second = await loadCatalogIndex();
    expect(first).toBe(second);
    expect(getCatalogIndex()).toEqual(SAMPLE_INDEX);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('loadCatalogIndex dedupes concurrent in-flight calls', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((res) => {
          resolveFetch = res;
        }),
    );
    configureCatalogStore({ fetchImpl });

    const p1 = loadCatalogIndex();
    const p2 = loadCatalogIndex();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(SAMPLE_INDEX));
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(b);
  });

  it('loadSeason is year-keyed: different years issue separate fetches, same year dedupes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/seasons/2024.json')) return jsonResponse(SAMPLE_SEASON_2024);
      if (url.endsWith('/seasons/2023.json')) return jsonResponse(SAMPLE_SEASON_2023);
      return new Response('not found', { status: 404 });
    });
    configureCatalogStore({ fetchImpl });

    const a2024 = await loadSeason(2024);
    const a2024Again = await loadSeason(2024);
    const a2023 = await loadSeason(2023);

    expect(a2024).toBe(a2024Again);
    expect(a2023.year).toBe(2023);
    expect(getSeason(2024)).toEqual(SAMPLE_SEASON_2024);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 2024 once, 2023 once
  });

  it('fetch failure does not poison the cache and rejects', async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => {
      attempts++;
      if (attempts === 1) return new Response('boom', { status: 503 });
      return jsonResponse(SAMPLE_INDEX);
    });
    configureCatalogStore({ fetchImpl });

    await expect(loadCatalogIndex()).rejects.toThrow(/503/);
    expect(getCatalogIndex()).toBeNull();
    // After failure, retry succeeds (in-flight cleared)
    const second = await loadCatalogIndex();
    expect(second).toEqual(SAMPLE_INDEX);
  });

  it('subscribe is called after each successful load and on _reset', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });
    const listener = vi.fn();
    subscribeCatalog(listener);

    await loadCatalogIndex();
    expect(listener).toHaveBeenCalledTimes(1);

    const fetchImpl2 = vi.fn(async () => jsonResponse(SAMPLE_SEASON_2024));
    configureCatalogStore({ fetchImpl: fetchImpl2 });
    await loadSeason(2024);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further notifications', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });
    const listener = vi.fn();
    const off = subscribeCatalog(listener);
    off();

    await loadCatalogIndex();
    expect(listener).not.toHaveBeenCalled();
  });

  it('throws when fetch returns non-OK status', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    configureCatalogStore({ fetchImpl });
    await expect(loadCatalogIndex()).rejects.toThrow(/404/);
    await expect(loadSeason(2024)).rejects.toThrow(/404/);
  });

  it('_patchSessions: matching session_keys produce new object refs and notify; no-op otherwise', async () => {
    const seasonWithSession: SeasonData = {
      year: 2026,
      generated_at: '2026-01-01T00:00:00Z',
      source: 'openf1.org/v1',
      meetings: [
        {
          meeting_key: 1,
          meeting_name: 'AUS',
          sessions: [
            {
              session_key: 9472,
              session_name: 'Race',
              session_type: 'Race',
              date_start: '2026-03-15T05:00:00Z',
              date_end: '2026-03-15T07:00:00Z',
            },
          ],
        },
      ],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(seasonWithSession));
    configureCatalogStore({ fetchImpl, seasonUrl: () => '/seasons/2026.json' });
    await loadSeason(2026);
    const before = getSeason(2026)!;
    const listener = vi.fn();
    subscribeCatalog(listener);

    // No-op patch (no matching key) — no notify, same ref
    _patchSessions(2026, new Map([[9999, { date_start: '2026-04-01T00:00:00Z' }]]));
    expect(listener).not.toHaveBeenCalled();
    expect(getSeason(2026)).toBe(before);

    // Real patch — new ref, notify fired
    _patchSessions(2026, new Map([[9472, { date_start: '2026-03-15T06:00:00Z', is_cancelled: true }]]));
    expect(listener).toHaveBeenCalledTimes(1);
    const after = getSeason(2026)!;
    expect(after).not.toBe(before);
    expect(after.meetings[0]).not.toBe(before.meetings[0]); // changed meeting got new ref
    expect(after.meetings[0].sessions[0].date_start).toBe('2026-03-15T06:00:00Z');
    expect(after.meetings[0].sessions[0].is_cancelled).toBe(true);
    // Untouched fields preserved
    expect(after.meetings[0].sessions[0].date_end).toBe('2026-03-15T07:00:00Z');
  });

  it('_patchSessions: no-op when year has no cached season', () => {
    const listener = vi.fn();
    subscribeCatalog(listener);
    expect(() => _patchSessions(2099, new Map([[1, { date_start: 'x' }]]))).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('_patchSessions: is_cancelled false ↔ undefined treated as no-change (symmetry with diffSessions)', async () => {
    const seasonNoCancelFlag: SeasonData = {
      year: 2026,
      generated_at: '2026-01-01T00:00:00Z',
      source: 'openf1.org/v1',
      meetings: [
        {
          meeting_key: 1,
          meeting_name: 'AUS',
          sessions: [
            {
              session_key: 9472,
              session_name: 'Race',
              session_type: 'Race',
              date_start: '2026-03-15T05:00:00Z',
              date_end: '2026-03-15T07:00:00Z',
              // is_cancelled undefined
            },
          ],
        },
      ],
    };
    const fetchImpl = vi.fn(async () => jsonResponse(seasonNoCancelFlag));
    configureCatalogStore({ fetchImpl, seasonUrl: () => '/seasons/2026.json' });
    await loadSeason(2026);
    const before = getSeason(2026)!;
    const listener = vi.fn();
    subscribeCatalog(listener);

    _patchSessions(2026, new Map([[9472, { is_cancelled: false }]]));
    expect(listener).not.toHaveBeenCalled();
    expect(getSeason(2026)).toBe(before);
  });
});
