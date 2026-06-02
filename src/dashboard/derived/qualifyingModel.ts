// 퀄리파잉 모델 DataSource 와이어링 — derived 레이어(driverOutStatus 와 동일 규약).
// undated `getSessionResult` 직접 접근은 본 derived 레이어에서만 허용된다(futureLeakGuard 는
// panels/**·detailPanel/** 만 스캔). 누설 안전성:
//   - 진행중 순위/세그먼트 베스트 = progressiveSegmentBests (date_start ≤ t flying 랩만, 미래 누설 zero).
//   - session_result(membership) 는 (a) 현재 세그먼트 참가 로스터(해당 시점 과거 사실),
//     (b) 컷라인 진출 인원 카운트(포맷 상수)에만 쓰이고 최종 순위/시간은 노출하지 않는다.

import type { DataSource } from '../../shared/DataSource';
import type { LapRecord, SessionResultRecord } from '../../shared/openf1Types';
import {
  reconstructSegments,
  progressiveSegmentBests,
  activePartAt,
  type QualiPart,
  type SegmentModel,
} from './qualifyingSegments';
import { pitLapsByDriver } from './qualiLapClass';

export interface QualifyingModel {
  t: Date;
  model: SegmentModel;
  /** driver_number → (part → 베스트 초). 미래 누설 zero(시간 컷 flying 랩). */
  bests: Map<number, Map<QualiPart, number>>;
  /** 시각 t 에 진행 중인 세그먼트. 시작 전이면 null. */
  activePart: QualiPart | null;
}

export function buildQualifyingModel(
  ds: DataSource,
  driverNumbers: Iterable<number>,
  t: Date,
): QualifyingModel {
  const raceControl = ds.getAllBefore('race_control', t);
  const results: SessionResultRecord[] = [];
  const allLaps: LapRecord[] = [];
  for (const n of driverNumbers) {
    const r = ds.getSessionResult(n);
    if (r) results.push(r);
    allLaps.push(...ds.getCompletedLapsBefore(n, t));
  }
  const model = reconstructSegments(raceControl, results);
  const bests = progressiveSegmentBests(allLaps, model.boundaries, t, pitLapsByDriver(ds.getAllBefore('pit', t)));
  return { t, model, bests, activePart: activePartAt(model.boundaries, t) };
}
