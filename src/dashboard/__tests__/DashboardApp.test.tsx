/// @vitest-environment jsdom
// US-5 — DashboardApp 레이아웃 골격: provider + mock ds + map slot 으로 4 패널 + 슬롯 마운트.
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { DashboardApp } from '../DashboardApp';
import { DataSourceProvider } from '../shared/DataSourceContext';
import { DriversProvider } from '../shared/DriversContext';
import { selectDriver, _resetSelection } from '../shared/selectionStore';
import { makeFakeDs } from './fakeDataSource';
import type { MeetingData, SessionData } from '../../shared/seasonData';

afterEach(() => {
  cleanup();
  _resetSelection();
});

const meeting: MeetingData = {
  meeting_key: 1,
  meeting_name: 'Bahrain Grand Prix',
  circuit_short_name: 'Sakhir',
  country_code: 'BRN',
  circuit_key: 63,
  gmt_offset: '03:00:00',
  sessions: [],
};
// Practice 세션 → time mode (raceDistance fetch 회피, 동기 렌더).
const session: SessionData = {
  session_key: 2,
  session_name: 'Practice 1',
  session_type: 'Practice',
  date_start: '2024-03-02T11:30:00Z',
  date_end: '2024-03-02T12:30:00Z',
};

describe('DashboardApp', () => {
  it('그리드 + 글로벌 패널 + 맵 슬롯 + ⑤⑥⑦⑧ 데이터 패널 마운트', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <DashboardApp
          meeting={meeting}
          session={session}
          year={2024}
          mode="live"
          map={<div data-testid="map-slot" />}
        />
      </DataSourceProvider>,
    );
    expect(screen.getByTestId('dashboard-app')).toBeTruthy();
    expect(screen.getByTestId('map-slot')).toBeTruthy(); // ③ 맵 슬롯
    expect(screen.getByText('Sakhir')).toBeTruthy(); // ① 헤더
    expect(screen.getByText('TRACK CLEAR')).toBeTruthy(); // ④ race control (빈 메시지)
    expect(screen.getByText('AIR')).toBeTruthy(); // ⑨ 날씨
    // ⑤⑥⑦⑧ 실 패널 — DriversProvider 없이도 graceful(빈 상태)로 마운트.
    expect(screen.getByTestId('leaderboard')).toBeTruthy(); // ⑤
    expect(screen.getByTestId('tyre-strategy')).toBeTruthy(); // ⑥
    expect(screen.getByTestId('event-ticker')).toBeTruthy(); // ⑦
    expect(screen.getByTestId('fastest-badges')).toBeTruthy(); // ⑧
  });

  it('미선택 시 사이드 패널 미렌더 (push 닫힘)', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <DashboardApp meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.queryByTestId('driver-detail')).toBeNull();
    expect(screen.getByTestId('leaderboard')).toBeTruthy(); // 기존 패널 유지
  });

  it('selectDriver 후 사이드 패널(⑩) 등장 (push 열림)', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={new Map()}>
          <DashboardApp meeting={meeting} session={session} year={2024} mode="live" />
        </DriversProvider>
      </DataSourceProvider>,
    );
    act(() => selectDriver(44));
    expect(screen.getByTestId('driver-detail')).toBeTruthy();
    // push 열림에도 기존 우측열 패널 유지.
    expect(screen.getByTestId('leaderboard')).toBeTruthy();
  });

  it('map prop 없으면 맵 placeholder', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <DashboardApp meeting={meeting} session={session} year={2024} mode="replay" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('라이브 맵 ③')).toBeTruthy();
  });
});
