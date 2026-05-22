import { describe, expect, it } from 'vitest';
import { classify, LIVE_PREROLL_MS, LIVE_POSTROLL_MS } from '../sessionStatus';
import type { SessionData } from '../../../shared/seasonData';

// 기준 세션: 2024-03-02 15:00 UTC → 17:00 UTC
const baseSession: SessionData = {
  session_key: 1,
  session_name: 'Race',
  session_type: 'Race',
  date_start: '2024-03-02T15:00:00+00:00',
  date_end: '2024-03-02T17:00:00+00:00',
};
const START = Date.parse(baseSession.date_start);
const END = Date.parse(baseSession.date_end);

describe('classify', () => {
  it('returns cancelled when is_cancelled === true regardless of time', () => {
    const cancelled: SessionData = { ...baseSession, is_cancelled: true };
    const inLive = classify(cancelled, new Date(START + 60_000));
    expect(inLive.kind).toBe('cancelled');
  });

  it('returns upcoming when now < start - 30min', () => {
    const now = new Date(START - LIVE_PREROLL_MS - 1);
    const s = classify(baseSession, now);
    expect(s.kind).toBe('upcoming');
    if (s.kind === 'upcoming') {
      expect(s.startsInMs).toBe(LIVE_PREROLL_MS + 1);
      expect(s.liveWindowOpensInMs).toBe(1);
    }
  });

  it('returns live exactly at start - 30min (lower boundary)', () => {
    const s = classify(baseSession, new Date(START - LIVE_PREROLL_MS));
    expect(s.kind).toBe('live');
    if (s.kind === 'live') {
      expect(s.startedAgoMs).toBe(-LIVE_PREROLL_MS);
      expect(s.endsInMs).toBe(END - (START - LIVE_PREROLL_MS) + LIVE_POSTROLL_MS);
    }
  });

  it('returns live at lights-out (now = start)', () => {
    const s = classify(baseSession, new Date(START));
    expect(s.kind).toBe('live');
    if (s.kind === 'live') {
      expect(s.startedAgoMs).toBe(0);
    }
  });

  it('returns live at race end (now = end)', () => {
    const s = classify(baseSession, new Date(END));
    expect(s.kind).toBe('live');
    if (s.kind === 'live') {
      expect(s.endsInMs).toBe(LIVE_POSTROLL_MS);
    }
  });

  it('returns live just before end + 30min boundary', () => {
    const s = classify(baseSession, new Date(END + LIVE_POSTROLL_MS - 1));
    expect(s.kind).toBe('live');
  });

  it('returns past exactly at end + 30min (upper boundary)', () => {
    const s = classify(baseSession, new Date(END + LIVE_POSTROLL_MS));
    expect(s.kind).toBe('past');
    if (s.kind === 'past') {
      expect(s.finishedAgoMs).toBe(LIVE_POSTROLL_MS);
    }
  });

  it('returns past well after race ends', () => {
    const s = classify(baseSession, new Date(END + 7 * 86_400_000));
    expect(s.kind).toBe('past');
    if (s.kind === 'past') {
      expect(s.finishedAgoMs).toBeGreaterThan(0);
    }
  });
});
