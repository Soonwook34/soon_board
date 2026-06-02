// 퀄리파잉 탈락 컷라인 — qualifying-session-dashboard.md §3.3 / US-005.
//
// ⚠️ 진출 인원을 규칙으로 하드코딩하지 않는다(5/10/15 리터럴 금지). 데이터에서 파생한다:
//   진출 인원 = 다음 세그먼트 멤버십 크기(SegmentModel.membership). 이로써 2026 시즌 그리드 확장
//   (22대) 처럼 녹아웃 수가 바뀌어도 자동 대응된다 — 리플레이는 항상 실제 도달 인원을 반영.

import type { QualiPart, SegmentModel } from './qualifyingSegments';

export interface CutlineInfo {
  part: QualiPart;
  /** 이 세그먼트 참가(도달) 인원. */
  participants: number;
  /** 다음 세그먼트 진출 인원(데이터 파생). 마지막 세그먼트(Q3)는 null. */
  advancing: number | null;
  /** 컷라인 순위 — 이 순위까지 진출, 그 아래 탈락. 진출=컷라인 순위. Q3=null. */
  cutlinePosition: number | null;
  /** 탈락 인원 = participants - advancing. Q3=null. */
  eliminated: number | null;
}

/** 세그먼트의 컷라인 정보. 진출 인원은 다음 세그먼트 멤버십 크기로 파생(하드코딩 없음). */
export function cutlineFor(model: SegmentModel, part: QualiPart): CutlineInfo {
  const participants = model.membership.get(part)?.size ?? 0;
  const advancing = part < 3 ? (model.membership.get((part + 1) as QualiPart)?.size ?? 0) : null;
  const cutlinePosition = advancing;
  const eliminated = advancing != null ? participants - advancing : null;
  return { part, participants, advancing, cutlinePosition, eliminated };
}

/**
 * 현재 세그먼트 순위(빠른 순 정렬된 driver_number 배열) 중 컷라인 아래(탈락권) 집합.
 * cutlinePosition=15 → index 0..14(P1~P15) 진출, index 15.. 탈락.
 */
export function knockoutZone(
  orderedDrivers: readonly number[],
  cutlinePosition: number | null,
): Set<number> {
  const zone = new Set<number>();
  if (cutlinePosition == null) return zone;
  for (let i = cutlinePosition; i < orderedDrivers.length; i += 1) zone.add(orderedDrivers[i]);
  return zone;
}

/**
 * 컷라인 보유자(진출 마지노선) 대비 각 드라이버의 갭(초). 양수=컷라인보다 느림(탈락권, 따라잡아야 할 시간),
 * 음수=컷라인보다 빠름(진출권). cutlinePosition 무효 시 빈 맵.
 */
export function gapToCutline(
  ordered: readonly { driver_number: number; bestSec: number }[],
  cutlinePosition: number | null,
): Map<number, number> {
  const m = new Map<number, number>();
  if (cutlinePosition == null || cutlinePosition < 1 || cutlinePosition > ordered.length) return m;
  const cutSec = ordered[cutlinePosition - 1].bestSec;
  for (const r of ordered) m.set(r.driver_number, r.bestSec - cutSec);
  return m;
}
