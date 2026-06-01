/// @vitest-environment jsdom
// US-5A — 드라이버 메타 컨텍스트 + 1회 fetch 훅.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { DriversProvider, teamColorOf, useDrivers, useSessionDrivers } from '../DriversContext';
import { createMockOpenF1Client } from '../../../shared/__tests__/createMockOpenF1Client';
import type { DriverRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

function mkDriver(n: number, acr: string, colour: string): DriverRecord {
  return {
    driver_number: n,
    session_key: 1,
    meeting_key: 1,
    broadcast_name: acr,
    full_name: acr,
    name_acronym: acr,
    team_name: 'Team',
    team_colour: colour,
    first_name: 'a',
    last_name: 'b',
    headshot_url: null,
    country_code: null,
  };
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('useDrivers / DriversProvider', () => {
  it('provider 없으면 빈 Map (graceful, throw 없음)', () => {
    const { result } = renderHook(() => useDrivers());
    expect(result.current.size).toBe(0);
  });

  it('DriversProvider 가 주입한 map 전달', () => {
    const map = new Map([[44, mkDriver(44, 'HAM', '27f4d2')]]);
    const { result } = renderHook(() => useDrivers(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <DriversProvider drivers={map}>{children}</DriversProvider>
      ),
    });
    expect(result.current.get(44)?.name_acronym).toBe('HAM');
  });
});

describe('teamColorOf', () => {
  it("'#' 없는 hex 에 prefix", () => {
    expect(teamColorOf(mkDriver(44, 'HAM', '27f4d2'))).toBe('#27f4d2');
  });
  it('undefined → 중립 회색', () => {
    expect(teamColorOf(undefined)).toBe('#9ca3af');
  });
  it("이미 '#' 있으면 중복 안 함", () => {
    expect(teamColorOf(mkDriver(44, 'HAM', '#abcdef'))).toBe('#abcdef');
  });
});

describe('useSessionDrivers', () => {
  it('fetch → Map<driver_number, DriverRecord>', async () => {
    const { client } = createMockOpenF1Client({
      '/v1/drivers': () => jsonOk([mkDriver(44, 'HAM', '27f4d2'), mkDriver(1, 'VER', '3671c6')]),
    });
    const { result } = renderHook(() => useSessionDrivers(9472, { client }));
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(44)?.name_acronym).toBe('HAM');
    expect(result.current.get(1)?.team_colour).toBe('3671c6');
  });

  it('enabled=false 면 fetch 안 함 (빈 Map)', () => {
    const { client, fetchMock } = createMockOpenF1Client({ '/v1/drivers': () => jsonOk([]) });
    const { result } = renderHook(() => useSessionDrivers(9472, { client, enabled: false }));
    expect(result.current.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetch 실패(500) 시 빈 Map (graceful)', async () => {
    const { client } = createMockOpenF1Client(
      { '/v1/drivers': () => new Response('', { status: 500 }) },
      { maxRetries: 0 },
    );
    const { result } = renderHook(() => useSessionDrivers(9472, { client }));
    await new Promise((r) => setTimeout(r, 30));
    expect(result.current.size).toBe(0);
  });
});
