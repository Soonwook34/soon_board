// dashboard §2.2 — 진행률 바 총 lap 수. public/raceDistance.json (GitHub Actions 일일 cron 산출)
// 을 1회 fetch + (circuit_key, year) → total_laps 메모리 Map 캐시.
//
// graceful degrade (plan §10 위험): fetch 실패/404/파싱오류 시 빈 Map 반환(throw 안 함) +
// console.warn. 룩업 실패 시 null → UI 는 "L?? / ??" 표시 (의도된 degraded 동작, 인수 21).
// raceDistance.json 은 same-origin 정적 자산이라 OpenF1Client 미경유 (plain fetch).

interface RaceDistanceEntry {
  circuit_key: number;
  year: number;
  total_laps: number;
}

interface RaceDistanceFile {
  generated_at?: string;
  entries?: RaceDistanceEntry[];
}

const RACE_DISTANCE_URL = '/raceDistance.json';

let cache: Map<string, number> | null = null;
let inflight: Promise<Map<string, number>> | null = null;

function keyOf(circuitKey: number, year: number): string {
  return `${circuitKey}:${year}`;
}

/** raceDistance.json 1회 로드 + 캐시. 실패해도 빈 Map 반환 (절대 throw 안 함). */
export function loadRaceDistance(fetchImpl: typeof fetch = fetch): Promise<Map<string, number>> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = (async (): Promise<Map<string, number>> => {
    const map = new Map<string, number>();
    try {
      const res = await fetchImpl(RACE_DISTANCE_URL);
      if (res.ok) {
        const data = (await res.json()) as RaceDistanceFile;
        for (const e of data.entries ?? []) {
          if (
            Number.isFinite(e.circuit_key) &&
            Number.isFinite(e.year) &&
            Number.isFinite(e.total_laps)
          ) {
            map.set(keyOf(e.circuit_key, e.year), e.total_laps);
          }
        }
      } else {
        console.warn(`[totalLaps] ${RACE_DISTANCE_URL} HTTP ${res.status} — degraded (L?? 표시)`);
      }
    } catch (err) {
      console.warn(`[totalLaps] ${RACE_DISTANCE_URL} load failed — degraded (L?? 표시)`, err);
    }
    cache = map;
    inflight = null;
    return map;
  })();
  return inflight;
}

/** (circuit_key, year) → total_laps. 없으면 null. */
export function totalLapsFor(map: Map<string, number>, circuitKey: number, year: number): number | null {
  return map.get(keyOf(circuitKey, year)) ?? null;
}

/** 테스트 격리용 — 모듈 캐시 초기화. */
export function _resetRaceDistanceCache(): void {
  cache = null;
  inflight = null;
}
