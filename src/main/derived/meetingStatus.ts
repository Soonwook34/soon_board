// Meeting(GP) 단위 상태 집계 — plan main-page-implementation.md §4.2.
// 우선순위: live > upcoming > past > cancelled (sessions가 없거나 모두 cancelled)

import type { MeetingData, SessionData } from '../../shared/seasonData';
import { classify } from './sessionStatus';

export type MeetingStatus =
  | { kind: 'live' }
  | { kind: 'upcoming'; nearestUpcomingSession: SessionData; startsInMs: number }
  | { kind: 'past' }
  | { kind: 'cancelled' };

export function classifyMeeting(meeting: MeetingData, now: Date): MeetingStatus {
  let hasLive = false;
  let hasPast = false;
  let nearest: { session: SessionData; startsInMs: number } | null = null;

  for (const s of meeting.sessions) {
    const st = classify(s, now);
    if (st.kind === 'live') {
      hasLive = true;
    } else if (st.kind === 'upcoming') {
      if (!nearest || st.startsInMs < nearest.startsInMs) {
        nearest = { session: s, startsInMs: st.startsInMs };
      }
    } else if (st.kind === 'past') {
      hasPast = true;
    }
    // 'cancelled'는 집계에서 무시 — meeting이 cancelled가 되는 조건은 비-cancelled가 0개일 때.
  }

  if (hasLive) return { kind: 'live' };
  if (nearest) {
    return { kind: 'upcoming', nearestUpcomingSession: nearest.session, startsInMs: nearest.startsInMs };
  }
  if (hasPast) return { kind: 'past' };
  return { kind: 'cancelled' };
}
