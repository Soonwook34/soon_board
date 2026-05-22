// 세션 클릭 시 라우트 결정 — plan main-page-implementation.md §6.3, 인수 13.
// PAST → /replay/:key, LIVE/UPCOMING → /live/:key, cancelled → null (navigation 없음).

import type { SessionData } from '../../shared/seasonData';
import type { SessionStatus } from './sessionStatus';

export function sessionRoute(session: SessionData, status: SessionStatus): string | null {
  if (status.kind === 'cancelled') return null;
  if (status.kind === 'past') return `/replay/${session.session_key}`;
  return `/live/${session.session_key}`;
}
