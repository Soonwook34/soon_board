// Hero용 다음 세션 선택 — plan main-page-implementation.md §4.4.
// 우선순위:
//   1) live 세션 있으면 그것 (여러 개면 startedAgoMs 최소 = 가장 최근 시작)
//   2) live 없으면 가장 빠른 upcoming (startsInMs 최소)
//   3) 모두 past면 가장 최근에 끝난 past (finishedAgoMs 최소)
//   4) 아무것도 없으면 null

import type { MeetingData, SeasonData, SessionData } from '../../shared/seasonData';
import { classify, type SessionStatus } from './sessionStatus';

export interface HeroSelection {
  session: SessionData;
  meeting: MeetingData;
  status: SessionStatus;
}

export function nextHeroSession(seasons: SeasonData[], now: Date): HeroSelection | null {
  const all: { session: SessionData; meeting: MeetingData; status: SessionStatus }[] = [];
  for (const s of seasons) {
    for (const m of s.meetings) {
      for (const sess of m.sessions) {
        all.push({ session: sess, meeting: m, status: classify(sess, now) });
      }
    }
  }

  const live = all.filter((x) => x.status.kind === 'live');
  if (live.length > 0) {
    live.sort((a, b) => {
      const ams = a.status.kind === 'live' ? a.status.startedAgoMs : 0;
      const bms = b.status.kind === 'live' ? b.status.startedAgoMs : 0;
      return Math.abs(ams) - Math.abs(bms);
    });
    return live[0];
  }

  const upcoming = all.filter((x) => x.status.kind === 'upcoming');
  if (upcoming.length > 0) {
    upcoming.sort((a, b) => {
      const ams = a.status.kind === 'upcoming' ? a.status.startsInMs : Infinity;
      const bms = b.status.kind === 'upcoming' ? b.status.startsInMs : Infinity;
      return ams - bms;
    });
    return upcoming[0];
  }

  const past = all.filter((x) => x.status.kind === 'past');
  if (past.length > 0) {
    past.sort((a, b) => {
      const ams = a.status.kind === 'past' ? a.status.finishedAgoMs : Infinity;
      const bms = b.status.kind === 'past' ? b.status.finishedAgoMs : Infinity;
      return ams - bms;
    });
    return past[0];
  }

  return null;
}
