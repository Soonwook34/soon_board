// src/map/dashboardQueries.ts — dashboard §4.2 공유 쿼리 + §4.5 미래 누설 zero 단위 검증.
//
// 합성 fixture 로 "t 직후의 record 가 존재" 하는 상황을 만들고, 모든 쿼리가 그 미래 record 를
// 반환하지 않음을 검증한다 (dashboard 인수 17/18 의 알고리즘 레벨 커버리지).

import { describe, expect, it } from 'vitest';
import {
  allBefore,
  completedLapsBefore,
  computeAggregateBefore,
  computeAllAggregates,
  lapAt,
  latestBefore,
  sessionResultFor,
  stintForLap,
} from '../dashboardQueries.js';
import type {
  LapRecord,
  PositionRecord,
  SessionResultRecord,
  StintRecord,
} from '../../shared/openf1Types.js';

const T0 = Date.parse('2024-03-02T15:00:00.000Z');
const at = (sec: number): Date => new Date(T0 + sec * 1000);

function pos(driver: number, sec: number, position: number): PositionRecord {
  return { date: at(sec), driver_number: driver, session_key: 1, meeting_key: 1, position };
}

function lap(
  driver: number,
  lapNumber: number,
  startSec: number | null,
  durationSec: number | null,
  sectors: [number | null, number | null, number | null] = [null, null, null],
): LapRecord {
  return {
    date_start: startSec == null ? null : at(startSec),
    driver_number: driver,
    session_key: 1,
    meeting_key: 1,
    lap_number: lapNumber,
    lap_duration: durationSec,
    duration_sector_1: sectors[0],
    duration_sector_2: sectors[1],
    duration_sector_3: sectors[2],
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    is_pit_out_lap: false,
    segments_sector_1: [],
    segments_sector_2: [],
    segments_sector_3: [],
  };
}

function stint(driver: number, n: number, lapStart: number, lapEnd: number): StintRecord {
  return {
    session_key: 1,
    meeting_key: 1,
    driver_number: driver,
    stint_number: n,
    lap_start: lapStart,
    lap_end: lapEnd,
    compound: 'MEDIUM',
    tyre_age_at_start: 0,
  };
}

describe('latestBefore', () => {
  const recs = [pos(44, 10, 3), pos(44, 20, 2), pos(44, 30, 1)];

  it('date ≤ t 중 가장 최근 1건', () => {
    expect(latestBefore(recs, at(25))?.position).toBe(2);
  });

  it('경계 t == date 는 포함 (≤)', () => {
    expect(latestBefore(recs, at(20))?.position).toBe(2);
  });

  it('t 이전 record 가 없으면 null', () => {
    expect(latestBefore(recs, at(5))).toBeNull();
  });

  it('미래 누설 zero — t 직후 record(30s) 는 t=25s 에서 반환 안 됨', () => {
    expect(latestBefore(recs, at(25))?.position).not.toBe(1);
  });

  it('filters 로 driver 한정', () => {
    const mixed = [pos(44, 10, 3), pos(1, 15, 1), pos(44, 18, 2)];
    expect(latestBefore(mixed, at(20), { driver_number: 44 })?.position).toBe(2);
  });

  it('date 없는(undated) record 는 제외 — 시간 증명 불가', () => {
    const withUndated = [{ ...pos(44, 10, 3), date: undefined } as unknown as PositionRecord];
    expect(latestBefore(withUndated, at(100))).toBeNull();
  });
});

describe('allBefore', () => {
  const recs = [pos(44, 10, 3), pos(44, 30, 1), pos(44, 20, 2)];

  it('date 내림차순 (최신 우선)', () => {
    expect(allBefore(recs, at(40)).map((r) => r.position)).toEqual([1, 2, 3]);
  });

  it('limit 적용', () => {
    expect(allBefore(recs, at(40), undefined, 2).map((r) => r.position)).toEqual([1, 2]);
  });

  it('date 없이 date_start 만 있는 record(laps)도 포함 — recDate date_start fallback (실 DataSource 회귀 가드)', () => {
    // OpenF1 laps 는 date 없이 date_start 만 가짐. fallback 이 없으면 getAllBefore('laps') 가 전부
    // 누락돼 빠른 랩 배지 스피드트랩 등이 항상 빈 값이 된다 (stub 통과·실 DataSource 회귀).
    const laps = [lap(44, 1, 0, 90), lap(44, 2, 90, 91), lap(44, 3, 181, null)];
    const got = allBefore(laps, at(200));
    expect(got).toHaveLength(3); // 셋 다 date_start ≤ 200s (lap 3 은 진행 중이어도 date_start ≤ t)
    expect(got.map((l) => l.lap_number)).toEqual([3, 2, 1]); // date_start 내림차순
  });

  it('date_start 미래(>t)는 제외 — laps 도 미래 누설 zero', () => {
    const laps = [lap(44, 1, 0, 90), lap(44, 2, 300, 91)];
    expect(allBefore(laps, at(100)).map((l) => l.lap_number)).toEqual([1]);
  });

  it('미래 누설 zero — t=25s 면 30s record 제외', () => {
    expect(allBefore(recs, at(25)).map((r) => r.position)).toEqual([2, 3]);
  });
});

describe('lapAt', () => {
  const laps = [lap(44, 1, 0, 90), lap(44, 2, 90, 88), lap(44, 3, 178, null)];

  it('date_start ≤ t 중 가장 늦게 시작한 lap', () => {
    expect(lapAt(laps, 44, at(50))?.lap_number).toBe(1);
    expect(lapAt(laps, 44, at(120))?.lap_number).toBe(2);
  });

  it('진행 중 lap(lap_duration null)도 시작했으면 반환', () => {
    expect(lapAt(laps, 44, at(200))?.lap_number).toBe(3);
  });

  it('미래 시작 lap 은 반환 안 함 — t=120s 면 lap3(178s 시작) 제외', () => {
    expect(lapAt(laps, 44, at(120))?.lap_number).not.toBe(3);
  });

  it('아직 어떤 lap 도 시작 안 했으면 null', () => {
    expect(lapAt(laps, 44, at(-10))).toBeNull();
  });
});

describe('completedLapsBefore', () => {
  // lap1 [0,90), lap2 [90,178), lap3 진행 중(178~, duration null)
  const laps = [lap(44, 1, 0, 90), lap(44, 2, 90, 88), lap(44, 3, 178, null)];

  it('완료(date_start+duration ≤ t)된 lap 만, date_start 내림차순', () => {
    expect(completedLapsBefore(laps, 44, at(200)).map((l) => l.lap_number)).toEqual([2, 1]);
  });

  it('미래 누설 zero (b) — t=120s 면 lap2(178s 완료)는 시작했어도 미완 → 제외', () => {
    expect(completedLapsBefore(laps, 44, at(120)).map((l) => l.lap_number)).toEqual([1]);
  });

  it('진행 중 lap(duration null)은 완료 목록에서 제외', () => {
    expect(completedLapsBefore(laps, 44, at(300)).map((l) => l.lap_number)).toEqual([2, 1]);
  });

  it('limit 적용', () => {
    const many = [lap(44, 1, 0, 90), lap(44, 2, 90, 88), lap(44, 3, 178, 80)];
    expect(completedLapsBefore(laps, 44, at(400), 1).map((l) => l.lap_number)).toEqual([2]);
    expect(completedLapsBefore(many, 44, at(400)).length).toBe(3);
  });

  it('다른 driver 의 lap 은 섞이지 않음', () => {
    const mixed = [lap(44, 1, 0, 90), lap(1, 1, 0, 92)];
    expect(completedLapsBefore(mixed, 44, at(200)).map((l) => l.driver_number)).toEqual([44]);
  });
});

describe('stintForLap', () => {
  const stints = [stint(44, 1, 1, 20), stint(44, 2, 21, 40)];

  it('lap_start ≤ lap ≤ lap_end (포함 구간)', () => {
    expect(stintForLap(stints, 44, 20)?.stint_number).toBe(1);
    expect(stintForLap(stints, 44, 21)?.stint_number).toBe(2);
  });

  it('범위 밖 / 다른 driver 면 null', () => {
    expect(stintForLap(stints, 44, 41)).toBeNull();
    expect(stintForLap(stints, 1, 5)).toBeNull();
  });
});

describe('sessionResultFor (undated endpoint 전용 접근자)', () => {
  function result(driver: number, dnf = false): SessionResultRecord {
    return {
      session_key: 1,
      meeting_key: 1,
      driver_number: driver,
      position: 1,
      number_of_laps: 57,
      duration: 5400,
      gap_to_leader: null,
      dnf,
      dns: false,
      dsq: false,
    };
  }

  it('driver_number 일치 record 반환', () => {
    const recs = [result(44), result(1, true)];
    expect(sessionResultFor(recs, 1)?.dnf).toBe(true);
    expect(sessionResultFor(recs, 44)?.driver_number).toBe(44);
  });

  it('일치 없으면 null', () => {
    expect(sessionResultFor([result(44)], 16)).toBeNull();
  });

  it('빈 배열이면 null (라이브 — session_result 미적재)', () => {
    expect(sessionResultFor([], 44)).toBeNull();
  });
});

describe('computeAllAggregates / computeAggregateBefore (누적 통계 + 시크 일관성)', () => {
  // 두 드라이버. 빠른 랩/섹터의 "미래 best" 가 시크 시 보이지 않음을 검증.
  const laps = [
    lap(44, 1, 0, 90, [30, 30, 30]), // ends 90
    lap(1, 1, 0, 92, [31, 30, 31]), // ends 92
    lap(44, 2, 90, 88, [29, 29, 30]), // ends 178
    lap(1, 2, 92, 85, [28, 28, 29]), // ends 177  ← 세션 전체 best
  ];

  it('t=200s — 전체 완료: fastest_lap = 85 (driver 1, lap 2)', () => {
    const f = computeAggregateBefore(laps, 'fastest_lap', at(200));
    expect(f).toEqual({ driver_number: 1, lap_number: 2, lap_duration: 85 });
  });

  it('t=200s — purple sectors 는 각 섹터 독립 최소', () => {
    const p = computeAggregateBefore(laps, 'purple_sectors', at(200));
    expect(p.s1).toEqual({ driver_number: 1, sector_duration: 28 });
    expect(p.s2).toEqual({ driver_number: 1, sector_duration: 28 });
    expect(p.s3).toEqual({ driver_number: 1, sector_duration: 29 });
  });

  it('t=200s — personal_bests 는 드라이버별 섹터 독립 최소', () => {
    const pb = computeAggregateBefore(laps, 'personal_bests', at(200));
    expect(pb.get(44)).toEqual({
      driver_number: 44,
      best_lap_duration: 88,
      best_sector_1: 29,
      best_sector_2: 29,
      best_sector_3: 30,
    });
    expect(pb.get(1)?.best_lap_duration).toBe(85);
  });

  it('미래 누설 zero / 시크 일관성 — t=120s 면 lap2 들(177/178s 완료)은 미반영', () => {
    // t=120s 에 완료된 lap: driver44 lap1(end 90), driver1 lap1(end 92) 뿐.
    const f = computeAggregateBefore(laps, 'fastest_lap', at(120));
    expect(f?.lap_duration).toBe(90); // 미래 best 85 가 아니라 90 (driver44 lap1)
    const p = computeAggregateBefore(laps, 'purple_sectors', at(120));
    expect(p.s1?.sector_duration).toBe(30); // 미래 best 28 아님
  });

  it('완료 lap 0건이면 fastest_lap null, purple sector 전부 null', () => {
    const agg = computeAllAggregates(laps, at(10));
    expect(agg.fastest_lap).toBeNull();
    expect(agg.purple_sectors).toEqual({ s1: null, s2: null, s3: null });
    expect(agg.personal_bests.size).toBe(0);
  });
});
