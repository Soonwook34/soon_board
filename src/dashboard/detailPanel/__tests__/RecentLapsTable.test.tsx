/// @vitest-environment jsdom
// US-9 — RecentLapsTable §3.3: getCompletedLapsBefore(미완료 제외) + 섹터/스피드 표시.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RecentLapsTable } from '../RecentLapsTable';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { LapRecord } from '../../../shared/openf1Types';

afterEach(cleanup);
const T = new Date('2024-03-02T15:30:00.000Z');

function lap(p: Partial<LapRecord>): LapRecord {
  return {
    date_start: null, driver_number: 1, session_key: 1, meeting_key: 1, lap_number: 1,
    lap_duration: null, duration_sector_1: null, duration_sector_2: null, duration_sector_3: null,
    i1_speed: null, i2_speed: null, st_speed: null, is_pit_out_lap: false,
    segments_sector_1: [], segments_sector_2: [], segments_sector_3: [], ...p,
  };
}

function renderRLT(overrides: Record<string, unknown>) {
  return render(
    <DataSourceProvider ds={makeFakeDs({ displayTime: T, ...overrides }).ds}>
      <RecentLapsTable driverNumber={1} />
    </DataSourceProvider>,
  );
}

describe('RecentLapsTable', () => {
  it('완료 랩 행 + 시간/섹터/스피드', () => {
    renderRLT({
      getCompletedLapsBefore: () => [
        lap({ lap_number: 6, lap_duration: 91.456, duration_sector_1: 30, duration_sector_2: 31, duration_sector_3: 30.456, st_speed: 312 }),
        lap({ lap_number: 5, lap_duration: 92.1, duration_sector_1: 30.5, duration_sector_2: 31.2, duration_sector_3: 30.4, st_speed: 308 }),
      ],
    });
    expect(screen.getByTestId('recent-lap-6')).toBeTruthy();
    expect(screen.getByTestId('recent-lap-5')).toBeTruthy();
    expect(screen.getByText('1:31.456')).toBeTruthy();
    expect(screen.getByText('312')).toBeTruthy(); // speed trap
  });

  it('null 섹터/스피드 → —', () => {
    renderRLT({
      getCompletedLapsBefore: () => [lap({ lap_number: 3, lap_duration: 90, duration_sector_1: 30, duration_sector_2: null, duration_sector_3: null, st_speed: null })],
    });
    // S2/S3 + speed 모두 '—' (3건 이상)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('완료 랩 없으면 기록 없음', () => {
    renderRLT({ getCompletedLapsBefore: () => [] });
    expect(screen.getByText('기록 없음')).toBeTruthy();
  });
});
