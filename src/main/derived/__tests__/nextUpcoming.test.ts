import { describe, expect, it } from 'vitest';
import { nextHeroSession } from '../nextUpcoming';
import type { MeetingData, SeasonData, SessionData } from '../../../shared/seasonData';

const NOW = new Date('2024-03-02T16:00:00+00:00');

function mkSession(
  override: Partial<SessionData> & Pick<SessionData, 'date_start' | 'date_end'>,
): SessionData {
  return { session_key: 0, session_name: 'Race', session_type: 'Race', ...override };
}
function mkMeeting(sessions: SessionData[], key = 1): MeetingData {
  return { meeting_key: key, meeting_name: `M${key}`, sessions };
}
function mkSeason(meetings: MeetingData[], year = 2024): SeasonData {
  return { year, generated_at: NOW.toISOString(), source: 'test', meetings };
}

describe('nextHeroSession', () => {
  it('returns null when no sessions at all', () => {
    expect(nextHeroSession([mkSeason([])], NOW)).toBeNull();
  });

  it('returns null when seasons array is empty', () => {
    expect(nextHeroSession([], NOW)).toBeNull();
  });

  it('returns the live session when one is in progress', () => {
    const live = mkSession({
      session_key: 9,
      date_start: '2024-03-02T15:00:00+00:00',
      date_end: '2024-03-02T17:00:00+00:00',
    });
    const upcoming = mkSession({
      session_key: 10,
      date_start: '2024-03-03T15:00:00+00:00',
      date_end: '2024-03-03T17:00:00+00:00',
    });
    const pick = nextHeroSession([mkSeason([mkMeeting([live, upcoming])])], NOW);
    expect(pick).not.toBeNull();
    expect(pick!.session.session_key).toBe(9);
    expect(pick!.status.kind).toBe('live');
  });

  it('picks the nearest upcoming when no live present', () => {
    const farther = mkSession({
      session_key: 21,
      date_start: '2024-03-10T15:00:00+00:00',
      date_end: '2024-03-10T17:00:00+00:00',
    });
    const nearer = mkSession({
      session_key: 22,
      date_start: '2024-03-03T15:00:00+00:00',
      date_end: '2024-03-03T17:00:00+00:00',
    });
    const past = mkSession({
      session_key: 23,
      date_start: '2024-03-01T10:00:00+00:00',
      date_end: '2024-03-01T11:00:00+00:00',
    });
    const pick = nextHeroSession(
      [mkSeason([mkMeeting([farther, past], 1), mkMeeting([nearer], 2)])],
      NOW,
    );
    expect(pick!.session.session_key).toBe(22);
    expect(pick!.status.kind).toBe('upcoming');
  });

  it('falls back to most recently finished past when all sessions are past', () => {
    const older = mkSession({
      session_key: 31,
      date_start: '2023-12-01T10:00:00+00:00',
      date_end: '2023-12-01T11:00:00+00:00',
    });
    const newer = mkSession({
      session_key: 32,
      date_start: '2024-02-25T10:00:00+00:00',
      date_end: '2024-02-25T11:00:00+00:00',
    });
    const pick = nextHeroSession([mkSeason([mkMeeting([older, newer])])], NOW);
    expect(pick!.session.session_key).toBe(32);
    expect(pick!.status.kind).toBe('past');
  });

  it('searches across multiple seasons', () => {
    const past2023 = mkSession({
      session_key: 41,
      date_start: '2023-12-01T10:00:00+00:00',
      date_end: '2023-12-01T11:00:00+00:00',
    });
    const upcoming2024 = mkSession({
      session_key: 42,
      date_start: '2024-03-15T15:00:00+00:00',
      date_end: '2024-03-15T17:00:00+00:00',
    });
    const pick = nextHeroSession(
      [
        mkSeason([mkMeeting([past2023], 100)], 2023),
        mkSeason([mkMeeting([upcoming2024], 200)], 2024),
      ],
      NOW,
    );
    expect(pick!.session.session_key).toBe(42);
  });
});
