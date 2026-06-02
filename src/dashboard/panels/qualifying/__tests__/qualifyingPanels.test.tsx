/// @vitest-environment jsdom
// 퀄리파잉 패널 렌더 스모크 — US-007. 파생 로직은 derived 단위 테스트가 보장하므로
// 여기서는 ds 와이어링 + 프로파일 통합이 크래시 없이 핵심 요소를 렌더하는지 확인.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { DataSourceProvider } from '../../../shared/DataSourceContext';
import { DriversProvider } from '../../../shared/DriversContext';
import { makeFakeDs } from '../../../__tests__/fakeDataSource';
import { _resetSelection, getSelectedDriver } from '../../../shared/selectionStore';
import { SegmentProgress } from '../SegmentProgress';
import { QualifyingTower } from '../QualifyingTower';
import { SegmentBestBoard } from '../SegmentBestBoard';
import { KnockoutPanel } from '../KnockoutPanel';
import type {
  DriverRecord,
  LapRecord,
  RaceControlRecord,
  SessionResultRecord,
} from '../../../../shared/openf1Types';
import type { SessionData } from '../../../../shared/seasonData';

afterEach(() => {
  cleanup();
  _resetSelection();
});

const SESSION: SessionData = {
  session_key: 9468,
  session_name: 'Qualifying',
  session_type: 'Qualifying',
  date_start: '2024-03-01T16:00:00Z',
  date_end: '2024-03-01T17:00:00Z',
};

const T = new Date('2024-03-01T16:10:00Z'); // Q1 진행 중

function mkDriver(n: number, acr: string): DriverRecord {
  return {
    driver_number: n, session_key: 9468, meeting_key: 1, broadcast_name: acr, full_name: acr,
    name_acronym: acr, team_name: 'T', team_colour: '3671c6', first_name: acr, last_name: acr,
    headshot_url: null, country_code: null,
  };
}

const drivers = new Map<number, DriverRecord>([
  [1, mkDriver(1, 'VER')],
  [2, mkDriver(2, 'HAM')],
  [3, mkDriver(3, 'PER')],
]);

const rc: RaceControlRecord[] = [
  {
    date: new Date('2024-03-01T16:00:00Z'), session_key: 9468, meeting_key: 1, category: 'Flag',
    flag: 'GREEN', scope: 'Track', sector: null, driver_number: null, lap_number: null,
    message: 'GREEN LIGHT - PIT EXIT OPEN', qualifying_phase: 1,
  },
];

// duration non-null 수 = 도달 세그먼트. 1→Q3, 2→Q2, 3→Q1탈락.
const results: Record<number, SessionResultRecord> = {
  1: { session_key: 9468, meeting_key: 1, driver_number: 1, position: 1, number_of_laps: 18, duration: [89, 88, 87], gap_to_leader: [0, 0, 0], dnf: false, dns: false, dsq: false },
  2: { session_key: 9468, meeting_key: 1, driver_number: 2, position: 11, number_of_laps: 15, duration: [90, 89, null], gap_to_leader: [1, 1, null], dnf: false, dns: false, dsq: false },
  3: { session_key: 9468, meeting_key: 1, driver_number: 3, position: 16, number_of_laps: 8, duration: [91, null, null], gap_to_leader: [2, null, null], dnf: false, dns: false, dsq: false },
};

function mkLap(n: number, dur: number): LapRecord {
  return {
    date_start: new Date('2024-03-01T16:05:00Z'), driver_number: n, session_key: 9468, meeting_key: 1,
    lap_number: 1, lap_duration: dur, duration_sector_1: null, duration_sector_2: null, duration_sector_3: null,
    i1_speed: null, i2_speed: null, st_speed: null, is_pit_out_lap: false,
    segments_sector_1: [], segments_sector_2: [], segments_sector_3: [],
  };
}
const lapsByDriver: Record<number, LapRecord[]> = { 1: [mkLap(1, 89)], 2: [mkLap(2, 90)], 3: [mkLap(3, 91)] };

function makeDs() {
  return makeFakeDs({
    displayTime: T,
    getAllBefore: (endpoint: string) => (endpoint === 'race_control' ? rc : []),
    getSessionResult: (n: number) => results[n] ?? null,
    getCompletedLapsBefore: (n: number) => lapsByDriver[n] ?? [],
  }).ds;
}

function renderPanel(node: React.ReactNode) {
  render(
    <DataSourceProvider ds={makeDs()}>
      <DriversProvider drivers={drivers}>{node}</DriversProvider>
    </DataSourceProvider>,
  );
}

describe('SegmentProgress', () => {
  it('Q1 핀이 활성, 카운트다운 표시', () => {
    renderPanel(<SegmentProgress session={SESSION} />);
    expect(screen.getByTestId('seg-pill-1').getAttribute('data-active')).toBe('true');
    expect(screen.getByTestId('seg-pill-2').getAttribute('data-active')).toBe('false');
    expect(screen.getAllByText(/Q1/).length).toBeGreaterThan(0);
  });
});

describe('QualifyingTower', () => {
  it('Q1 베스트 오름차순 정렬(VER→HAM→PER) + 클릭 선택', () => {
    renderPanel(<QualifyingTower session={SESSION} />);
    const rows = screen.getAllByTestId(/^qt-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual(['qt-row-1', 'qt-row-2', 'qt-row-3']);
    expect(screen.getByText('VER')).toBeTruthy();
    fireEvent.click(screen.getByTestId('qt-row-2'));
    expect(getSelectedDriver()).toBe(2);
  });

  it('컷라인(진출 2명) 아래 PER 가 녹아웃 존', () => {
    renderPanel(<QualifyingTower session={SESSION} />);
    expect(screen.getByTestId('qt-row-3').getAttribute('data-knockout')).toBe('true');
    expect(screen.getByTestId('qt-row-1').getAttribute('data-knockout')).toBe('false');
  });
});

describe('SegmentBestBoard', () => {
  it('Q1 열에 베스트 표시', () => {
    renderPanel(<SegmentBestBoard session={SESSION} />);
    expect(screen.getByTestId('seg-best-col-1')).toBeTruthy();
    expect(screen.getByText('SEGMENT BESTS')).toBeTruthy();
  });
});

describe('KnockoutPanel', () => {
  it('DROP ZONE 에 컷라인 아래 PER 표시', () => {
    renderPanel(<KnockoutPanel session={SESSION} />);
    expect(screen.getByText('DROP ZONE')).toBeTruthy();
    expect(screen.getByTestId('ko-row-3')).toBeTruthy();
    expect(screen.queryByTestId('ko-row-1')).toBeNull();
  });
});
