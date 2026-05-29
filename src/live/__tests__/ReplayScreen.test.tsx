/// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { ReplayScreen } from '../ReplayScreen';
import { _resetCatalogStore, configureCatalogStore } from '../../main/stores/catalogStore';
import { findSessionAcrossSeasons, findSessionByKey } from '../findSessionByKey';
import type { SeasonData, SeasonsIndex } from '../../shared/seasonData';

const INDEX: SeasonsIndex = {
  generated_at: '2026-01-01T00:00:00Z',
  seasons: [
    { year: 2023, generated_at: '2023-12-01T00:00:00Z', source: 'openf1.org/v1' },
    { year: 2024, generated_at: '2024-12-01T00:00:00Z', source: 'openf1.org/v1' },
    { year: 2025, generated_at: '2025-12-01T00:00:00Z', source: 'openf1.org/v1' },
    { year: 2026, generated_at: '2026-05-01T00:00:00Z', source: 'openf1.org/v1' },
  ],
};

function mkSeason(year: number, sessionKey: number, dateStart: string, dateEnd: string): SeasonData {
  return {
    year,
    generated_at: `${year}-12-01T00:00:00Z`,
    source: 'openf1.org/v1',
    meetings: [
      {
        meeting_key: 1,
        meeting_name: `${year} Test GP`,
        circuit_key: 9,
        sessions: [
          {
            session_key: sessionKey,
            session_name: 'Race',
            session_type: 'Race',
            date_start: dateStart,
            date_end: dateEnd,
          },
        ],
      },
    ],
  };
}

const SEASONS: Record<number, SeasonData> = {
  2023: mkSeason(2023, 9472, '2023-07-09T13:00:00Z', '2023-07-09T15:00:00Z'),
  2024: mkSeason(2024, 9540, '2024-07-07T13:00:00Z', '2024-07-07T15:00:00Z'),
  2025: mkSeason(2025, 9700, '2025-07-06T13:00:00Z', '2025-07-06T15:00:00Z'),
  2026: mkSeason(2026, 11500, '2026-07-05T13:00:00Z', '2026-07-05T15:00:00Z'),
};

function makeFetchImpl() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/seasons/index.json')) {
      return new Response(JSON.stringify(INDEX), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const m = url.match(/\/seasons\/(\d{4})\.json$/);
    if (m) {
      const y = Number(m[1]);
      const data = SEASONS[y];
      if (!data) return new Response('not found', { status: 404 });
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // 트랙/LiveMap fetch 는 본 테스트 범위 밖 — LiveMap 이 "Loading track…" 으로 머무는 게 정상.
    return new Response('not found', { status: 404 });
  });
}

beforeEach(() => {
  configureCatalogStore({ fetchImpl: makeFetchImpl() as unknown as typeof fetch });
});

afterEach(() => {
  cleanup();
  _resetCatalogStore();
  vi.restoreAllMocks();
});

describe('ReplayScreen — CORS gate (critic P0-4)', () => {
  it('renders CorsFailedNotice and does NOT mount dashboard placeholder when ping fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => false);
    const { hook } = memoryLocation({ path: '/replay/9472', record: true });
    render(
      <Router hook={hook}>
        <Route path="/replay/:key">{() => <ReplayScreen pingImpl={pingImpl} />}</Route>
      </Router>,
    );
    await waitFor(() => expect(pingImpl).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('cors-failed-notice')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-placeholder')).toBeNull();
  });
});

describe('findSessionAcrossSeasons (multi-year search helper)', () => {
  it('finds a session in a non-current year and returns the year', () => {
    const out = findSessionAcrossSeasons(Object.values(SEASONS), 9472);
    expect(out).not.toBeNull();
    expect(out!.year).toBe(2023);
    expect(out!.session.session_key).toBe(9472);
    expect(out!.meeting.meeting_name).toBe('2023 Test GP');
  });

  it('returns null when session_key matches no season', () => {
    expect(findSessionAcrossSeasons(Object.values(SEASONS), 12345)).toBeNull();
  });

  it('returns null on empty seasons array', () => {
    expect(findSessionAcrossSeasons([], 9472)).toBeNull();
  });

  it('agrees with findSessionByKey for in-season lookups', () => {
    const single = findSessionByKey(SEASONS[2024], 9540);
    const multi = findSessionAcrossSeasons([SEASONS[2024]], 9540);
    expect(multi).not.toBeNull();
    expect(multi!.session.session_key).toBe(single!.session.session_key);
    expect(multi!.year).toBe(2024);
  });
});

describe('ReplayScreen — multi-year session resolution', () => {
  it('mounts LiveMap (not "Session not found") for a 2023 session even though currentYear=2026', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => true);
    const { hook } = memoryLocation({ path: '/replay/9472', record: true });
    render(
      <Router hook={hook}>
        <Route path="/replay/:key">{() => <ReplayScreen pingImpl={pingImpl} />}</Route>
      </Router>,
    );
    // ping ok → 인덱스 + 모든 시즌 로드 → 9472 가 2023 시즌에서 발견 → LiveMap 마운트
    // (LiveMap 의 trackOutlines fetch 는 mock 에서 404 → "Loading track…" 또는 error 표시).
    const screenEl = await screen.findByTestId('replay-screen', undefined, { timeout: 3000 });
    expect(screenEl).toBeTruthy();
    expect(screen.queryByText(/Session not found/i)).toBeNull();
  });

  it('shows "Session not found" only after all seasons load and key still missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => true);
    const { hook } = memoryLocation({ path: '/replay/77777', record: true });
    render(
      <Router hook={hook}>
        <Route path="/replay/:key">{() => <ReplayScreen pingImpl={pingImpl} />}</Route>
      </Router>,
    );
    await waitFor(
      () => expect(screen.queryByText(/Session not found/i)).toBeTruthy(),
      { timeout: 3000 },
    );
  });
});
