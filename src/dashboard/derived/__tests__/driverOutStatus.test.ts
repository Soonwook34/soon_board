/// @vitest-environment node
// driverOutAt — out(DNF/DNS/DSQ) 판정이 실제 리타이어 시점(완료 랩 ≥ number_of_laps) 이후에만 non-null,
// 그 전엔 null(미래 누설 zero). 시간 컷은 getCompletedLapsBefore 만 경유.
import { describe, expect, it } from 'vitest';
import { driverOutAt } from '../driverOutStatus';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { LapRecord, SessionResultRecord } from '../../../shared/openf1Types';

const T = new Date('2024-03-02T15:30:00Z');

function result(over: Partial<SessionResultRecord>): SessionResultRecord {
  return {
    session_key: 1, meeting_key: 1, driver_number: 44,
    position: 18, number_of_laps: null, duration: null, gap_to_leader: null,
    dnf: false, dns: false, dsq: false,
    ...over,
  };
}

/** lastLap 가 함수면 t 의존(시크 시뮬). */
function dsWith(res: SessionResultRecord | null, lastLap: number | null | ((t: Date) => number | null)) {
  return makeFakeDs({
    getSessionResult: () => res,
    getCompletedLapsBefore: (_n: number, t: Date) => {
      const ln = typeof lastLap === 'function' ? lastLap(t) : lastLap;
      return ln == null ? [] : [{ lap_number: ln } as LapRecord];
    },
  }).ds;
}

describe('driverOutAt', () => {
  it('AC1-1 getSessionResult=null → null', () => {
    expect(driverOutAt(dsWith(null, 10), 44, T)).toBeNull();
  });

  it('AC1-1 완주(dnf/dns/dsq 모두 false) → null', () => {
    expect(driverOutAt(dsWith(result({ number_of_laps: 57 }), 57), 44, T)).toBeNull();
  });

  it('AC1-2 dns=true → 항상 dns (완료 랩 0건 포함)', () => {
    expect(driverOutAt(dsWith(result({ dns: true, number_of_laps: 0 }), null), 44, T)).toBe('dns');
  });

  it('AC1-3 dnf — 최신 완료랩 < number_of_laps → null', () => {
    expect(driverOutAt(dsWith(result({ dnf: true, number_of_laps: 10 }), 8), 44, T)).toBeNull();
  });

  it('AC1-3 dnf — 완료 랩 0건이어도 number_of_laps 전이면 null', () => {
    expect(driverOutAt(dsWith(result({ dnf: true, number_of_laps: 10 }), null), 44, T)).toBeNull();
  });

  it('AC1-3 dnf — 최신 완료랩 ≥ number_of_laps → dnf', () => {
    expect(driverOutAt(dsWith(result({ dnf: true, number_of_laps: 10 }), 10), 44, T)).toBe('dnf');
  });

  it('AC1-4 dsq — lap_number ≥ number_of_laps 후 dsq', () => {
    expect(driverOutAt(dsWith(result({ dsq: true, number_of_laps: 5 }), 4), 44, T)).toBeNull();
    expect(driverOutAt(dsWith(result({ dsq: true, number_of_laps: 5 }), 5), 44, T)).toBe('dsq');
  });

  it('AC1-5 dnf + number_of_laps=null → null(보수적 숨김)', () => {
    expect(driverOutAt(dsWith(result({ dnf: true, number_of_laps: null }), 30), 44, T)).toBeNull();
  });

  it('AC1-6 시간 컷 — 전진 시 dnf 등장, 후진 시 재소멸(미래 누설 zero)', () => {
    const tRetire = new Date('2024-03-02T15:40:00Z').valueOf();
    const ds = dsWith(
      result({ dnf: true, number_of_laps: 10 }),
      (t) => (t.valueOf() >= tRetire ? 10 : 8),
    );
    expect(driverOutAt(ds, 44, new Date(tRetire - 60_000))).toBeNull(); // 리타이어 전
    expect(driverOutAt(ds, 44, new Date(tRetire + 60_000))).toBe('dnf'); // 이후
    expect(driverOutAt(ds, 44, new Date(tRetire - 60_000))).toBeNull(); // 후진 → 재소멸
  });
});
