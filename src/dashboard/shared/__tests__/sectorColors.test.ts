// US-5 — sectorColors SSOT: 보라/초록/노랑/회색 전이 + null 처리 (인수 13/16).
import { describe, expect, it } from 'vitest';
import { SECTOR_COLORS, sectorColor, sectorColorKind } from '../sectorColors';
import type { AggregateResults, PersonalBestRow } from '../../../shared/openf1Types';

function pb(driver: number, s1: number | null, s2: number | null, s3: number | null): PersonalBestRow {
  return { driver_number: driver, best_lap_duration: null, best_sector_1: s1, best_sector_2: s2, best_sector_3: s3 };
}

// driver 1 = overall best s1(28). driver 44 의 personal best s1=30 (overall 아님).
const agg: AggregateResults = {
  fastest_lap: null,
  purple_sectors: {
    s1: { driver_number: 1, sector_duration: 28 },
    s2: null,
    s3: { driver_number: 44, sector_duration: 31 },
  },
  personal_bests: new Map([
    [1, pb(1, 28, 29, 32)],
    [44, pb(44, 30, 29, 31)],
  ]),
};

describe('sectorColorKind', () => {
  it('overall best → 보라 (overall 이면서 본인 best 여도 보라 우선)', () => {
    expect(sectorColorKind(agg, 1, 1, 28)).toBe('overall');
  });
  it('personal best 지만 overall 아님 → 초록', () => {
    expect(sectorColorKind(agg, 44, 1, 30)).toBe('personal');
  });
  it('본인 best 보다 느림 → 노랑', () => {
    expect(sectorColorKind(agg, 44, 1, 35)).toBe('other');
  });
  it('null → 회색 (인수 16)', () => {
    expect(sectorColorKind(agg, 44, 1, null)).toBe('none');
    expect(sectorColorKind(agg, 44, 1, undefined)).toBe('none');
  });
  it('overall 데이터 없는 섹터(s2=null)는 personal/other 로만 판정', () => {
    expect(sectorColorKind(agg, 44, 2, 29)).toBe('personal');
    expect(sectorColorKind(agg, 44, 2, 40)).toBe('other');
  });
});

describe('sectorColor (hex)', () => {
  it('kind → F1 표준 hex', () => {
    expect(sectorColor(agg, 1, 1, 28)).toBe(SECTOR_COLORS.overall);
    expect(sectorColor(agg, 44, 1, 30)).toBe(SECTOR_COLORS.personal);
    expect(sectorColor(agg, 44, 1, 35)).toBe(SECTOR_COLORS.other);
    expect(sectorColor(agg, 44, 1, null)).toBe(SECTOR_COLORS.none);
  });
});
