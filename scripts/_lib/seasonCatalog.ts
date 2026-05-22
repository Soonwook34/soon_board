// 시즌 카탈로그 빌드 helper — OpenF1 raw 응답을 plan §2.2 schema로 변환
//
// 정책:
//  - PAST 세션(date_end < now)만 result_preview 계산
//  - Qualifying: session_result.duration이 배열 → 마지막 단계(Q3 best, 또는 도달한 최고 단계)
//  - Race / Sprint: session_result.duration은 단일 number, gap_to_leader는 단일 number
//  - Practice: session_result도 동일 형태로 가정 (fastest lap 기반 순위)
//  - rainfall_any: weather?rainfall=1 응답이 1건 이상이면 true
//  - is_cancelled 세션은 result_preview 제외

import type { OpenF1Client } from './openf1Client.js';

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  location?: string;
  country_code?: string;
  country_name?: string;
  country_flag?: string;
  circuit_key?: number;
  circuit_short_name?: string;
  circuit_type?: string;
  circuit_image?: string;
  gmt_offset?: string;
  date_start?: string;
  date_end?: string;
  year?: number;
  is_cancelled?: boolean;
}

export interface OpenF1Session {
  session_key: number;
  session_name: string;
  session_type: string;
  meeting_key: number;
  date_start: string;
  date_end: string;
  year?: number;
  is_cancelled?: boolean;
}

export interface OpenF1SessionResultEntry {
  position: number | null;
  driver_number: number;
  duration?: number | number[] | null;
  gap_to_leader?: number | number[] | string | null;
  number_of_laps?: number | null;
  points?: number | null;
  dnf?: boolean;
  dns?: boolean;
  dsq?: boolean;
}

export interface OpenF1Driver {
  driver_number: number;
  name_acronym: string;
  team_colour?: string;
}

export interface OpenF1Lap {
  driver_number: number;
  lap_duration: number | null;
}

export interface ResultPreviewDriverRow {
  position: number;
  driver_number: number;
  name_acronym: string;
  team_colour: string;
}

export interface ResultPreview {
  podium: ResultPreviewDriverRow[];
  fastest_lap: {
    driver_number: number;
    name_acronym: string;
    lap_duration: number;
  } | null;
  rainfall_any: boolean;
}

// plan §2.2 schema 그대로 — outer year/meeting_key 등 부모 레벨에 있는 필드는 inner에서 제외.
export interface SessionCatalogEntry {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  is_cancelled?: boolean;
  result_preview?: ResultPreview;
}

export interface MeetingCatalogEntry {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  location?: string;
  country_code?: string;
  country_name?: string;
  country_flag?: string;
  circuit_key?: number;
  circuit_short_name?: string;
  circuit_type?: string;
  circuit_image?: string;
  gmt_offset?: string;
  date_start?: string;
  date_end?: string;
  is_cancelled?: boolean;
  sessions: SessionCatalogEntry[];
}

export interface SeasonCatalog {
  year: number;
  generated_at: string;
  source: string;
  meetings: MeetingCatalogEntry[];
}

export interface BuildSeasonCatalogArgs {
  client: OpenF1Client;
  year: number;
  /** Override "now" for testing. Default Date.now(). */
  now?: Date;
  /** Smoke mode: stop after N meetings. */
  meetingLimit?: number;
  /** Progress logger. */
  log?: (msg: string) => void;
}

/**
 * Build a full season catalog for one year.
 * Returns `null` if OpenF1 returns 0 meetings for that year (future-season case).
 */
export async function buildSeasonCatalog({
  client,
  year,
  now = new Date(),
  meetingLimit,
  log = () => {},
}: BuildSeasonCatalogArgs): Promise<SeasonCatalog | null> {
  log(`[fetch-season-catalog] year=${year} — GET /v1/meetings`);
  const meetingsRaw = await client.get<OpenF1Meeting[]>('/v1/meetings', { year });
  if (meetingsRaw.length === 0) {
    log(`[fetch-season-catalog] year=${year} — OpenF1 has no meetings yet, skipping`);
    return null;
  }

  const meetings = meetingLimit ? meetingsRaw.slice(0, meetingLimit) : meetingsRaw;
  log(`[fetch-season-catalog] year=${year} — ${meetings.length} meetings`);

  const catalog: MeetingCatalogEntry[] = [];
  for (const m of meetings) {
    const sessions = await client.get<OpenF1Session[]>('/v1/sessions', {
      meeting_key: m.meeting_key,
    });
    log(
      `[fetch-season-catalog] meeting ${m.meeting_key} (${m.meeting_name}) — ${sessions.length} sessions`,
    );

    const sessionEntries: SessionCatalogEntry[] = [];
    for (const s of sessions) {
      const isPast = !s.is_cancelled && new Date(s.date_end).getTime() < now.getTime();
      if (!isPast) {
        sessionEntries.push(normalizeSession(s));
        continue;
      }
      const preview = await buildResultPreview(client, s, log);
      sessionEntries.push({
        ...normalizeSession(s),
        ...(preview ? { result_preview: preview } : {}),
      });
    }

    catalog.push({ ...normalizeMeeting(m), sessions: sessionEntries });
  }

  return {
    year,
    generated_at: now.toISOString(),
    source: 'openf1.org/v1',
    meetings: catalog,
  };
}

// OpenF1는 일부 필터 조합/세션 조합에서 빈 배열 대신 404를 반환한다(특히 weather, drivers).
// result_preview 보조 호출은 fail-soft — 404를 빈 배열로 처리해서 그 세션의 preview가
// 한 필드만 비어도 다른 필드는 보존되게 한다. 메인 meetings/sessions 호출은 fail-fast 유지.
async function getOrEmpty<T>(
  client: OpenF1Client,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<T[]> {
  try {
    return await client.get<T[]>(path, query);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/^OpenF1 404/.test(msg)) return [];
    throw err;
  }
}

async function buildResultPreview(
  client: OpenF1Client,
  session: OpenF1Session,
  log: (msg: string) => void,
): Promise<ResultPreview | null> {
  // 1) Podium — session_result with position<=3, joined with drivers for acronym/colour
  const top3Raw = await getOrEmpty<OpenF1SessionResultEntry>(client, '/v1/session_result', {
    session_key: session.session_key,
    'position<=': 3,
  });
  if (top3Raw.length === 0) {
    log(
      `[fetch-season-catalog] session ${session.session_key} (${session.session_name}) — empty session_result, skipping preview`,
    );
    return null;
  }

  const drivers = await getOrEmpty<OpenF1Driver>(client, '/v1/drivers', {
    session_key: session.session_key,
  });
  const driverMap = new Map<number, OpenF1Driver>();
  for (const d of drivers) driverMap.set(d.driver_number, d);

  const podium: ResultPreviewDriverRow[] = top3Raw
    .filter((r) => r.position !== null && r.position <= 3 && r.position >= 1)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((r) => {
      const d = driverMap.get(r.driver_number);
      return {
        position: r.position as number,
        driver_number: r.driver_number,
        name_acronym: d?.name_acronym ?? `#${r.driver_number}`,
        team_colour: d?.team_colour ?? '888888',
      };
    });

  // 2) Fastest lap — laps with lap_duration>0, client-side min
  const laps = await getOrEmpty<OpenF1Lap>(client, '/v1/laps', {
    session_key: session.session_key,
    'lap_duration>': 0,
  });
  let fastest: ResultPreview['fastest_lap'] = null;
  let minDuration = Infinity;
  let minDriver = -1;
  for (const l of laps) {
    if (typeof l.lap_duration === 'number' && l.lap_duration > 0 && l.lap_duration < minDuration) {
      minDuration = l.lap_duration;
      minDriver = l.driver_number;
    }
  }
  if (minDriver !== -1) {
    const d = driverMap.get(minDriver);
    fastest = {
      driver_number: minDriver,
      name_acronym: d?.name_acronym ?? `#${minDriver}`,
      lap_duration: round3(minDuration),
    };
  }

  // 3) rainfall_any — weather with rainfall=1, any record
  const rain = await getOrEmpty<unknown>(client, '/v1/weather', {
    session_key: session.session_key,
    rainfall: 1,
  });
  const rainfallAny = rain.length > 0;

  return { podium, fastest_lap: fastest, rainfall_any: rainfallAny };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// plan §2.2 schema에 맞춰 OpenF1 raw 응답의 잡 필드를 제거. 크기 예산(한 시즌 ≤ 100KB)을
// 지키려면 raw spread는 안 됨 — meeting별 ~7개, session별 ~6개 필드만 유지.
// year/meeting_key 등 부모 레벨에 있는 필드는 inner에서 제외.
function normalizeMeeting(m: OpenF1Meeting): Omit<MeetingCatalogEntry, 'sessions'> {
  return {
    meeting_key: m.meeting_key,
    meeting_name: m.meeting_name,
    ...(m.meeting_official_name !== undefined && { meeting_official_name: m.meeting_official_name }),
    ...(m.location !== undefined && { location: m.location }),
    ...(m.country_code !== undefined && { country_code: m.country_code }),
    ...(m.country_name !== undefined && { country_name: m.country_name }),
    ...(m.country_flag !== undefined && { country_flag: m.country_flag }),
    ...(m.circuit_key !== undefined && { circuit_key: m.circuit_key }),
    ...(m.circuit_short_name !== undefined && { circuit_short_name: m.circuit_short_name }),
    ...(m.circuit_type !== undefined && { circuit_type: m.circuit_type }),
    ...(m.circuit_image !== undefined && { circuit_image: m.circuit_image }),
    ...(m.gmt_offset !== undefined && { gmt_offset: m.gmt_offset }),
    ...(m.date_start !== undefined && { date_start: m.date_start }),
    ...(m.date_end !== undefined && { date_end: m.date_end }),
    ...(m.is_cancelled !== undefined && { is_cancelled: m.is_cancelled }),
  };
}

function normalizeSession(s: OpenF1Session): SessionCatalogEntry {
  return {
    session_key: s.session_key,
    session_name: s.session_name,
    session_type: s.session_type,
    date_start: s.date_start,
    date_end: s.date_end,
    ...(s.is_cancelled !== undefined && { is_cancelled: s.is_cancelled }),
  };
}
