/// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { LiveScreen } from '../LiveScreen';
import { _resetCatalogStore, configureCatalogStore } from '../../main/stores/catalogStore';

afterEach(() => {
  cleanup();
  _resetCatalogStore();
  vi.restoreAllMocks();
});

function renderAtLive(pingImpl: () => Promise<boolean>) {
  const { hook } = memoryLocation({ path: '/live/9472', record: true });
  return render(
    <Router hook={hook}>
      <Route path="/live/:key">{(params) => <LiveScreen pingImpl={pingImpl} key={params.key} />}</Route>
    </Router>,
  );
}

describe('LiveScreen — CORS gate (critic P0-4)', () => {
  it('renders CorsFailedNotice when pingImpl resolves false', async () => {
    const pingImpl = vi.fn(async () => false);
    renderAtLive(pingImpl);
    await waitFor(() => expect(pingImpl).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('cors-failed-notice')).toBeTruthy();
  });

  it('does NOT mount countdown overlay or live-map when ping fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pingImpl = vi.fn(async () => false);
    renderAtLive(pingImpl);
    await screen.findByTestId('cors-failed-notice');
    // CountdownOverlay renders a role="dialog" — must not be in DOM
    expect(screen.queryByRole('dialog')).toBeNull();
    // No "Loading session…" leak past CORS gate
    expect(screen.queryByText(/Loading session/)).toBeNull();
  });

  it('re-invokes pingImpl when user clicks retry button', async () => {
    let callCount = 0;
    const pingImpl = vi.fn(async () => {
      callCount += 1;
      return false;
    });
    renderAtLive(pingImpl);
    await screen.findByTestId('cors-failed-notice');
    expect(callCount).toBe(1);
    await act(async () => {
      fireEvent.click(screen.getByText('다시 시도'));
    });
    await waitFor(() => expect(callCount).toBe(2));
  });
});

describe('LiveScreen — status==="live" + circuit_key → LiveMap 마운트', () => {
  beforeEach(() => {
    // JSDOM canvas stub — LiveMap 의 renderer 마운트 effect 가 getContext 통과하도록.
    const stub = new Proxy({}, { get: () => () => {}, set: () => true });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      stub as unknown as CanvasRenderingContext2D,
    );
  });

  it('status==="live" + startedAgoMs>=0 + meeting.circuit_key 있음 → LiveMap canvas 마운트', async () => {
    const currentYear = new Date().getFullYear();
    const nowMs = Date.now();
    // session 이 "live now" 가 되도록 date_start 는 5분 전, date_end 는 60분 후.
    const seasonData = {
      year: currentYear,
      generated_at: new Date().toISOString(),
      source: 'OpenF1 sessions',
      meetings: [
        {
          meeting_key: 1234,
          meeting_name: 'Bahrain GP',
          circuit_key: 63,
          sessions: [
            {
              session_key: 9472,
              session_name: 'Race',
              session_type: 'Race',
              date_start: new Date(nowMs - 5 * 60_000).toISOString(),
              date_end: new Date(nowMs + 60 * 60_000).toISOString(),
            },
          ],
        },
      ],
    };
    const indexJson = {
      generated_at: new Date().toISOString(),
      source: 'OpenF1 sessions',
      seasons: [{ year: currentYear, generated_at: new Date().toISOString(), source: 'OpenF1 sessions' }],
    };

    // 본 통합 테스트는 두 개의 별도 fetch mock surface 를 유지한다:
    //   (1) configureCatalogStore.fetchImpl — catalogStore 의 시즌 index/season JSON fetch
    //   (2) vi.spyOn(globalThis, 'fetch') — LiveMap 내부 fetch (trackOutlines + pitlane + drivers)
    // 두 surface 는 의도적으로 분리됨 — catalogStore 는 configureCatalogStore 로만 주입 가능하고,
    // LiveMap 은 prop 없이 마운트 시 globalThis.fetch 를 사용한다.
    // LiveMap 에 fetchImpl 을 prop 으로 통과시키는 새 경로가 추가되면 본 mock 패턴 재검토 필요.
    configureCatalogStore({
      fetchImpl: vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('index.json')) {
          return new Response(JSON.stringify(indexJson), { status: 200 });
        }
        return new Response(JSON.stringify(seasonData), { status: 200 });
      }) as unknown as typeof fetch,
    });

    // surface (2): LiveMap 내부 fetch 모두 globalThis.fetch 사용 — Track + pitlane + drivers.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/trackOutlines/63-')) {
        return new Response(
          JSON.stringify({
            circuit_key: 63,
            year: currentYear,
            circuit_short_name: 'Sakhir',
            country_name: 'Bahrain',
            source: 'julesr0y/f1-circuits-svg',
            source_file: 'bahrain-1.svg',
            license: 'CC-BY-4.0',
            viewBox: [0, 0, 500, 500],
            polyline: [[0, 0], [500, 0], [500, 500], [0, 500], [0, 0]],
            arc_length_table: [0, 500, 1000, 1500, 2000],
            total_length: 2000,
            start_finish_index: 0,
            direction: 'clockwise',
            generated_at: new Date().toISOString(),
            openf1_transform: { scale: 1, rotation_deg: 0, translate: [0, 0], reflection: false },
          }),
          { status: 200 },
        );
      }
      if (url.includes('pitlane_63-')) {
        return new Response('', { status: 404 });
      }
      if (url.includes('/v1/drivers')) {
        return new Response(JSON.stringify([{ driver_number: 44, name_acronym: 'HAM', team_colour: '27f4d2' }]), { status: 200 });
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    });

    const pingImpl = vi.fn(async () => true);
    renderAtLive(pingImpl);

    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy(), { timeout: 3000 });
  });
});
