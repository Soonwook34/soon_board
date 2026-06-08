// searchFilter 단위 테스트 — plan main-page-implementation.md §7, 인수 8/9.

import { describe, expect, it } from 'vitest';
import {
  filterMeetings,
  matchSearch,
  matchSessionType,
} from '../searchFilter';
import type { MeetingData, SessionData } from '../../../shared/seasonData';
import type { SessionTypeFilter, StatusFilter } from '../../stores/uiStore';

function mkSession(override: Partial<SessionData>): SessionData {
  return {
    session_key: 1,
    session_name: 'Race',
    session_type: 'Race',
    date_start: '2024-03-02T15:00:00+00:00',
    date_end: '2024-03-02T17:00:00+00:00',
    is_cancelled: false,
    ...override,
  };
}

function mkMeeting(override: Partial<MeetingData>): MeetingData {
  return {
    meeting_key: 100,
    meeting_name: 'Bahrain Grand Prix',
    location: 'Sakhir',
    country_name: 'Bahrain',
    circuit_short_name: 'Sakhir',
    sessions: [
      mkSession({ session_key: 1, session_type: 'Practice', date_start: '2024-02-29T11:30:00+00:00', date_end: '2024-02-29T12:30:00+00:00' }),
      mkSession({ session_key: 2, session_type: 'Qualifying', date_start: '2024-03-01T15:00:00+00:00', date_end: '2024-03-01T16:00:00+00:00' }),
      mkSession({ session_key: 3, session_type: 'Race', date_start: '2024-03-02T15:00:00+00:00', date_end: '2024-03-02T17:00:00+00:00' }),
    ],
    ...override,
  };
}

const NOW = new Date('2024-03-02T16:00:00+00:00');

describe('matchSearch', () => {
  it('returns true when query is empty', () => {
    expect(matchSearch(mkMeeting({}), '')).toBe(true);
    expect(matchSearch(mkMeeting({}), '   ')).toBe(true);
  });

  it('matches case-insensitively against meeting_name', () => {
    expect(matchSearch(mkMeeting({}), 'BAHRAIN')).toBe(true);
    expect(matchSearch(mkMeeting({}), 'bahrain')).toBe(true);
    expect(matchSearch(mkMeeting({}), 'grand prix')).toBe(true);
  });

  it('matches against location, country_name, circuit_short_name', () => {
    expect(matchSearch(mkMeeting({}), 'sakhir')).toBe(true);
    expect(matchSearch(mkMeeting({ meeting_name: 'X', circuit_short_name: 'X', location: 'X' }), 'bahrain')).toBe(true);
  });

  it('returns false when no field matches', () => {
    expect(matchSearch(mkMeeting({}), 'monaco')).toBe(false);
  });

  it('tolerates missing optional fields', () => {
    const m: MeetingData = { meeting_key: 1, meeting_name: 'Monaco Grand Prix', sessions: [] };
    expect(matchSearch(m, 'monaco')).toBe(true);
    expect(matchSearch(m, 'sakhir')).toBe(false);
  });
});

describe('matchSessionType', () => {
  it('returns false when selected set is empty', () => {
    const empty = new Set<SessionTypeFilter>();
    expect(matchSessionType(mkSession({ session_type: 'Race' }), empty)).toBe(false);
  });

  it('returns true only when normalized type ∈ selected', () => {
    const sel = new Set<SessionTypeFilter>(['race']);
    expect(matchSessionType(mkSession({ session_type: 'Race' }), sel)).toBe(true);
    expect(matchSessionType(mkSession({ session_type: 'Qualifying' }), sel)).toBe(false);
  });
});

describe('filterMeetings', () => {
  const allTypes = new Set<SessionTypeFilter>(['race', 'qualifying', 'sprint', 'sprint_qualifying', 'practice']);
  const defaultStatuses = new Set<StatusFilter>(['past', 'live', 'upcoming']);

  it('passes everything with empty query and default filters', () => {
    const m = mkMeeting({});
    const res = filterMeetings([m], { search: '', sessionTypes: allTypes, statuses: defaultStatuses }, NOW);
    expect(res).toHaveLength(1);
    expect(res[0].meeting.meeting_key).toBe(100);
    expect(res[0].status.kind).toBe('live'); // NOW 3/2 16:00 → Race(15:00-17:00) live
  });

  it('drops meetings whose name does not match search', () => {
    const monaco = mkMeeting({ meeting_key: 2, meeting_name: 'Monaco GP', location: 'Monte Carlo', country_name: 'Monaco', circuit_short_name: 'Monaco' });
    const res = filterMeetings([mkMeeting({}), monaco], { search: 'monaco', sessionTypes: allTypes, statuses: defaultStatuses }, NOW);
    expect(res).toHaveLength(1);
    expect(res[0].meeting.meeting_key).toBe(2);
  });

  it('drops meetings whose GP-level status is not in statuses filter', () => {
    const sel = new Set<StatusFilter>(['past']);
    const res = filterMeetings([mkMeeting({})], { search: '', sessionTypes: allTypes, statuses: sel }, NOW);
    expect(res).toHaveLength(0); // NOW is mid-race → live, not past
  });

  it('drops meetings whose sessions cannot pass the session type filter', () => {
    // Only Practice sessions but filter excludes Practice → drop
    const practiceOnly = mkMeeting({
      meeting_key: 5,
      sessions: [mkSession({ session_type: 'Practice', date_start: '2024-03-02T15:00:00+00:00', date_end: '2024-03-02T17:00:00+00:00' })],
    });
    const sel = new Set<SessionTypeFilter>(['race']);
    const res = filterMeetings([practiceOnly], { search: '', sessionTypes: sel, statuses: defaultStatuses }, NOW);
    expect(res).toHaveLength(0);
  });

  it('keeps meeting when at least one session passes type filter', () => {
    const sel = new Set<SessionTypeFilter>(['race']);
    const res = filterMeetings([mkMeeting({})], { search: '', sessionTypes: sel, statuses: defaultStatuses }, NOW);
    expect(res).toHaveLength(1);
  });

  it('returns empty when all filters intersect to zero', () => {
    const empty = new Set<SessionTypeFilter>();
    const res = filterMeetings([mkMeeting({})], { search: '', sessionTypes: empty, statuses: defaultStatuses }, NOW);
    expect(res).toHaveLength(0);
  });

  it('drops everything when statuses set is empty (inlined matchMeetingStatus guard)', () => {
    const noStatuses = new Set<StatusFilter>();
    const res = filterMeetings([mkMeeting({})], { search: '', sessionTypes: allTypes, statuses: noStatuses }, NOW);
    expect(res).toHaveLength(0);
  });
});
