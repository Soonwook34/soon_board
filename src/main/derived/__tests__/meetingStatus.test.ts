import { describe, expect, it } from 'vitest';
import { classifyMeeting } from '../meetingStatus';
import type { MeetingData, SessionData } from '../../../shared/seasonData';

function mkSession(
  override: Partial<SessionData> & Pick<SessionData, 'date_start' | 'date_end'>,
): SessionData {
  return {
    session_key: 0,
    session_name: 'Race',
    session_type: 'Race',
    is_cancelled: false,
    ...override,
  };
}

function mkMeeting(sessions: SessionData[]): MeetingData {
  return {
    meeting_key: 100,
    meeting_name: 'Test GP',
    sessions,
  };
}

const NOW = new Date('2024-03-02T16:00:00+00:00'); // mid-race for baseline

describe('classifyMeeting', () => {
  it('returns live when at least one session is live', () => {
    const m = mkMeeting([
      mkSession({ date_start: '2024-03-01T10:00:00+00:00', date_end: '2024-03-01T11:00:00+00:00' }), // past
      mkSession({ date_start: '2024-03-02T15:00:00+00:00', date_end: '2024-03-02T17:00:00+00:00' }), // live (NOW is mid-race)
    ]);
    expect(classifyMeeting(m, NOW).kind).toBe('live');
  });

  it('returns upcoming with nearestUpcomingSession when no live but some upcoming', () => {
    const nearer = mkSession({
      session_key: 1,
      date_start: '2024-03-03T15:00:00+00:00',
      date_end: '2024-03-03T17:00:00+00:00',
    });
    const farther = mkSession({
      session_key: 2,
      date_start: '2024-03-10T15:00:00+00:00',
      date_end: '2024-03-10T17:00:00+00:00',
    });
    const past = mkSession({
      session_key: 3,
      date_start: '2024-03-01T10:00:00+00:00',
      date_end: '2024-03-01T11:00:00+00:00',
    });
    const m = mkMeeting([farther, past, nearer]);
    const status = classifyMeeting(m, NOW);
    expect(status.kind).toBe('upcoming');
    if (status.kind === 'upcoming') {
      expect(status.nearestUpcomingSession.session_key).toBe(1);
    }
  });

  it('returns past when all sessions are past', () => {
    const m = mkMeeting([
      mkSession({ date_start: '2024-03-01T10:00:00+00:00', date_end: '2024-03-01T11:00:00+00:00' }),
      mkSession({ date_start: '2024-03-01T13:00:00+00:00', date_end: '2024-03-01T14:00:00+00:00' }),
    ]);
    expect(classifyMeeting(m, NOW).kind).toBe('past');
  });

  it('returns cancelled when all sessions are cancelled', () => {
    const m = mkMeeting([
      mkSession({
        date_start: '2024-03-02T15:00:00+00:00',
        date_end: '2024-03-02T17:00:00+00:00',
        is_cancelled: true,
      }),
      mkSession({
        date_start: '2024-03-03T15:00:00+00:00',
        date_end: '2024-03-03T17:00:00+00:00',
        is_cancelled: true,
      }),
    ]);
    expect(classifyMeeting(m, NOW).kind).toBe('cancelled');
  });

  it('returns cancelled when sessions array is empty', () => {
    expect(classifyMeeting(mkMeeting([]), NOW).kind).toBe('cancelled');
  });

  it('live wins over upcoming even when upcoming is closer in count', () => {
    const m = mkMeeting([
      mkSession({ date_start: '2024-03-02T15:00:00+00:00', date_end: '2024-03-02T17:00:00+00:00' }), // live
      mkSession({ date_start: '2024-03-03T15:00:00+00:00', date_end: '2024-03-03T17:00:00+00:00' }), // upcoming
      mkSession({ date_start: '2024-03-04T15:00:00+00:00', date_end: '2024-03-04T17:00:00+00:00' }), // upcoming
    ]);
    expect(classifyMeeting(m, NOW).kind).toBe('live');
  });

  it('upcoming is selected over past when both present (priority order)', () => {
    const m = mkMeeting([
      mkSession({ date_start: '2024-03-01T10:00:00+00:00', date_end: '2024-03-01T11:00:00+00:00' }), // past
      mkSession({ date_start: '2024-03-03T15:00:00+00:00', date_end: '2024-03-03T17:00:00+00:00' }), // upcoming
    ]);
    expect(classifyMeeting(m, NOW).kind).toBe('upcoming');
  });
});
