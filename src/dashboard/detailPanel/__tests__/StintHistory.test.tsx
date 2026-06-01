/// @vitest-environment jsdom
// US-9 — StintHistory §3.5: stints undated → getStintForLap 1..currentLap 순회. 완료 vs 진행중 라벨,
// 미래 스틴트 미표시(currentLap 컷, 인수17c).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StintHistory } from '../StintHistory';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { StintRecord } from '../../../shared/openf1Types';

afterEach(cleanup);
const T = new Date('2024-03-02T15:30:00.000Z');

function stint(p: Partial<StintRecord>): StintRecord {
  return { session_key: 1, meeting_key: 1, driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 1, compound: 'SOFT', tyre_age_at_start: 0, ...p };
}

// 리더 currentLap = 30. getStintForLap 은 lap → 포함 스틴트.
function stintForLapOf(all: StintRecord[]) {
  return (driverNum: number, lap: number): StintRecord | null =>
    all.find((s) => s.driver_number === driverNum && lap >= s.lap_start && lap <= s.lap_end) ?? null;
}

function renderSH(stints: StintRecord[], currentLap: number) {
  const ds = makeFakeDs({
    displayTime: T,
    getLatestBefore: (_ep: string, _t: Date, filters?: { position?: number }) =>
      filters?.position === 1 ? { driver_number: 1, position: 1 } : null,
    getLapAt: () => ({ lap_number: currentLap }),
    getStintForLap: stintForLapOf(stints),
  }).ds;
  return render(
    <DataSourceProvider ds={ds}>
      <StintHistory driverNumber={1} />
    </DataSourceProvider>,
  );
}

describe('StintHistory', () => {
  it('완료 스틴트 + 진행 중 스틴트(lap_end=currentLap) + 미래 스틴트 제외', () => {
    const stints = [
      stint({ stint_number: 1, lap_start: 1, lap_end: 18, compound: 'SOFT' }),
      stint({ stint_number: 2, lap_start: 19, lap_end: 40, compound: 'HARD' }), // 진행 중(40>30)
      stint({ stint_number: 3, lap_start: 41, lap_end: 55, compound: 'MEDIUM' }), // 미래 — 미표시
    ];
    renderSH(stints, 30);
    expect(screen.getByTestId('stint-1')).toBeTruthy();
    expect(screen.getByTestId('stint-2')).toBeTruthy();
    expect(screen.queryByTestId('stint-3')).toBeNull(); // 미래 스틴트 미표시
    expect(screen.getByText('L1-18')).toBeTruthy(); // 완료
    expect(screen.getByText('L19-30')).toBeTruthy(); // 진행 중 → endLap = currentLap
    expect(screen.getByText('진행 중')).toBeTruthy();
  });

  it('currentLap 0(리더 없음) → 스틴트 없음', () => {
    const ds = makeFakeDs({ displayTime: T, getLatestBefore: () => null }).ds;
    render(
      <DataSourceProvider ds={ds}>
        <StintHistory driverNumber={1} />
      </DataSourceProvider>,
    );
    expect(screen.getByText('스틴트 없음')).toBeTruthy();
  });
});
