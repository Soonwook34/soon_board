// dashboard §2.4 — race_control flag 종류 판정. flag/category 필드만 사용 (message 텍스트는
// 표시용, SafetyCar 종료만 message 보조 파싱). plan §10 위험: 자유텍스트 파싱 부정확 회피.

import type { RaceControlRecord } from '../../shared/openf1Types';

/** GREEN/CLEAR 잔상 표시 시간 (§2.4: 5초 후 사라짐). */
export const GREEN_CLEAR_TTL_MS = 5_000;

export type FlagKind =
  | 'chequered'
  | 'red'
  | 'yellow'
  | 'green'
  | 'clear'
  | 'safetycar'
  | 'other';

export function flagKind(rc: Pick<RaceControlRecord, 'flag' | 'category' | 'message'>): FlagKind {
  const flag = (rc.flag ?? '').toUpperCase();
  const cat = (rc.category ?? '').toLowerCase();
  const msg = (rc.message ?? '').toUpperCase();
  if (flag === 'CHEQUERED' || msg.includes('CHEQUERED')) return 'chequered';
  if (cat.includes('safetycar') || cat.includes('safety car') || msg.includes('SAFETY CAR')) return 'safetycar';
  if (flag === 'RED') return 'red';
  if (flag === 'DOUBLE YELLOW' || flag === 'YELLOW') return 'yellow';
  if (flag === 'GREEN') return 'green';
  if (flag === 'CLEAR') return 'clear';
  return 'other';
}

/** SafetyCar 종료 메시지 휴리스틱 (예: "SAFETY CAR IN THIS LAP"). */
export function isSafetyCarEnding(rc: Pick<RaceControlRecord, 'message'>): boolean {
  const msg = (rc.message ?? '').toUpperCase();
  return msg.includes('IN THIS LAP') || msg.includes('SAFETY CAR IN');
}
