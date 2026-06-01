// dashboard §2.4 — race_control "현재 활성 메시지 1건" 판정 (still-active).
//
// 각 flag 는 직전 상태를 supersede 한다. t 시점에 발생한(date≤t) 마지막 flag-bearing 메시지를
// 찾아 그 종류에 따라 활성/만료를 결정:
//  - CHEQUERED: 세션 끝까지 활성
//  - GREEN/CLEAR: 발생 후 5초만 표시 후 만료 (그 이전 상태도 해제됨)
//  - RED / YELLOW / DOUBLE YELLOW: 활성 (다음 flag 가 supersede 할 때까지)
//  - SafetyCar: 종료 메시지면 만료, 아니면 활성
//
// 미래 누설 zero: date≤t 만 고려 (인수 9, §4.5 (d) 이벤트 티커와 동일 정책).

import type { RaceControlRecord } from '../../shared/openf1Types';
import { flagKind, isSafetyCarEnding, GREEN_CLEAR_TTL_MS, type FlagKind } from '../shared/flagDecoder';

export interface ActiveFlag {
  record: RaceControlRecord;
  kind: FlagKind;
}

export function activeFlag(messages: readonly RaceControlRecord[], t: Date): ActiveFlag | null {
  const tMs = t.valueOf();
  let latest: RaceControlRecord | null = null;
  for (const m of messages) {
    if (!(m.date instanceof Date) || m.date.valueOf() > tMs) continue;
    if (flagKind(m) === 'other') continue; // flag 없는 정보성 메시지는 상태에 영향 없음
    if (!latest || m.date.valueOf() >= latest.date.valueOf()) latest = m;
  }
  if (!latest) return null;

  const kind = flagKind(latest);
  switch (kind) {
    case 'chequered':
      return { record: latest, kind };
    case 'green':
    case 'clear':
      return tMs - latest.date.valueOf() <= GREEN_CLEAR_TTL_MS ? { record: latest, kind } : null;
    case 'safetycar':
      return isSafetyCarEnding(latest) ? null : { record: latest, kind };
    default: // 'red' | 'yellow'
      return { record: latest, kind };
  }
}
