// 시즌 카탈로그 diff — plan main-page-implementation.md §3.3 + 인수 12.
// 캐시된 SeasonData와 OpenF1 백그라운드 fetch 결과를 비교해 변경된 세션 list 반환.
// 보수적 정책: fresh에 없는 session_key는 변경으로 보고하지 않음 (OpenF1 일부 응답 가능성).
// is_cancelled의 false ↔ undefined는 동일 (캔슬되지 않은 상태).

import type { SeasonData } from '../../shared/seasonData';

export type SessionChangeField = 'date_start' | 'date_end' | 'is_cancelled';

export interface SessionChange {
  session_key: number;
  meeting_key: number;
  field: SessionChangeField;
  before: string | boolean | undefined;
  after: string | boolean | undefined;
}

export interface FreshSessionPatch {
  date_start?: string;
  date_end?: string;
  is_cancelled?: boolean;
}

// false ↔ undefined를 동일한 "캔슬되지 않음" 상태로 정규화.
// catalogStore._patchSessions도 같은 동치 규칙을 따라야 하므로 export.
export function normalizeCancelled(v: boolean | undefined): boolean {
  return v === true;
}

export function diffSessions(
  cached: SeasonData,
  fresh: Map<number, FreshSessionPatch>,
): SessionChange[] {
  const changes: SessionChange[] = [];
  for (const meeting of cached.meetings) {
    for (const session of meeting.sessions) {
      const patch = fresh.get(session.session_key);
      if (!patch) continue;

      if (patch.date_start !== undefined && patch.date_start !== session.date_start) {
        changes.push({
          session_key: session.session_key,
          meeting_key: meeting.meeting_key,
          field: 'date_start',
          before: session.date_start,
          after: patch.date_start,
        });
      }
      if (patch.date_end !== undefined && patch.date_end !== session.date_end) {
        changes.push({
          session_key: session.session_key,
          meeting_key: meeting.meeting_key,
          field: 'date_end',
          before: session.date_end,
          after: patch.date_end,
        });
      }
      if (normalizeCancelled(patch.is_cancelled) !== normalizeCancelled(session.is_cancelled)) {
        changes.push({
          session_key: session.session_key,
          meeting_key: meeting.meeting_key,
          field: 'is_cancelled',
          before: session.is_cancelled,
          after: patch.is_cancelled,
        });
      }
    }
  }
  return changes;
}
