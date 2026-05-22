import { describe, expect, it } from 'vitest';
import { findSessionByKey } from '../findSessionByKey';
import type { SeasonData } from '../../shared/seasonData';

const SAMPLE: SeasonData = {
  year: 2026,
  generated_at: '2026-01-01T00:00:00Z',
  source: 'openf1.org/v1',
  meetings: [
    {
      meeting_key: 1,
      meeting_name: 'Australian GP',
      sessions: [
        { session_key: 100, session_name: 'P1', session_type: 'Practice', date_start: 'x', date_end: 'y' },
        { session_key: 101, session_name: 'Race', session_type: 'Race', date_start: 'x', date_end: 'y' },
      ],
    },
    {
      meeting_key: 2,
      meeting_name: 'Chinese GP',
      sessions: [
        { session_key: 200, session_name: 'Q', session_type: 'Qualifying', date_start: 'x', date_end: 'y' },
      ],
    },
  ],
};

describe('findSessionByKey', () => {
  it('returns the session and its meeting when key matches', () => {
    const out = findSessionByKey(SAMPLE, 101);
    expect(out).not.toBeNull();
    expect(out!.session.session_key).toBe(101);
    expect(out!.meeting.meeting_name).toBe('Australian GP');
  });

  it('finds sessions in other meetings (not just first)', () => {
    const out = findSessionByKey(SAMPLE, 200);
    expect(out!.meeting.meeting_key).toBe(2);
    expect(out!.session.session_name).toBe('Q');
  });

  it('returns null when key is not found', () => {
    expect(findSessionByKey(SAMPLE, 9999)).toBeNull();
  });

  it('returns null when season is null', () => {
    expect(findSessionByKey(null, 100)).toBeNull();
  });
});
