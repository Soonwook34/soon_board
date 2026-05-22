import { describe, expect, it } from 'vitest';
import { openf1ToSessionMap } from '../openf1ToSessionMap';

describe('openf1ToSessionMap', () => {
  it('converts a valid array of OpenF1 session rows into a Map keyed by session_key', () => {
    const rows = [
      { session_key: 9472, date_start: '2024-03-02T15:00:00Z', date_end: '2024-03-02T17:00:00Z' },
      { session_key: 9473, date_start: '2024-03-03T11:00:00Z', is_cancelled: true },
    ];
    const map = openf1ToSessionMap(rows);
    expect(map.size).toBe(2);
    expect(map.get(9472)).toEqual({
      date_start: '2024-03-02T15:00:00Z',
      date_end: '2024-03-02T17:00:00Z',
    });
    expect(map.get(9473)).toEqual({ date_start: '2024-03-03T11:00:00Z', is_cancelled: true });
  });

  it('returns an empty map for empty array input', () => {
    expect(openf1ToSessionMap([]).size).toBe(0);
  });

  it('returns an empty map for non-array inputs', () => {
    expect(openf1ToSessionMap(null).size).toBe(0);
    expect(openf1ToSessionMap(undefined).size).toBe(0);
    expect(openf1ToSessionMap({ session_key: 1 }).size).toBe(0);
    expect(openf1ToSessionMap('not array').size).toBe(0);
  });

  it('skips rows missing or with non-numeric session_key, and rejects wrong-typed fields', () => {
    const rows = [
      null,
      'string',
      { date_start: '2024-01-01T00:00:00Z' }, // missing session_key
      { session_key: 'abc' }, // wrong type
      { session_key: 100, date_start: 12345, date_end: '2024-01-01T01:00:00Z', is_cancelled: 'yes' },
    ];
    const map = openf1ToSessionMap(rows);
    expect(map.size).toBe(1);
    // 100 kept but only date_end survives type guard
    expect(map.get(100)).toEqual({ date_end: '2024-01-01T01:00:00Z' });
  });
});
