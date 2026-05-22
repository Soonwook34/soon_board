// sessionRoute 단위 테스트 — plan main-page-implementation.md §6.3, 인수 13 (라우팅 분기).

import { describe, expect, it } from 'vitest';
import { sessionRoute } from '../sessionRoute';
import type { SessionData } from '../../../shared/seasonData';
import type { SessionStatus } from '../sessionStatus';

const session: SessionData = {
  session_key: 9999,
  session_name: 'Race',
  session_type: 'Race',
  date_start: '2024-03-02T15:00:00Z',
  date_end: '2024-03-02T17:00:00Z',
};

describe('sessionRoute', () => {
  it('past → /replay/:key', () => {
    const status: SessionStatus = { kind: 'past', finishedAgoMs: 1000 };
    expect(sessionRoute(session, status)).toBe('/replay/9999');
  });

  it('live → /live/:key', () => {
    const status: SessionStatus = { kind: 'live', startedAgoMs: 0, endsInMs: 3_600_000 };
    expect(sessionRoute(session, status)).toBe('/live/9999');
  });

  it('upcoming → /live/:key', () => {
    const status: SessionStatus = { kind: 'upcoming', startsInMs: 60_000, liveWindowOpensInMs: 0 };
    expect(sessionRoute(session, status)).toBe('/live/9999');
  });

  it('cancelled → null', () => {
    const status: SessionStatus = { kind: 'cancelled' };
    expect(sessionRoute(session, status)).toBeNull();
  });
});
