/// @vitest-environment jsdom
// dashboard §2.5 — 리더보드 ⑤ 테스트. 정렬 / LAST·섹터바 / interval 누락 graceful / 클릭 선택 / 빈 맵.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Leaderboard } from '../Leaderboard';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { DriversProvider } from '../../shared/DriversContext';
import { makeFakeDs, type FakeDsHandle } from '../../__tests__/fakeDataSource';
import { _resetSelection, getSelectedDriver } from '../../shared/selectionStore';
import type { DriverRecord, LapRecord, PositionRecord, SessionResultRecord } from '../../../shared/openf1Types';

afterEach(() => {
  cleanup();
  _resetSelection();
});

function mkDriver(driver_number: number, name_acronym: string, team_colour: string): DriverRecord {
  return {
    driver_number,
    session_key: 1,
    meeting_key: 1,
    broadcast_name: name_acronym,
    full_name: name_acronym,
    name_acronym,
    team_name: 'Team',
    team_colour,
    first_name: name_acronym,
    last_name: name_acronym,
    headshot_url: null,
    country_code: null,
  };
}

function mkLap(driver_number: number, lap_number: number, lap_duration: number): LapRecord {
  return {
    date_start: new Date('2024-03-02T15:00:00Z'),
    driver_number,
    session_key: 1,
    meeting_key: 1,
    lap_number,
    lap_duration,
    duration_sector_1: 30,
    duration_sector_2: 30,
    duration_sector_3: lap_duration - 60,
    i1_speed: null,
    i2_speed: null,
    st_speed: null,
    is_pit_out_lap: false,
    segments_sector_1: [],
    segments_sector_2: [],
    segments_sector_3: [],
  };
}

const driversMap = new Map<number, DriverRecord>([
  [1, mkDriver(1, 'VER', '3671c6')],
  [44, mkDriver(44, 'HAM', '27f4d2')],
]);

const positions: Record<number, number> = { 1: 1, 44: 2 };

function renderLeaderboard(
  drivers: ReadonlyMap<number, DriverRecord>,
  overrides: Record<string, unknown> = {},
): FakeDsHandle {
  const handle = makeFakeDs({
    displayTime: new Date('2024-03-02T15:30:00Z'),
    getAggregateBefore: (name: string) => {
      if (name === 'fastest_lap') return { driver_number: 1, lap_number: 5, lap_duration: 90 };
      if (name === 'purple_sectors') return { s1: null, s2: null, s3: null };
      return new Map();
    },
    ...overrides,
  });
  render(
    <DataSourceProvider ds={handle.ds}>
      <DriversProvider drivers={drivers}>
        <Leaderboard />
      </DriversProvider>
    </DataSourceProvider>,
  );
  return handle;
}

describe('Leaderboard', () => {
  it('position 오름차순 정렬 (VER pos1 → HAM pos2)', () => {
    renderLeaderboard(driversMap, {
      getLatestBefore: (endpoint: string, _t: Date, filters?: { driver_number?: number }) => {
        if (endpoint === 'position' && filters?.driver_number != null) {
          return {
            driver_number: filters.driver_number,
            position: positions[filters.driver_number],
            date: new Date(),
            session_key: 1,
            meeting_key: 1,
          } as PositionRecord;
        }
        return null;
      },
    });
    const rows = screen.getAllByTestId(/^lb-row-/);
    expect(rows[0].getAttribute('data-testid')).toBe('lb-row-1');
    expect(rows[1].getAttribute('data-testid')).toBe('lb-row-44');
    expect(screen.getByText('VER')).toBeTruthy();
    expect(screen.getByText('HAM')).toBeTruthy();
  });

  it('LAST 랩타임 포맷 + SectorBar 렌더', () => {
    renderLeaderboard(driversMap, {
      getCompletedLapsBefore: (driver: number) => [mkLap(driver, 10, 91.456)],
    });
    expect(screen.getAllByText('1:31.456').length).toBeGreaterThan(0);
    const sectorSpans = document.querySelectorAll('[data-sector]');
    expect(sectorSpans.length).toBeGreaterThan(0);
  });

  it('intervals 없으면 INT/GAP 은 — 이지만 행은 acronym·position 렌더', () => {
    renderLeaderboard(driversMap, {
      getLatestBefore: (endpoint: string, _t: Date, filters?: { driver_number?: number }) => {
        if (endpoint === 'position' && filters?.driver_number != null) {
          return {
            driver_number: filters.driver_number,
            position: positions[filters.driver_number],
            date: new Date(),
            session_key: 1,
            meeting_key: 1,
          } as PositionRecord;
        }
        return null; // intervals 등은 null
      },
    });
    expect(screen.getByText('VER')).toBeTruthy();
    expect(screen.getByTestId('lb-row-1')).toBeTruthy();
    // INT, GAP, LAST, TYR 모두 — (각 행 4셀 × 2행 = 8개 이상)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('행 클릭 → selectDriver(driver_number)', () => {
    renderLeaderboard(driversMap);
    fireEvent.click(screen.getByTestId('lb-row-44'));
    expect(getSelectedDriver()).toBe(44);
  });

  it('빈 drivers 맵 → 크래시 없이 leaderboard 렌더, 행 없음', () => {
    renderLeaderboard(new Map());
    expect(screen.getByTestId('leaderboard')).toBeTruthy();
    expect(screen.queryAllByTestId(/^lb-row-/).length).toBe(0);
  });

  it('LEADERBOARD 타이틀 헤더 표시 (#6/B4)', () => {
    renderLeaderboard(new Map());
    expect(screen.getByText('LEADERBOARD')).toBeTruthy();
  });

  const positionLatest =
    (endpoint: string, _t: Date, filters?: { driver_number?: number }) =>
      endpoint === 'position' && filters?.driver_number != null
        ? ({
            driver_number: filters.driver_number,
            position: positions[filters.driver_number],
            date: new Date(),
            session_key: 1,
            meeting_key: 1,
          } as PositionRecord)
        : null;

  it('DNF ✕ 는 리타이어 랩(number_of_laps) 이후에만 — 전진 등장·후진 재소멸(미래 누설 zero)', () => {
    const tRetire = new Date('2024-03-02T15:40:00Z').valueOf();
    const handle = renderLeaderboard(driversMap, {
      getLatestBefore: positionLatest,
      getSessionResult: (n: number): SessionResultRecord | null =>
        n === 44
          ? {
              session_key: 1, meeting_key: 1, driver_number: 44, position: 18,
              number_of_laps: 10, duration: null, gap_to_leader: null,
              dnf: true, dns: false, dsq: false,
            }
          : null,
      getCompletedLapsBefore: (n: number, t: Date) =>
        n === 44 ? [mkLap(44, t.valueOf() >= tRetire ? 10 : 8, 90)] : [],
    });
    expect(screen.queryByTestId('lb-out-44')).toBeNull(); // 15:30 리타이어 전
    act(() => handle.setTime(new Date('2024-03-02T15:45:00Z'))); // 전진 → 리타이어 후
    expect(screen.getByTestId('lb-out-44')).toBeTruthy();
    act(() => handle.setTime(new Date('2024-03-02T15:30:00Z'))); // 후진 시크
    expect(screen.queryByTestId('lb-out-44')).toBeNull(); // 재소멸
  });

  it('라이브(getSessionResult=null) → out 마커 절대 미표시', () => {
    renderLeaderboard(driversMap, { getLatestBefore: positionLatest });
    expect(screen.queryAllByTestId(/^lb-out-/).length).toBe(0);
  });
});
