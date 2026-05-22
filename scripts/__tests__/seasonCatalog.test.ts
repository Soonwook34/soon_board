import { describe, expect, it } from 'vitest';
import { buildSeasonCatalog } from '../_lib/seasonCatalog.js';
import { OpenF1Client } from '../_lib/openf1Client.js';

const NOW = new Date('2024-06-15T00:00:00.000Z');

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface MockEndpoint {
  match: (url: URL) => boolean;
  body: unknown;
}

function mockClient(routes: MockEndpoint[]): OpenF1Client {
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    const route = routes.find((r) => r.match(url));
    if (!route) {
      return new Response(`unmatched: ${url}`, { status: 404 });
    }
    return jsonResponse(route.body);
  };
  return new OpenF1Client({
    baseUrl: 'https://api.openf1.test',
    sleep: async () => {},
    fetchImpl,
    random: () => 0.5,
    rateLimitPerMin: 60000, // effectively no throttle for tests
  });
}

describe('buildSeasonCatalog', () => {
  it('returns null when OpenF1 has no meetings for the year', async () => {
    const client = mockClient([
      { match: (u) => u.pathname === '/v1/meetings' && u.searchParams.get('year') === '2027', body: [] },
    ]);
    const result = await buildSeasonCatalog({ client, year: 2027, now: NOW });
    expect(result).toBeNull();
  });

  it('builds podium + fastest_lap + rainfall_any for a PAST race session', async () => {
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings' && u.searchParams.get('year') === '2024',
        body: [
          {
            meeting_key: 1229,
            meeting_name: 'Bahrain Grand Prix',
            year: 2024,
            date_start: '2024-02-29T11:30:00+00:00',
            date_end: '2024-03-02T17:00:00+00:00',
            is_cancelled: false,
          },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/sessions' && u.searchParams.get('meeting_key') === '1229',
        body: [
          {
            session_key: 9472,
            session_name: 'Race',
            session_type: 'Race',
            meeting_key: 1229,
            date_start: '2024-03-02T15:00:00+00:00',
            date_end: '2024-03-02T17:00:00+00:00',
            is_cancelled: false,
          },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/session_result' && u.searchParams.get('session_key') === '9472',
        body: [
          { position: 1, driver_number: 1, duration: 5504.742, gap_to_leader: 0 },
          { position: 2, driver_number: 11, duration: 5527.0, gap_to_leader: 22.258 },
          { position: 3, driver_number: 55, duration: 5530.0, gap_to_leader: 25.0 },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/drivers' && u.searchParams.get('session_key') === '9472',
        body: [
          { driver_number: 1, name_acronym: 'VER', team_colour: '3671C6' },
          { driver_number: 11, name_acronym: 'PER', team_colour: '3671C6' },
          { driver_number: 55, name_acronym: 'SAI', team_colour: 'F91536' },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/laps' && u.searchParams.get('session_key') === '9472',
        body: [
          { driver_number: 1, lap_duration: 90.5 },
          { driver_number: 1, lap_duration: 89.123 },
          { driver_number: 11, lap_duration: 90.0 },
          { driver_number: 55, lap_duration: 89.999 },
          { driver_number: 1, lap_duration: 0 }, // filtered by lap_duration>0 but also defensively skipped
        ],
      },
      {
        match: (u) => u.pathname === '/v1/weather' && u.searchParams.get('session_key') === '9472',
        body: [], // no rain
      },
    ]);

    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW });
    expect(result).not.toBeNull();
    const session = result!.meetings[0].sessions[0];
    expect(session.result_preview).toBeDefined();
    expect(session.result_preview!.podium).toEqual([
      { position: 1, driver_number: 1, name_acronym: 'VER', team_colour: '3671C6' },
      { position: 2, driver_number: 11, name_acronym: 'PER', team_colour: '3671C6' },
      { position: 3, driver_number: 55, name_acronym: 'SAI', team_colour: 'F91536' },
    ]);
    expect(session.result_preview!.fastest_lap).toEqual({
      driver_number: 1,
      name_acronym: 'VER',
      lap_duration: 89.123,
    });
    expect(session.result_preview!.rainfall_any).toBe(false);
  });

  it('marks rainfall_any=true when weather has rainfall records', async () => {
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings' && u.searchParams.get('year') === '2024',
        body: [
          {
            meeting_key: 1,
            meeting_name: 'Wet GP',
            year: 2024,
            date_end: '2024-03-02T17:00:00+00:00',
          },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/sessions',
        body: [
          {
            session_key: 100,
            session_name: 'Race',
            session_type: 'Race',
            meeting_key: 1,
            date_start: '2024-03-02T15:00:00+00:00',
            date_end: '2024-03-02T17:00:00+00:00',
            is_cancelled: false,
          },
        ],
      },
      {
        match: (u) => u.pathname === '/v1/session_result',
        body: [{ position: 1, driver_number: 1 }],
      },
      { match: (u) => u.pathname === '/v1/drivers', body: [{ driver_number: 1, name_acronym: 'VER', team_colour: '3671C6' }] },
      { match: (u) => u.pathname === '/v1/laps', body: [{ driver_number: 1, lap_duration: 89.0 }] },
      { match: (u) => u.pathname === '/v1/weather', body: [{ rainfall: 1 }, { rainfall: 1 }] },
    ]);

    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW });
    expect(result!.meetings[0].sessions[0].result_preview!.rainfall_any).toBe(true);
  });

  it('skips result_preview for is_cancelled sessions', async () => {
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings',
        body: [{ meeting_key: 1, meeting_name: 'Cancelled GP', year: 2024 }],
      },
      {
        match: (u) => u.pathname === '/v1/sessions',
        body: [
          {
            session_key: 200,
            session_name: 'Race',
            session_type: 'Race',
            meeting_key: 1,
            date_start: '2024-03-02T15:00:00+00:00',
            date_end: '2024-03-02T17:00:00+00:00',
            is_cancelled: true,
          },
        ],
      },
    ]);
    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW });
    const session = result!.meetings[0].sessions[0];
    expect(session.result_preview).toBeUndefined();
  });

  it('skips result_preview for future sessions', async () => {
    const future = new Date('2024-12-01T00:00:00.000Z'); // before "now"
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings',
        body: [{ meeting_key: 1, meeting_name: 'Future GP', year: 2024 }],
      },
      {
        match: (u) => u.pathname === '/v1/sessions',
        body: [
          {
            session_key: 300,
            session_name: 'Race',
            session_type: 'Race',
            meeting_key: 1,
            date_start: '2024-12-15T15:00:00+00:00',
            date_end: '2024-12-15T17:00:00+00:00',
            is_cancelled: false,
          },
        ],
      },
    ]);
    const result = await buildSeasonCatalog({ client, year: 2024, now: future });
    expect(result!.meetings[0].sessions[0].result_preview).toBeUndefined();
  });

  it('returns null/empty preview when session_result is empty', async () => {
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings',
        body: [{ meeting_key: 1, meeting_name: 'GP', year: 2024 }],
      },
      {
        match: (u) => u.pathname === '/v1/sessions',
        body: [
          {
            session_key: 400,
            session_name: 'Race',
            session_type: 'Race',
            meeting_key: 1,
            date_start: '2024-03-02T15:00:00+00:00',
            date_end: '2024-03-02T17:00:00+00:00',
            is_cancelled: false,
          },
        ],
      },
      { match: (u) => u.pathname === '/v1/session_result', body: [] },
    ]);
    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW });
    expect(result!.meetings[0].sessions[0].result_preview).toBeUndefined();
  });

  it('fails soft on 404 from weather/laps/drivers (treats as empty)', async () => {
    // Real OpenF1 sometimes returns 404 instead of [] for filter combos that match 0 rows
    // (e.g. weather?rainfall=1 on dry sessions, drivers on pre-season tests).
    // buildResultPreview must keep building the preview from whatever auxiliary data succeeds.
    const fetchImpl: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/v1/meetings') {
        return new Response(
          JSON.stringify([{ meeting_key: 1, meeting_name: 'Dry GP', year: 2024 }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.pathname === '/v1/sessions') {
        return new Response(
          JSON.stringify([
            {
              session_key: 999,
              session_name: 'Race',
              session_type: 'Race',
              meeting_key: 1,
              date_start: '2024-03-02T15:00:00+00:00',
              date_end: '2024-03-02T17:00:00+00:00',
              is_cancelled: false,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.pathname === '/v1/session_result') {
        return new Response(
          JSON.stringify([
            { position: 1, driver_number: 1, duration: 5500 },
            { position: 2, driver_number: 11, duration: 5520 },
            { position: 3, driver_number: 55, duration: 5530 },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // 404 fail-soft for weather and drivers
      if (url.pathname === '/v1/weather' || url.pathname === '/v1/drivers') {
        return new Response('Not Found', { status: 404 });
      }
      if (url.pathname === '/v1/laps') {
        return new Response(JSON.stringify([{ driver_number: 1, lap_duration: 89.5 }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('unmatched', { status: 404 });
    };
    const client = new OpenF1Client({
      baseUrl: 'https://api.openf1.test',
      sleep: async () => {},
      fetchImpl,
      random: () => 0.5,
      rateLimitPerMin: 60000,
    });
    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW });
    const preview = result!.meetings[0].sessions[0].result_preview!;
    expect(preview.podium).toHaveLength(3);
    expect(preview.podium[0].name_acronym).toBe('#1'); // fallback because drivers 404'd
    expect(preview.fastest_lap?.lap_duration).toBe(89.5);
    expect(preview.rainfall_any).toBe(false); // weather 404 → empty → false
  });

  it('honours meetingLimit (smoke mode)', async () => {
    const client = mockClient([
      {
        match: (u) => u.pathname === '/v1/meetings',
        body: [
          { meeting_key: 1, meeting_name: 'GP1', year: 2024 },
          { meeting_key: 2, meeting_name: 'GP2', year: 2024 },
          { meeting_key: 3, meeting_name: 'GP3', year: 2024 },
        ],
      },
      { match: (u) => u.pathname === '/v1/sessions', body: [] },
    ]);
    const result = await buildSeasonCatalog({ client, year: 2024, now: NOW, meetingLimit: 2 });
    expect(result!.meetings).toHaveLength(2);
    expect(result!.meetings[0].meeting_key).toBe(1);
    expect(result!.meetings[1].meeting_key).toBe(2);
  });
});
