// session_key → SessionData lookup — plan main-page-implementation.md §12 단계 11.
// LiveScreen/ReplayScreen이 URL :key 파싱 후 catalogStore에서 세션 메타를 찾기 위해 사용.
// meeting 정보도 함께 반환 — CountdownOverlay가 meeting_name을 헤더로 표시.

import type { MeetingData, SeasonData, SessionData } from '../shared/seasonData';

export interface FoundSession {
  session: SessionData;
  meeting: MeetingData;
}

/** 다년도 검색 결과 — replay 가 올바른 년도의 trackOutlines/ReplayDataSource 를 사용하도록 year 도 함께 반환. */
export interface FoundSessionWithYear extends FoundSession {
  year: number;
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

/**
 * 여러 시즌에서 session_key 를 검색 — ReplayScreen 이 사용자가 입력한 :key 의 년도를 모르기 때문에 필요.
 * 적재된 시즌만 탐색하므로 호출 측은 모든 년도를 loadSeason() 으로 미리 끌어와야 한다.
 */
export function findSessionAcrossSeasons(
  seasons: readonly SeasonData[],
  sessionKey: number,
): FoundSessionWithYear | null {
  for (const season of seasons) {
    const found = findSessionByKey(season, sessionKey);
    if (found) return { ...found, year: season.year };
  }
  return null;
}
