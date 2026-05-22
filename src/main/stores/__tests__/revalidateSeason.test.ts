import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetCatalogStore, configureCatalogStore, getSeason, loadSeason } from '../catalogStore';
import { revalidateCurrentSeason } from '../revalidateSeason';
import type { SeasonData } from '../../../shared/seasonData';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAMPLE: SeasonData = {
  year: 2026,
  generated_at: '2026-01-01T00:00:00Z',
  source: 'openf1.org/v1',
  meetings: [
    {
      meeting_key: 1,
      meeting_name: 'Australian GP',
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

async function primeSeasonCache(): Promise<void> {
  const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE));
  configureCatalogStore({ fetchImpl, seasonUrl: () => '/seasons/2026.json' });
  await loadSeason(2026);
}

afterEach(() => {
  _resetCatalogStore();
  vi.restoreAllMocks();
});

describe('revalidateCurrentSeason', () => {
  it('returns [] immediately when no cached season exists (no fetch)', async () => {
    const fetchImpl = vi.fn();
    const result = await revalidateCurrentSeason(2026, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns [] when fresh data matches cached (no patch)', async () => {
    await primeSeasonCache();
    const seenUrls: string[] = [];
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      seenUrls.push(String(url));
      return jsonResponse([
        { session_key: 9472, date_start: '2026-03-15T05:00:00Z', date_end: '2026-03-15T07:00:00Z' },
      ]);
    });
    const result = await revalidateCurrentSeason(2026, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      openf1Url: (y) => `https://example/sessions?year=${y}`,
    });
    expect(result).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(seenUrls[0]).toBe('https://example/sessions?year=2026');
    // cached object reference unchanged (no patch)
    expect(getSeason(2026)).toBeTruthy();
    expect(getSeason(2026)!.meetings[0].sessions[0].date_start).toBe('2026-03-15T05:00:00Z');
  });

  it('patches cached season and returns change list when fresh differs', async () => {
    await primeSeasonCache();
    const before = getSeason(2026)!;
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { session_key: 9472, date_start: '2026-03-15T06:00:00Z', is_cancelled: true },
      ]),
    );
    const result = await revalidateCurrentSeason(2026, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.field).sort()).toEqual(['date_start', 'is_cancelled']);
    const after = getSeason(2026)!;
    expect(after).not.toBe(before); // new object reference (useSyncExternalStore rerender trigger)
    expect(after.meetings[0].sessions[0].date_start).toBe('2026-03-15T06:00:00Z');
    expect(after.meetings[0].sessions[0].is_cancelled).toBe(true);
  });

  it('returns [] silently on fetch rejection (no throw, no patch)', async () => {
    await primeSeasonCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down');
    });
    const result = await revalidateCurrentSeason(2026, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns [] silently when fetch aborts due to timeout', async () => {
    await primeSeasonCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // never-resolving fetch that respects abort signal
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const result = await revalidateCurrentSeason(2026, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns [] silently on non-2xx response', async () => {
    await primeSeasonCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    const result = await revalidateCurrentSeason(2026, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});
