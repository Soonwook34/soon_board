/// @vitest-environment jsdom
// US-5 — SectorBar: 3등분 + 색 적용 + null 회색.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { SectorBar } from '../SectorBar';
import { SECTOR_COLORS } from '../sectorColors';
import type { AggregateResults } from '../../../shared/openf1Types';

afterEach(cleanup);

const agg: AggregateResults = {
  fastest_lap: null,
  purple_sectors: { s1: { driver_number: 1, sector_duration: 28 }, s2: null, s3: null },
  personal_bests: new Map([[1, { driver_number: 1, best_lap_duration: null, best_sector_1: 28, best_sector_2: 30, best_sector_3: 31 }]]),
};

function bg(el: Element): string {
  return (el as HTMLElement).style.background;
}

// jsdom 은 inline hex 색을 rgb() 로 직렬화하므로 비교 기준을 맞춘다.
function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe('SectorBar', () => {
  it('정확히 3등분 세그먼트 (data-sector 1/2/3)', () => {
    const { container } = render(<SectorBar sectors={[28, 30, null]} aggregate={agg} driverNumber={1} />);
    const segs = container.querySelectorAll('[data-sector]');
    expect(segs.length).toBe(3);
    expect([...segs].map((s) => s.getAttribute('data-sector'))).toEqual(['1', '2', '3']);
    for (const s of segs) expect((s as HTMLElement).style.flex).toBeTruthy();
  });

  it('s1=overall→보라, s2=personal→초록, s3=null→회색', () => {
    const { container } = render(<SectorBar sectors={[28, 30, null]} aggregate={agg} driverNumber={1} />);
    const segs = container.querySelectorAll('[data-sector]');
    expect(bg(segs[0])).toBe(hexToRgb(SECTOR_COLORS.overall));
    expect(bg(segs[1])).toBe(hexToRgb(SECTOR_COLORS.personal));
    expect(bg(segs[2])).toBe(hexToRgb(SECTOR_COLORS.none));
  });
});
