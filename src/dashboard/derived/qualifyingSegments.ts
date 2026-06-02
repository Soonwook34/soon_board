// 퀄리파잉 세그먼트 재구성 — qualifying-session-dashboard.md §3.3 / US-004.
//
// OpenF1 는 각 랩에 Q1/Q2/Q3 태그를 주지 않으므로 직접 재구성한다. 두 권위 신호를 결합:
//  (1) 경계(시간 구간): race_control 의 qualifying_phase(1/2/3) + flag.
//      실데이터(SK 9468): 각 phase 는 GREEN('PIT EXIT OPEN')=시작, CHEQUERED=종료 로 정확히 bracket.
//  (2) 멤버십/세그먼트 베스트(확정): session_result.duration 배열의 **non-null 항목 수**.
//      ⚠️ 배열 길이가 아니라 non-null 수로 판정(실데이터: 배열 길이 항상 3, 비도달 세그먼트=null).
//      duration[k-1] != null ⇔ 드라이버가 part k 에 도달. 그 값 = part k 베스트랩(초).
//
// 미래 누설 규율(§1.1, driverOutAt 와 동일): session_result 는 undated(세션 종료값)이므로
//  "확정/최종 뷰"에만 사용. 진행 중(시각 t) 순위/세그먼트 베스트는 progressiveSegmentBests 가
//  date_start ≤ t 인 flying 랩만으로 계산한다(미래 누설 zero).

import type { LapRecord, RaceControlRecord, SessionResultRecord } from '../../shared/openf1Types';
import { classifyLap } from './qualiLapClass';

export type QualiPart = 1 | 2 | 3;

export interface SegmentBoundary {
  part: QualiPart;
  /** 세그먼트 시작(ms). GREEN(pit exit open) 이벤트. 미검출 시 null. */
  startMs: number | null;
  /** 세그먼트 종료(ms). CHEQUERED 이벤트. 미검출 시 null. */
  endMs: number | null;
}

export interface SegmentModel {
  /** 존재하는 세그먼트(최대 3), part 오름차순. */
  boundaries: SegmentBoundary[];
  /** 경계를 전부 phase-tagged 이벤트로 도출했으면 'phase', 폴백/보간이 있었으면 'clustered'. */
  confidence: 'phase' | 'clustered';
  /** part → 그 세그먼트에 **도달한** driver_number 집합 (session_result non-null 기반). */
  membership: Map<QualiPart, Set<number>>;
}

const PARTS: readonly QualiPart[] = [1, 2, 3];

/** session_result.duration 의 part k(1-based) 베스트랩(초). 비도달/비배열 시 null. */
export function segmentBestFromResult(res: SessionResultRecord, part: QualiPart): number | null {
  const dur = res.duration;
  if (!Array.isArray(dur)) return null;
  const v = dur[part - 1];
  return typeof v === 'number' ? v : null;
}

/** 드라이버가 도달한 가장 깊은 세그먼트(non-null 항목 수). 0=기록 없음. */
export function reachedPart(res: SessionResultRecord): 0 | QualiPart {
  const dur = res.duration;
  if (!Array.isArray(dur)) return 0;
  let n = 0;
  for (const v of dur) if (typeof v === 'number') n += 1;
  return Math.min(n, 3) as 0 | QualiPart;
}

/**
 * 확정 세그먼트 모델. race_control + session_result 전체로 재구성.
 * 라이브 진행 중에는 race_control 이 t 까지만 들어오므로, 호출처가 시간 컷된 배열을 넘기면
 * "현재까지 시작/종료된 세그먼트"만 자연히 반영된다(getAllBefore('race_control', t)).
 */
export function reconstructSegments(
  raceControl: readonly RaceControlRecord[],
  sessionResult: readonly SessionResultRecord[],
): SegmentModel {
  const membership = new Map<QualiPart, Set<number>>();
  for (const part of PARTS) membership.set(part, new Set<number>());
  for (const res of sessionResult) {
    const reached = reachedPart(res);
    for (const part of PARTS) {
      if (part <= reached) membership.get(part)!.add(res.driver_number);
    }
  }

  // phase-tagged GREEN/CHEQUERED 로 경계 도출.
  const boundaries: SegmentBoundary[] = [];
  let allFromPhase = true;
  for (const part of PARTS) {
    const phaseEvents = raceControl.filter((r) => r.qualifying_phase === part);
    const greens = phaseEvents
      .filter((r) => r.flag === 'GREEN')
      .map((r) => r.date.getTime())
      .sort((a, b) => a - b);
    const chequereds = phaseEvents
      .filter((r) => r.flag === 'CHEQUERED')
      .map((r) => r.date.getTime())
      .sort((a, b) => a - b);

    const hasMembers = (membership.get(part)?.size ?? 0) > 0;
    const hasEvents = phaseEvents.length > 0;
    if (!hasMembers && !hasEvents) continue; // 발생하지 않은 세그먼트

    const startMs = greens.length > 0 ? greens[0] : null;
    const endMs = chequereds.length > 0 ? chequereds[chequereds.length - 1] : null;
    if (startMs == null || endMs == null) allFromPhase = false;
    boundaries.push({ part, startMs, endMs });
  }

  return {
    boundaries,
    confidence: allFromPhase && boundaries.length > 0 ? 'phase' : 'clustered',
    membership,
  };
}

/** 랩이 속한 세그먼트(date_start 를 경계 윈도우에 매핑). 경계 밖/날짜 없음 → null. */
export function lapPhaseOf(lap: LapRecord, boundaries: readonly SegmentBoundary[]): QualiPart | null {
  if (lap.date_start == null) return null;
  const ms = lap.date_start.getTime();
  for (const b of boundaries) {
    const afterStart = b.startMs == null || ms >= b.startMs;
    const beforeEnd = b.endMs == null || ms <= b.endMs;
    if (afterStart && beforeEnd) return b.part;
  }
  return null;
}

/** boundaries 중 startMs ≤ t 인 가장 깊은 세그먼트(=현재 진행 세그먼트). 시작 전이면 null. */
export function activePartAt(boundaries: readonly SegmentBoundary[], t: Date): QualiPart | null {
  const ms = t.getTime();
  let active: QualiPart | null = null;
  for (const b of boundaries) if (b.startMs != null && b.startMs <= ms) active = b.part;
  return active;
}

const NO_PITS: ReadonlySet<number> = new Set<number>();

/**
 * 진행 중(시각 t)의 세그먼트별 드라이버 베스트랩(초). **미래 누설 zero** — date_start ≤ t 인
 * flying 랩만 반영하고 session_result(세션 종료값)는 절대 쓰지 않는다.
 * pitLapsByDriver 제공 시 in-lap(핏 진입 랩)도 제외(qualiLapClass SSOT). 미제공 시 아웃/미완만 제외.
 * 반환: driver_number → (part → 베스트 초).
 */
export function progressiveSegmentBests(
  laps: readonly LapRecord[],
  boundaries: readonly SegmentBoundary[],
  t: Date,
  pitLapsByDriver?: ReadonlyMap<number, ReadonlySet<number>>,
): Map<number, Map<QualiPart, number>> {
  const tMs = t.getTime();
  const out = new Map<number, Map<QualiPart, number>>();
  for (const lap of laps) {
    if (lap.date_start == null || lap.date_start.getTime() > tMs) continue; // 시간 컷
    const pitLaps = pitLapsByDriver?.get(lap.driver_number) ?? NO_PITS;
    if (classifyLap(lap, pitLaps) !== 'flying') continue;
    const part = lapPhaseOf(lap, boundaries);
    if (part == null) continue;
    const dur = lap.lap_duration as number;
    let byPart = out.get(lap.driver_number);
    if (!byPart) {
      byPart = new Map<QualiPart, number>();
      out.set(lap.driver_number, byPart);
    }
    const prev = byPart.get(part);
    if (prev == null || dur < prev) byPart.set(part, dur);
  }
  return out;
}
