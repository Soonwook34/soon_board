// qualiLapClass 단위 테스트 — US-006.

import { describe, expect, it } from 'vitest';
import { classifyLap, pitLapsByDriver } from '../qualiLapClass';
import type { LapRecord, PitRecord } from '../../../shared/openf1Types';

function mkLap(o: Partial<LapRecord>): LapRecord {
  return {
    date_start: new Date('2024-03-01T16:05:00Z'),
    driver_number: 1,
    session_key: 9468,
    meeting_key: 1,
    lap_number: 1,
    lap_duration: 90,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    is_pit_out_lap: false,
    segments_sector_1: [],
    segments_sector_2: [],
    segments_sector_3: [],
    ...o,
  };
}

describe('classifyLap', () => {
  const noPits = new Set<number>();

  it('is_pit_out_lap → out (우선순위 최상)', () => {
    expect(classifyLap(mkLap({ is_pit_out_lap: true, lap_number: 2 }), noPits)).toBe('out');
    // out 은 pit 진입 랩 여부보다 우선
    expect(classifyLap(mkLap({ is_pit_out_lap: true, lap_number: 5 }), new Set([5]))).toBe('out');
  });

  it('핏 진입 랩(pitLaps) → in', () => {
    expect(classifyLap(mkLap({ lap_number: 5 }), new Set([5]))).toBe('in');
  });

  it('유효 랩타임 + 아웃/인 아님 → flying', () => {
    expect(classifyLap(mkLap({ lap_number: 3, lap_duration: 89.5 }), noPits)).toBe('flying');
  });

  it('lap_duration null/0 → incomplete', () => {
    expect(classifyLap(mkLap({ lap_duration: null }), noPits)).toBe('incomplete');
    expect(classifyLap(mkLap({ lap_duration: 0 }), noPits)).toBe('incomplete');
  });
});

describe('pitLapsByDriver', () => {
  const pits: PitRecord[] = [
    { date: new Date(), driver_number: 1, session_key: 9468, meeting_key: 1, lap_number: 6, pit_duration: 20 },
    { date: new Date(), driver_number: 1, session_key: 9468, meeting_key: 1, lap_number: 12, pit_duration: 21 },
    { date: new Date(), driver_number: 44, session_key: 9468, meeting_key: 1, lap_number: 7, pit_duration: 22 },
  ];

  it('pitLapsByDriver: 전체 맵', () => {
    const m = pitLapsByDriver(pits);
    expect(m.get(1)).toEqual(new Set([6, 12]));
    expect(m.get(44)).toEqual(new Set([7]));
    expect(m.has(99)).toBe(false);
  });
});
