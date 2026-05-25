// OpenF1 race/quali 의 가장 빠른 정규 lap location samples 수집 — live-map §1.3 step 1·3 + §2.2.
//
// 흐름 (3 step, 직렬 — OpenF1Client 의 토큰버킷이 모든 호출에 통과):
//   1. GET /v1/sessions?circuit_key=N&year=Y → race 우선, 없으면 quali
//   2. GET /v1/laps?session_key=K → 정규 lap (lap_duration > 0, !is_pit_out_lap) 중 최소 duration
//   3. GET /v1/location?session_key=K&driver_number=D&date>=t0&date<=t1 → sentinel 필터링
//
// affine transform 추출용 mass 데이터 (수백 ~ 수천 samples).
// 단위 테스트는 fetchImpl injection 으로 OpenF1Client 의 외부 호출을 mock 한다.

import type { OpenF1Client } from './openf1Client.js';

// ── raw API record 타입 (script-local — DataSource SSOT 와 별개) ────────

interface RawSession {
  session_key: number;
  session_type: string;
  session_name: string;
  date_start: string;
  date_end: string;
  year: number;
  circuit_key: number;
}

interface RawLap {
  session_key: number;
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;
  date_start: string | null;
  is_pit_out_lap?: boolean;
}

interface RawLocation {
  session_key: number;
  driver_number: number;
  date: string;
  x: number;
  y: number;
  z: number;
}

// ── 출력 ─────────────────────────────────────────────────────────────────

export interface OpenF1LocationSample {
  date: Date;
  x: number;
  y: number;
  z: number;
}

export interface FastLapResult {
  session_key: number;
  session_type: string;
  session_name: string;
  driver_number: number;
  lap_number: number;
  lap_duration: number;
  samples: OpenF1LocationSample[];
}

export interface FastLapOptions {
  client: OpenF1Client;
  circuit_key: number;
  year: number;
  /** Sentinel cutoff: |x|+|y|+|z| < N 은 가라지 좌표로 간주해 폐기 (live-map §4.2). 기본 50. */
  sentinelThreshold?: number;
  /** session_type 선호 순서. 기본 ['Race', 'Qualifying', 'Sprint']. */
  preferredSessionTypes?: string[];
}

const DEFAULT_SENTINEL = 50;
const DEFAULT_PREFERRED: readonly string[] = ['Race', 'Qualifying', 'Sprint'];

/**
 * (circuit_key, year) 에서 가장 빠른 정규 lap 의 OpenF1 location 시계열을 가져온다.
 * affine transform 추출용 입력. sentinel 필터링 후 timestamp 오름차순 정렬된 samples 반환.
 */
export async function fetchFastLapLocations(opts: FastLapOptions): Promise<FastLapResult> {
  const sentinelThreshold = opts.sentinelThreshold ?? DEFAULT_SENTINEL;
  const preferred = opts.preferredSessionTypes ?? DEFAULT_PREFERRED;

  // Step 1: sessions
  const sessions = await opts.client.get<RawSession[]>('/v1/sessions', {
    circuit_key: opts.circuit_key,
    year: opts.year,
  });
  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error(
      `OpenF1: no sessions for circuit_key=${opts.circuit_key} year=${opts.year}`,
    );
  }
  const session = pickPreferredSession(sessions, preferred);
  if (!session) {
    throw new Error(
      `OpenF1: no preferred session (${preferred.join('/')}) among ${sessions.length} sessions for circuit_key=${opts.circuit_key} year=${opts.year}`,
    );
  }

  // Step 2: laps
  const laps = await opts.client.get<RawLap[]>('/v1/laps', {
    session_key: session.session_key,
  });
  const validLaps = laps.filter(isValidRegularLap);
  if (validLaps.length === 0) {
    throw new Error(
      `OpenF1: no valid (non-pit-out, finite duration) laps for session_key=${session.session_key}`,
    );
  }
  // ascending by lap_duration
  validLaps.sort((a, b) => (a.lap_duration as number) - (b.lap_duration as number));
  const fast = validLaps[0];
  if (!fast.date_start) {
    throw new Error(
      `OpenF1: fastest lap (driver=${fast.driver_number} lap=${fast.lap_number}) has no date_start`,
    );
  }

  // Step 3: location
  const dStart = new Date(fast.date_start);
  const dEnd = new Date(dStart.getTime() + (fast.lap_duration as number) * 1000);
  const rawLocs = await opts.client.get<RawLocation[]>('/v1/location', {
    session_key: session.session_key,
    driver_number: fast.driver_number,
    'date>=': dStart.toISOString(),
    'date<=': dEnd.toISOString(),
  });

  const samples = parseAndFilterLocations(rawLocs, sentinelThreshold);

  return {
    session_key: session.session_key,
    session_type: session.session_type,
    session_name: session.session_name,
    driver_number: fast.driver_number,
    lap_number: fast.lap_number,
    lap_duration: fast.lap_duration as number,
    samples,
  };
}

// ── helpers (export 해서 단위 테스트에서 검증) ─────────────────────────

export function pickPreferredSession<T extends { session_type: string }>(
  sessions: T[],
  preferred: readonly string[],
): T | undefined {
  for (const type of preferred) {
    const hit = sessions.find((s) => s.session_type === type);
    if (hit) return hit;
  }
  return undefined;
}

export function isValidRegularLap(lap: RawLap): boolean {
  if (typeof lap.lap_duration !== 'number') return false;
  if (!Number.isFinite(lap.lap_duration) || lap.lap_duration <= 0) return false;
  if (lap.is_pit_out_lap === true) return false;
  if (!lap.date_start) return false;
  return true;
}

export function parseAndFilterLocations(
  raw: RawLocation[],
  sentinelThreshold: number,
): OpenF1LocationSample[] {
  const out: OpenF1LocationSample[] = [];
  for (const r of raw) {
    if (Math.abs(r.x) + Math.abs(r.y) + Math.abs(r.z) < sentinelThreshold) continue;
    const d = new Date(r.date);
    if (!Number.isFinite(d.getTime())) continue;
    out.push({ date: d, x: r.x, y: r.y, z: r.z });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}
