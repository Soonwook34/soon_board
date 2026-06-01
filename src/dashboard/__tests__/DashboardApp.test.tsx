/// @vitest-environment jsdom
// US-5 — DashboardApp 레이아웃 골격: provider + mock ds + map slot 으로 4 패널 + 슬롯 마운트.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { DashboardApp } from '../DashboardApp';
import { DataSourceProvider } from '../shared/DataSourceContext';
import { makeFakeDs } from './fakeDataSource';
import type { MeetingData, SessionData } from '../../shared/seasonData';

afterEach(cleanup);

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
  it('그리드 + 4 패널 + 맵 슬롯 + placeholder 마운트', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    const { container } = render(
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
    expect(container.querySelector('[data-region="s"]')).toBeTruthy(); // ⑤⑥⑦ placeholder
    expect(container.querySelector('[data-region="b"]')).toBeTruthy(); // ⑧ placeholder
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
