// 검색·필터 매칭 — plan main-page-implementation.md §7.
// pure 함수 (uiStore/React 의존 없음 — 단위 테스트 가능, derived/__tests__/searchFilter.test.ts).
//
// 매칭 정책:
//   - search: meeting.meeting_name / location / country_name / circuit_short_name 4필드 OR (case-insensitive substring)
//   - session_types: session.session_type → 정규화(SessionTypeFilter) → ui.sessionTypes 멤버십. set이 비면 어떤 세션도 통과 X
//   - status: GP 단위 status (classifyMeeting) → ui.statuses 멤버십 (plan §7.2 "GP 단위로 판정")
//   - 필터 통과 조건: matchSearch ∧ matchMeetingStatus ∧ (visible session 1개 이상)
//   - visible session = matchSessionTypes (현재 phase는 GP 가시성만 영향; ExpandedSessions 내부 세션 필터링은 스코프 밖)

import type { MeetingData, SessionData } from '../../shared/seasonData';
import type { SessionTypeFilter, StatusFilter, UiState } from '../stores/uiStore';
import { classifyMeeting } from './meetingStatus';

export function matchSearch(meeting: MeetingData, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  const fields = [
    meeting.meeting_name,
    meeting.location,
    meeting.country_name,
    meeting.circuit_short_name,
  ];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(q));
}

export function normalizeSessionType(sessionType: string): SessionTypeFilter | null {
  const t = sessionType.trim().toLowerCase();
  if (t === 'race') return 'race';
  if (t === 'qualifying') return 'qualifying';
  if (t === 'sprint') return 'sprint';
  if (t === 'sprint qualifying' || t === 'sprint shootout') return 'sprint_qualifying';
  if (t === 'practice') return 'practice';
  return null;
}

export function matchSessionType(
  session: SessionData,
  selected: ReadonlySet<SessionTypeFilter>,
): boolean {
  if (selected.size === 0) return false;
  const norm = normalizeSessionType(session.session_type);
  return norm !== null && selected.has(norm);
}

export function matchMeetingStatus(
  meeting: MeetingData,
  selected: ReadonlySet<StatusFilter>,
  now: Date,
): boolean {
  if (selected.size === 0) return false;
  const kind = classifyMeeting(meeting, now).kind;
  return selected.has(kind);
}

export function filterMeetings(
  meetings: readonly MeetingData[],
  ui: Pick<UiState, 'search' | 'sessionTypes' | 'statuses'>,
  now: Date,
): MeetingData[] {
  return meetings.filter((m) => {
    if (!matchSearch(m, ui.search)) return false;
    if (!matchMeetingStatus(m, ui.statuses, now)) return false;
    // visible session 1개 이상 — session type 필터에 부합하는 세션이 있어야 GP 카드 노출
    return m.sessions.some((s) => matchSessionType(s, ui.sessionTypes));
  });
}
