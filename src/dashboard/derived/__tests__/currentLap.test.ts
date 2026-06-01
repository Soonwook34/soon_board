// US-7 — leaderCurrentLap: position==1 driver 의 현재 lap (인수 3).
import { describe, expect, it } from 'vitest';
import { leaderCurrentLap, leaderDriverNumber } from '../currentLap';
import type { DataSource } from '../../../shared/DataSource';
import type { LapRecord, PositionRecord } from '../../../shared/openf1Types';

// 시각별 리더와 lap 을 돌려주는 fake ds. getLatestBefore('position',{position:1}) + getLapAt.
function makeFakeDs(spec: {
  leaderAt: (t: Date) => number | null;
  lapAt: (driver: number, t: Date) => number | null;
}): DataSource {
  return {
    getLatestBefore: (_e: string, t: Date, filters?: { position?: number }) => {
      if (filters?.position !== 1) return null;
      const d = spec.leaderAt(t);
      return d == null ? null : ({ driver_number: d, position: 1 } as unknown as PositionRecord);
    },
    getLapAt: (driver: number, t: Date) => {
      const n = spec.lapAt(driver, t);
      return n == null ? null : ({ driver_number: driver, lap_number: n } as unknown as LapRecord);
    },
  } as unknown as DataSource;
}

describe('leaderCurrentLap', () => {
  it('리더(P1)의 현재 lap 반환', () => {
    const ds = makeFakeDs({
      leaderAt: (t) => (t.valueOf() < 100 ? 44 : 1), // 시크 시 리더 바뀜
      lapAt: (driver) => (driver === 44 ? 3 : driver === 1 ? 25 : null),
    });
    expect(leaderDriverNumber(ds, new Date(50))).toBe(44);
    expect(leaderCurrentLap(ds, new Date(50))).toBe(3);
    // 시크 후 리더가 driver 1, lap 25
    expect(leaderCurrentLap(ds, new Date(150))).toBe(25);
  });

  it('리더 없으면 null', () => {
    const ds = makeFakeDs({ leaderAt: () => null, lapAt: () => 10 });
    expect(leaderCurrentLap(ds, new Date(0))).toBeNull();
  });

  it('리더는 있으나 lap 데이터 없으면 null', () => {
    const ds = makeFakeDs({ leaderAt: () => 44, lapAt: () => null });
    expect(leaderCurrentLap(ds, new Date(0))).toBeNull();
  });
});
