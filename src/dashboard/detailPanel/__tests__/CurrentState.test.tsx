/// @vitest-environment jsdom
// US-8C — CurrentState §3.2: 포지션/랩/갭/타이어 + Last Lap + In Progress 행(§15) + null 섹터(§16).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { CurrentState } from '../CurrentState';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { DriversProvider, type DriversMap } from '../../shared/DriversContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { DriverRecord, LapRecord } from '../../../shared/openf1Types';

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

function drivers1(): DriversMap {
  const d: DriverRecord = {
    driver_number: 1, session_key: 1, meeting_key: 1, broadcast_name: 'VER', full_name: 'Max Verstappen',
    name_acronym: 'VER', team_name: 'Red Bull', team_colour: '3671C6', first_name: 'Max', last_name: 'V',
    headshot_url: null, country_code: 'NED',
  };
  return new Map([[1, d]]);
}

function renderCS(overrides: Record<string, unknown>) {
  return render(
    <DataSourceProvider ds={makeFakeDs({ displayTime: T, ...overrides }).ds}>
      <DriversProvider drivers={drivers1()}>
        <CurrentState driverNumber={1} />
      </DriversProvider>
    </DataSourceProvider>,
  );
}

describe('CurrentState', () => {
  it('포지션/현재랩/갭/타이어 + Last Lap 시간', () => {
    renderCS({
      getCompletedLapsBefore: () => [lap({ lap_number: 5, lap_duration: 91.456, duration_sector_1: 30, duration_sector_2: 31, duration_sector_3: 30.456 })],
      getLapAt: () => lap({ lap_number: 5, lap_duration: 91.456 }),
      getLatestBefore: (ep: string) =>
        ep === 'position' ? { position: 3 } : ep === 'intervals' ? { interval: 1.2, gap_to_leader: 5.7 } : null,
      getStintForLap: () => ({ compound: 'SOFT', lap_start: 1, tyre_age_at_start: 2, stint_number: 1, lap_end: 20, driver_number: 1, session_key: 1, meeting_key: 1 }),
    });
    expect(screen.getByText('P3')).toBeTruthy();
    expect(screen.getByText('L5')).toBeTruthy();
    expect(screen.getByText('+1.200')).toBeTruthy(); // INT
    expect(screen.getByText('+5.700')).toBeTruthy(); // GAP
    expect(screen.getByText('1:31.456')).toBeTruthy(); // Last lap
    expect(screen.getByTestId('cs-last-lap')).toBeTruthy();
  });

  it('intervals 누락 → INT/GAP 모두 — (인수10)', () => {
    renderCS({
      getCompletedLapsBefore: () => [lap({ lap_number: 5, lap_duration: 90 })],
      getLapAt: () => lap({ lap_number: 5, lap_duration: 90 }),
      getLatestBefore: (ep: string) => (ep === 'position' ? { position: 1 } : null),
    });
    // INT, GAP 모두 '—' (2건). LAST LAP 은 정상.
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('In Progress 행(§15) — getLapAt 가 완료랩보다 큰 lap → 통과섹터 숫자 + 미통과 — (§16)', () => {
    renderCS({
      getCompletedLapsBefore: () => [lap({ lap_number: 5, lap_duration: 90 })],
      // 6랩 진행 중: S1 통과(28.5), S2/S3 미통과(null)
      getLapAt: () => lap({ lap_number: 6, lap_duration: null, duration_sector_1: 28.5 }),
      getLatestBefore: (ep: string) => (ep === 'position' ? { position: 2 } : null),
    });
    const inProgress = screen.getByTestId('cs-in-progress');
    expect(inProgress).toBeTruthy();
    expect(screen.getByText('L6')).toBeTruthy(); // 현재 랩 = getLapAt
    expect(within(inProgress).getByText('S1 28.500')).toBeTruthy(); // 통과 섹터
    expect(within(inProgress).getByText('S2 —')).toBeTruthy(); // 미통과 → '—'(회색)
  });

  it('완료랩만 있고 진행 중 아님 → In Progress 행 없음', () => {
    renderCS({
      getCompletedLapsBefore: () => [lap({ lap_number: 5, lap_duration: 90 })],
      getLapAt: () => lap({ lap_number: 5, lap_duration: 90 }), // 완료랩과 동일 → not in progress
      getLatestBefore: () => null,
    });
    expect(screen.queryByTestId('cs-in-progress')).toBeNull();
  });
});
