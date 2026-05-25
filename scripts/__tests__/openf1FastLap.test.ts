// scripts/_lib/openf1FastLap.ts 단위 테스트 — fetchImpl mock 으로 3-step 흐름 검증.

import { describe, expect, it } from 'vitest';
import { OpenF1Client } from '../_lib/openf1Client.js';
import {
  fetchFastLapLocations,
  isValidRegularLap,
  parseAndFilterLocations,
  pickPreferredSession,
} from '../_lib/openf1FastLap.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface MockEntry {
  match: (url: string) => boolean;
  body: unknown;
}

function makeMockClient(routes: MockEntry[]): { client: OpenF1Client; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: typeof fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    const hit = routes.find((r) => r.match(u));
    if (!hit) throw new Error(`Mock: no route for ${u}`);
    return jsonResponse(hit.body);
  };
  const client = new OpenF1Client({
    baseUrl: 'https://x',
    sleep: async () => {},
    fetchImpl,
    random: () => 0,
  });
  return { client, calls };
}

describe('pickPreferredSession', () => {
  it('picks Race first when both present', () => {
    const s = pickPreferredSession(
      [
        { session_type: 'Practice' },
        { session_type: 'Qualifying' },
        { session_type: 'Race' },
      ],
      ['Race', 'Qualifying'],
    );
    expect(s?.session_type).toBe('Race');
  });
  it('falls back to Qualifying when no Race', () => {
    const s = pickPreferredSession(
      [{ session_type: 'Practice' }, { session_type: 'Qualifying' }],
      ['Race', 'Qualifying'],
    );
    expect(s?.session_type).toBe('Qualifying');
  });
  it('returns undefined when none match preferred', () => {
    expect(
      pickPreferredSession([{ session_type: 'Practice' }], ['Race', 'Qualifying']),
    ).toBeUndefined();
  });
});

describe('isValidRegularLap', () => {
  const base = {
    session_key: 1,
    driver_number: 1,
    lap_number: 1,
    date_start: '2024-03-02T15:00:00.000Z',
  };
  it('accepts finite positive duration without pit_out', () => {
    expect(isValidRegularLap({ ...base, lap_duration: 89.123 })).toBe(true);
  });
  it('rejects pit_out lap', () => {
    expect(
      isValidRegularLap({ ...base, lap_duration: 89.123, is_pit_out_lap: true }),
    ).toBe(false);
  });
  it('rejects null/zero/negative duration', () => {
    expect(isValidRegularLap({ ...base, lap_duration: null })).toBe(false);
    expect(isValidRegularLap({ ...base, lap_duration: 0 })).toBe(false);
    expect(isValidRegularLap({ ...base, lap_duration: -1 })).toBe(false);
  });
  it('rejects missing date_start', () => {
    expect(isValidRegularLap({ ...base, lap_duration: 89, date_start: null })).toBe(false);
  });
});

describe('parseAndFilterLocations', () => {
  it('filters out sentinel (0,0,0) and near-sentinel points', () => {
    const out = parseAndFilterLocations(
      [
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:00Z', x: 0, y: 0, z: 0 },
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:01Z', x: 10, y: 10, z: 5 },
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:02Z', x: 1000, y: -500, z: 0 },
      ],
      50,
    );
    // (0,0,0): |0|+|0|+|0|=0 < 50 → drop. (10,10,5): 25 < 50 → drop. (1000,500,0): 1500 → keep
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(1000);
    expect(out[0].date).toBeInstanceOf(Date);
  });

  it('sorts samples by date ascending', () => {
    const out = parseAndFilterLocations(
      [
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:02Z', x: 100, y: 0, z: 0 },
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:00Z', x: 200, y: 0, z: 0 },
        { session_key: 1, driver_number: 1, date: '2024-01-01T00:00:01Z', x: 300, y: 0, z: 0 },
      ],
      50,
    );
    expect(out.map((s) => s.x)).toEqual([200, 300, 100]);
  });

  it('drops samples with invalid date', () => {
    const out = parseAndFilterLocations(
      [
        { session_key: 1, driver_number: 1, date: 'not-a-date', x: 1000, y: 0, z: 0 },
      ],
      50,
    );
    expect(out).toHaveLength(0);
  });
});

describe('fetchFastLapLocations (integration)', () => {
  const SESSIONS = [
    {
      session_key: 9472,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-03-02T15:00:00.000Z',
      date_end: '2024-03-02T17:00:00.000Z',
      year: 2024,
      circuit_key: 63,
    },
    {
      session_key: 9470,
      session_type: 'Qualifying',
      session_name: 'Qualifying',
      date_start: '2024-03-01T16:00:00.000Z',
      date_end: '2024-03-01T17:00:00.000Z',
      year: 2024,
      circuit_key: 63,
    },
  ];

  const LAPS_RACE = [
    {
      session_key: 9472,
      driver_number: 1,
      lap_number: 1,
      lap_duration: 95.5,
      is_pit_out_lap: true,
      date_start: '2024-03-02T15:00:00.000Z',
    },
    {
      session_key: 9472,
      driver_number: 1,
      lap_number: 12,
      lap_duration: 89.123,
      is_pit_out_lap: false,
      date_start: '2024-03-02T15:18:00.000Z',
    },
    {
      session_key: 9472,
      driver_number: 11,
      lap_number: 15,
      lap_duration: 88.999,
      is_pit_out_lap: false,
      date_start: '2024-03-02T15:22:00.000Z',
    },
    {
      session_key: 9472,
      driver_number: 44,
      lap_number: 1,
      lap_duration: null,
      is_pit_out_lap: false,
      date_start: null,
    },
  ];

  const LOCATIONS_FAST = [
    { session_key: 9472, driver_number: 11, date: '2024-03-02T15:22:00.000Z', x: 1000, y: 200, z: 0 },
    { session_key: 9472, driver_number: 11, date: '2024-03-02T15:22:00.300Z', x: 0, y: 0, z: 0 }, // sentinel
    { session_key: 9472, driver_number: 11, date: '2024-03-02T15:22:00.600Z', x: 990, y: 220, z: 0 },
  ];

  it('runs the 3-step flow and picks the fastest valid lap', async () => {
    const { client, calls } = makeMockClient([
      { match: (u) => u.includes('/v1/sessions'), body: SESSIONS },
      { match: (u) => u.includes('/v1/laps'), body: LAPS_RACE },
      { match: (u) => u.includes('/v1/location'), body: LOCATIONS_FAST },
    ]);

    const result = await fetchFastLapLocations({
      client,
      circuit_key: 63,
      year: 2024,
    });

    expect(result.session_key).toBe(9472);
    expect(result.session_type).toBe('Race');
    expect(result.driver_number).toBe(11); // fastest
    expect(result.lap_number).toBe(15);
    expect(result.lap_duration).toBe(88.999);
    expect(result.samples).toHaveLength(2); // sentinel filtered
    expect(result.samples[0].x).toBe(1000);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatch(/\/v1\/sessions\?/);
    expect(calls[1]).toMatch(/\/v1\/laps\?session_key=9472/);
    expect(calls[2]).toMatch(/\/v1\/location\?/);
    expect(calls[2]).toMatch(/driver_number=11/);
    expect(calls[2]).toMatch(/date>=/);
  });

  it('throws when no preferred session present', async () => {
    const { client } = makeMockClient([
      {
        match: (u) => u.includes('/v1/sessions'),
        body: [
          {
            session_key: 1,
            session_type: 'Practice',
            session_name: 'Practice 1',
            date_start: '2024-03-01T11:30:00.000Z',
            date_end: '2024-03-01T12:30:00.000Z',
            year: 2024,
            circuit_key: 63,
          },
        ],
      },
    ]);
    await expect(
      fetchFastLapLocations({ client, circuit_key: 63, year: 2024 }),
    ).rejects.toThrow(/no preferred session/i);
  });

  it('falls back to Qualifying when no Race', async () => {
    const sessionsNoRace = [SESSIONS[1]]; // only Quali
    const lapsQuali = [
      {
        session_key: 9470,
        driver_number: 11,
        lap_number: 7,
        lap_duration: 85.0,
        is_pit_out_lap: false,
        date_start: '2024-03-01T16:30:00.000Z',
      },
    ];
    const { client } = makeMockClient([
      { match: (u) => u.includes('/v1/sessions'), body: sessionsNoRace },
      { match: (u) => u.includes('/v1/laps'), body: lapsQuali },
      { match: (u) => u.includes('/v1/location'), body: LOCATIONS_FAST },
    ]);
    const result = await fetchFastLapLocations({
      client,
      circuit_key: 63,
      year: 2024,
    });
    expect(result.session_type).toBe('Qualifying');
  });

  it('throws when sessions empty', async () => {
    const { client } = makeMockClient([
      { match: (u) => u.includes('/v1/sessions'), body: [] },
    ]);
    await expect(
      fetchFastLapLocations({ client, circuit_key: 999, year: 2024 }),
    ).rejects.toThrow(/no sessions/);
  });

  it('throws when no valid laps', async () => {
    const { client } = makeMockClient([
      { match: (u) => u.includes('/v1/sessions'), body: SESSIONS },
      {
        match: (u) => u.includes('/v1/laps'),
        body: [
          {
            session_key: 9472,
            driver_number: 1,
            lap_number: 1,
            lap_duration: null,
            is_pit_out_lap: false,
            date_start: '2024-03-02T15:00:00.000Z',
          },
        ],
      },
    ]);
    await expect(
      fetchFastLapLocations({ client, circuit_key: 63, year: 2024 }),
    ).rejects.toThrow(/no valid/);
  });

  it('passes date>=/date<= window matching lap.date_start + duration', async () => {
    const { client, calls } = makeMockClient([
      { match: (u) => u.includes('/v1/sessions'), body: SESSIONS },
      { match: (u) => u.includes('/v1/laps'), body: LAPS_RACE },
      { match: (u) => u.includes('/v1/location'), body: [] },
    ]);
    // lap 15: date_start = 15:22:00, duration = 88.999s → end = 15:23:28.999
    await fetchFastLapLocations({ client, circuit_key: 63, year: 2024 });
    const locCall = calls[2];
    // openf1Client.ts 의 buildUrl 정책: 연산자(>, <, =) 가 키 끝에 있으면 raw 유지,
    // 값만 encodeURIComponent. 콜론(:) 은 인코딩되어 %3A 로 노출.
    expect(locCall).toContain('date>=2024-03-02T15%3A22%3A00.000Z');
    expect(locCall).toContain('date<=2024-03-02T15%3A23%3A28.999Z');
  });
});
