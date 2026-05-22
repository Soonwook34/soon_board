// session_key → SessionData lookup — plan main-page-implementation.md §12 단계 11.
// LiveScreen/ReplayScreen이 URL :key 파싱 후 catalogStore에서 세션 메타를 찾기 위해 사용.
// meeting 정보도 함께 반환 — CountdownOverlay가 meeting_name을 헤더로 표시.

import type { MeetingData, SeasonData, SessionData } from '../shared/seasonData';

export interface FoundSession {
  session: SessionData;
  meeting: MeetingData;
}

export function findSessionByKey(season: SeasonData | null, sessionKey: number): FoundSession | null {
  if (!season) return null;
  for (const meeting of season.meetings) {
    for (const session of meeting.sessions) {
      if (session.session_key === sessionKey) return { session, meeting };
    }
  }
  return null;
}
