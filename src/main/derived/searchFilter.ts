// 검색·필터 매칭 — plan main-page-implementation.md §7.
// pure 함수 (uiStore/React 의존 없음 — 단위 테스트 가능, derived/__tests__/searchFilter.test.ts).
//
// 매칭 정책:
//   - search: meeting.meeting_name / location / country_name / circuit_short_name 4필드 OR (case-insensitive substring)
//   - session_types: session.session_type → 정규화(SessionTypeFilter) → ui.sessionTypes 멤버십. set이 비면 어떤 세션도 통과 X
//   - status: GP 단위 status (classifyMeeting) → ui.statuses 멤버십 (plan §7.2 "GP 단위로 판정")
//   - 필터 통과 조건: matchSearch ∧ status 멤버십(statuses.has) ∧ (visible session 1개 이상) — filterMeetings 가 결합
//   - visible session = matchSessionTypes (현재 phase는 GP 가시성만 영향; ExpandedSessions 내부 세션 필터링은 스코프 밖)

import type { MeetingData, SessionData } from '../../shared/seasonData';
import type { SessionTypeFilter, UiState } from '../stores/uiStore';
import { resolveSessionKind } from '../../shared/sessionKind';
import { classifyMeeting, type MeetingStatus } from './meetingStatus';

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

export function matchSessionType(
  session: SessionData,
  selected: ReadonlySet<SessionTypeFilter>,
): boolean {
  if (selected.size === 0) return false;
  const norm = resolveSessionKind(session.session_type, session.session_name);
  return norm !== null && selected.has(norm);
}

export interface MeetingWithStatus {
  meeting: MeetingData;
  status: MeetingStatus;
}

/**
 * 검색·세션타입·status 필터를 통과한 GP를 그 status 와 함께 반환.
 * classifyMeeting 을 살아남은 GP 당 1회만 계산해 GpGrid 가 카드 렌더에 재사용(틱당 중복 분류 제거).
 * status 멤버십: 빈 set → 통과 0건(statuses.has 가 항상 false), 아니면 statuses.has(kind) 판정.
 */
export function filterMeetings(
  meetings: readonly MeetingData[],
  ui: Pick<UiState, 'search' | 'sessionTypes' | 'statuses'>,
  now: Date,
): MeetingWithStatus[] {
  const out: MeetingWithStatus[] = [];
  for (const m of meetings) {
    if (!matchSearch(m, ui.search)) continue;
    // visible session 1개 이상 — session type 필터에 부합하는 세션이 있어야 GP 카드 노출
    if (!m.sessions.some((s) => matchSessionType(s, ui.sessionTypes))) continue;
    const status = classifyMeeting(m, now);
    if (!ui.statuses.has(status.kind)) continue;
    out.push({ meeting: m, status });
  }
  return out;
}
