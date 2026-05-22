import { describe, expect, it } from 'vitest';
import { diffSessions, type FreshSessionPatch } from '../seasonDiff';
import type { SeasonData } from '../../../shared/seasonData';

function makeSeason(): SeasonData {
  return {
    year: 2026,
    generated_at: '2026-01-01T00:00:00Z',
    source: 'openf1.org/v1',
    meetings: [
      {
        meeting_key: 1,
        meeting_name: 'Australian GP',
        sessions: [
          {
            session_key: 100,
            session_name: 'Race',
            session_type: 'Race',
            date_start: '2026-03-15T05:00:00Z',
            date_end: '2026-03-15T07:00:00Z',
          },
          {
            session_key: 101,
            session_name: 'Qualifying',
            session_type: 'Qualifying',
            date_start: '2026-03-14T06:00:00Z',
            date_end: '2026-03-14T07:00:00Z',
          },
        ],
      },
      {
        meeting_key: 2,
        meeting_name: 'Chinese GP',
        sessions: [
          {
            session_key: 200,
            session_name: 'Race',
            session_type: 'Race',
            date_start: '2026-03-22T07:00:00Z',
            date_end: '2026-03-22T09:00:00Z',
            is_cancelled: false,
          },
        ],
      },
    ],
  };
}

describe('diffSessions', () => {
  it('returns empty when fresh patches match cached', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([
      [100, { date_start: '2026-03-15T05:00:00Z', date_end: '2026-03-15T07:00:00Z' }],
      [101, { date_start: '2026-03-14T06:00:00Z' }],
    ]);
    expect(diffSessions(cached, fresh)).toEqual([]);
  });

  it('detects date_start change', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([[100, { date_start: '2026-03-15T06:00:00Z' }]]);
    const out = diffSessions(cached, fresh);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      session_key: 100,
      meeting_key: 1,
      field: 'date_start',
      before: '2026-03-15T05:00:00Z',
      after: '2026-03-15T06:00:00Z',
    });
  });

  it('detects date_end change', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([[101, { date_end: '2026-03-14T08:00:00Z' }]]);
    const out = diffSessions(cached, fresh);
    expect(out).toHaveLength(1);
    expect(out[0].field).toBe('date_end');
    expect(out[0].after).toBe('2026-03-14T08:00:00Z');
  });

  it('detects is_cancelled flip to true', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([[200, { is_cancelled: true }]]);
    const out = diffSessions(cached, fresh);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ session_key: 200, field: 'is_cancelled', before: false, after: true });
  });

  it('treats is_cancelled false ↔ undefined as equivalent', () => {
    const cached = makeSeason();
    // 100 (no is_cancelled) ↔ fresh false; 200 (is_cancelled:false) ↔ fresh undefined
    const fresh = new Map<number, FreshSessionPatch>([
      [100, { is_cancelled: false }],
      [200, {}],
    ]);
    expect(diffSessions(cached, fresh)).toEqual([]);
  });

  it('collects multiple changes across meetings and fields', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([
      [100, { date_start: '2026-03-15T06:00:00Z', date_end: '2026-03-15T08:00:00Z' }],
      [200, { is_cancelled: true }],
    ]);
    const out = diffSessions(cached, fresh);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.field).sort()).toEqual(['date_end', 'date_start', 'is_cancelled']);
  });

  it('ignores session_keys missing from fresh (conservative: partial responses allowed)', () => {
    const cached = makeSeason();
    const fresh = new Map<number, FreshSessionPatch>([
      [100, { date_start: '2026-03-15T05:00:00Z' }],
      // 101, 200 missing
    ]);
    expect(diffSessions(cached, fresh)).toEqual([]);
  });
});
