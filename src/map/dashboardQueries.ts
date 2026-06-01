// dashboard §4.2 — DataSource 대시보드 메서드의 **공유 순수 쿼리 로직** (SSOT).
//
// LiveDataSource(ring buffer record map)·ReplayDataSource(window cache)가 endpoint 별로
// record 배열을 모아 본 함수들에 위임한다. 두 모드의 버퍼 저장 방식은 다르지만 시간 컷·정렬·
// lap 완료 판정·누적 통계 로직은 동일하므로 한 곳에 둔다.
//
// 핵심 불변식 (dashboard §4.5 미래 누설 zero):
//  - 모든 시간 컷은 `date ≤ t` (등호 포함). t 이후의 record 는 절대 반환하지 않는다.
//  - lap 은 `date_start + lap_duration ≤ t` (완료 시점) 기준 — date_start ≤ t 만으로는 진행 중
//    lap 의 절반 데이터가 누설될 수 있다.
//  - 누적 통계(aggregate)는 t 까지 완료된 lap 만 반영 → 시크해도 미래 best 가 보이지 않는다.

import type {
  AggregateName,
  AggregateResults,
  FastestLapAggregate,
  LapRecord,
  PersonalBestRow,
  PurpleSectorRow,
  PurpleSectorsAggregate,
  StintRecord,
} from '../shared/openf1Types.js';

/** record 의 파싱된 `date` 필드(있으면 Date, 없거나 미파싱이면 null). undated endpoint 는 null. */
function recDate(r: unknown): Date | null {
  const d = (r as { date?: unknown }).date;
  return d instanceof Date ? d : null;
}

function matchesFilters<T>(record: T, filters?: Partial<T>): boolean {
  if (!filters) return true;
  const bag = record as Record<string, unknown>;
  for (const key of Object.keys(filters)) {
    if (bag[key] !== (filters as Record<string, unknown>)[key]) return false;
  }
  return true;
}

/**
 * `date ≤ t` 인 record 중 date 가 가장 큰 1건. 없으면 null.
 * date 가 없는 record(undated endpoint)는 시간 증명이 불가하므로 제외 — 미래 누설 zero.
 * 동일 date 가 여럿이면 배열에서 나중에 등장한 것(최신 insert)을 택한다.
 */
export function latestBefore<T>(records: readonly T[], t: Date, filters?: Partial<T>): T | null {
  const tMs = t.valueOf();
  let best: T | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const r of records) {
    const d = recDate(r);
    if (d === null) continue;
    const ms = d.valueOf();
    if (ms > tMs) continue;
    if (!matchesFilters(r, filters)) continue;
    if (ms >= bestMs) {
      best = r;
      bestMs = ms;
    }
  }
  return best;
}

/**
 * `date ≤ t` 인 모든 record (date 내림차순 — 최신이 앞). limit 미지정 시 전부.
 * undated record 제외 (latestBefore 와 동일 정책).
 */
export function allBefore<T>(records: readonly T[], t: Date, filters?: Partial<T>, limit?: number): T[] {
  const tMs = t.valueOf();
  const out: T[] = [];
  for (const r of records) {
    const d = recDate(r);
    if (d === null || d.valueOf() > tMs) continue;
    if (!matchesFilters(r, filters)) continue;
    out.push(r);
  }
  // Array.sort 는 안정 정렬 — 동일 date 는 insert 순서 보존.
  out.sort((a, b) => (recDate(b) as Date).valueOf() - (recDate(a) as Date).valueOf());
  return limit != null ? out.slice(0, limit) : out;
}

/** lap 이 끝나는 wall-clock(ms). date_start 또는 lap_duration 이 null 이면 null(미완). */
function lapEndMs(lap: LapRecord): number | null {
  if (!lap.date_start || lap.lap_duration == null) return null;
  return lap.date_start.valueOf() + lap.lap_duration * 1000;
}

/**
 * 드라이버가 `t` 시점에 주행 중인 lap — `date_start ≤ t` 인 lap 중 가장 늦게 시작한 것.
 * 완료 lap·진행 중 lap(lap_duration null) 모두 포함 (§3.2 In Progress 행이 추가 판정).
 * 미래 시작 lap(date_start > t)은 절대 반환 안 함.
 */
export function lapAt(laps: readonly LapRecord[], driverNum: number, t: Date): LapRecord | null {
  const tMs = t.valueOf();
  let best: LapRecord | null = null;
  let bestStart = Number.NEGATIVE_INFINITY;
  for (const lap of laps) {
    if (lap.driver_number !== driverNum) continue;
    if (!lap.date_start) continue;
    const s = lap.date_start.valueOf();
    if (s > tMs) continue;
    if (s >= bestStart) {
      best = lap;
      bestStart = s;
    }
  }
  return best;
}

/**
 * `date_start + lap_duration ≤ t` 인 **완료된** lap (date_start 내림차순). limit 미지정 시 전부.
 * lap_duration 이 null(진행 중)이거나 date_start 가 null 인 lap 은 제외 — 미래 누설 zero (§4.5 (b)).
 */
export function completedLapsBefore(
  laps: readonly LapRecord[],
  driverNum: number,
  t: Date,
  limit?: number,
): LapRecord[] {
  const tMs = t.valueOf();
  const out: LapRecord[] = [];
  for (const lap of laps) {
    if (lap.driver_number !== driverNum) continue;
    const end = lapEndMs(lap);
    if (end == null || end > tMs) continue;
    out.push(lap);
  }
  out.sort((a, b) => (b.date_start as Date).valueOf() - (a.date_start as Date).valueOf());
  return limit != null ? out.slice(0, limit) : out;
}

/**
 * `lap_start ≤ lap ≤ lap_end` 인 stint (포함 구간). 없으면 null.
 * 막대 길이 합산(Issue #89 반-개구간)은 호출처(TyreStrategy)의 책임 — 본 룩업은 단일 stint 조회.
 */
export function stintForLap(
  stints: readonly StintRecord[],
  driverNum: number,
  lap: number,
): StintRecord | null {
  for (const s of stints) {
    if (s.driver_number !== driverNum) continue;
    if (lap >= s.lap_start && lap <= s.lap_end) return s;
  }
  return null;
}

// ── 누적 통계 (getAggregateBefore) ──────────────────────────────────────

/** t 까지 완료된 lap (date_start + lap_duration ≤ t). 전 드라이버. */
function completedForAggregate(laps: readonly LapRecord[], t: Date): LapRecord[] {
  const tMs = t.valueOf();
  const out: LapRecord[] = [];
  for (const lap of laps) {
    const end = lapEndMs(lap);
    if (end == null || end > tMs) continue;
    out.push(lap);
  }
  return out;
}

function fastestLapOf(completed: readonly LapRecord[]): FastestLapAggregate | null {
  let best: FastestLapAggregate | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const lap of completed) {
    if (lap.lap_duration == null) continue;
    if (lap.lap_duration < bestMs) {
      bestMs = lap.lap_duration;
      best = {
        driver_number: lap.driver_number,
        lap_number: lap.lap_number,
        lap_duration: lap.lap_duration,
      };
    }
  }
  return best;
}

function purpleSectorsOf(completed: readonly LapRecord[]): PurpleSectorsAggregate {
  const sectorKeys: Array<keyof LapRecord> = [
    'duration_sector_1',
    'duration_sector_2',
    'duration_sector_3',
  ];
  const rows: (PurpleSectorRow | null)[] = sectorKeys.map((key) => {
    let best: PurpleSectorRow | null = null;
    let bestMs = Number.POSITIVE_INFINITY;
    for (const lap of completed) {
      const v = lap[key] as number | null;
      if (v == null) continue;
      if (v < bestMs) {
        bestMs = v;
        best = { driver_number: lap.driver_number, sector_duration: v };
      }
    }
    return best;
  });
  return { s1: rows[0], s2: rows[1], s3: rows[2] };
}

function personalBestsOf(completed: readonly LapRecord[]): Map<number, PersonalBestRow> {
  const map = new Map<number, PersonalBestRow>();
  const min = (a: number | null, b: number | null): number | null => {
    if (a == null) return b;
    if (b == null) return a;
    return a < b ? a : b;
  };
  for (const lap of completed) {
    const prev = map.get(lap.driver_number) ?? {
      driver_number: lap.driver_number,
      best_lap_duration: null,
      best_sector_1: null,
      best_sector_2: null,
      best_sector_3: null,
    };
    map.set(lap.driver_number, {
      driver_number: lap.driver_number,
      best_lap_duration: min(prev.best_lap_duration, lap.lap_duration),
      best_sector_1: min(prev.best_sector_1, lap.duration_sector_1),
      best_sector_2: min(prev.best_sector_2, lap.duration_sector_2),
      best_sector_3: min(prev.best_sector_3, lap.duration_sector_3),
    });
  }
  return map;
}

/** t 까지 완료된 lap 만으로 세 누적 통계를 한 번에 산출. */
export function computeAllAggregates(laps: readonly LapRecord[], t: Date): AggregateResults {
  const completed = completedForAggregate(laps, t);
  return {
    fastest_lap: fastestLapOf(completed),
    purple_sectors: purpleSectorsOf(completed),
    personal_bests: personalBestsOf(completed),
  };
}

/** 단일 aggregate 조회 — computeAllAggregates 의 한 필드. (getAggregateBefore 위임) */
export function computeAggregateBefore<A extends AggregateName>(
  laps: readonly LapRecord[],
  aggregate: A,
  t: Date,
): AggregateResults[A] {
  return computeAllAggregates(laps, t)[aggregate];
}
