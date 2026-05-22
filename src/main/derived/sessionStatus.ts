// 세션 상태 판정 — plan main-page-implementation.md §4.1.
// 라이브 윈도우 = [start - 30min, end + 30min) (OpenF1 정책)
// "진짜 진행 중" 구분: startedAgoMs > 0 일 때 UI에서 빨간 점.

import type { SessionData } from '../../shared/seasonData';

export const LIVE_PREROLL_MS = 30 * 60 * 1000;
export const LIVE_POSTROLL_MS = 30 * 60 * 1000;

export type SessionStatus =
  | { kind: 'past'; finishedAgoMs: number }
  | { kind: 'live'; startedAgoMs: number; endsInMs: number }
  | { kind: 'upcoming'; startsInMs: number; liveWindowOpensInMs: number }
  | { kind: 'cancelled' };

export function classify(session: SessionData, now: Date): SessionStatus {
  if (session.is_cancelled) return { kind: 'cancelled' };

  const start = Date.parse(session.date_start);
  const end = Date.parse(session.date_end);
  const t = now.getTime();

  if (t < start - LIVE_PREROLL_MS) {
    return {
      kind: 'upcoming',
      startsInMs: start - t,
      liveWindowOpensInMs: start - LIVE_PREROLL_MS - t,
    };
  }
  if (t < end + LIVE_POSTROLL_MS) {
    return {
      kind: 'live',
      startedAgoMs: t - start,
      endsInMs: end + LIVE_POSTROLL_MS - t,
    };
  }
  return { kind: 'past', finishedAgoMs: t - end };
}
