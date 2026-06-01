/// @vitest-environment jsdom
// US-11 — 단계11: 시크 시 단일 시계 일관성(인수2) + 미래 누설 zero(인수8).
// 시간 의존 fake ds 로 DashboardApp 마운트 → setTime 으로 forward/backward seek.
// 두 독립 패널(EventTicker race_control + FastestLapBadges aggregate)이 같은 t 로 동시에
// 갱신됨을 단일 렌더에서 확인(단일 시계). backward seek 시 미래 데이터가 사라짐(누설 zero).
//
// Playwright 픽셀 회귀(모드전환/시크 스냅샷)는 사용자 시각 게이트(US-V2) — 여기선 로직만.

import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { DashboardApp } from '../DashboardApp';
import { DataSourceProvider } from '../shared/DataSourceContext';
import { makeFakeDs } from './fakeDataSource';
import type { MeetingData, SessionData } from '../../shared/seasonData';

afterEach(cleanup);

const meeting: MeetingData = {
  meeting_key: 1, meeting_name: 'Bahrain Grand Prix', circuit_short_name: 'Sakhir',
  country_code: 'BRN', circuit_key: 63, gmt_offset: '03:00:00', sessions: [],
};
const session: SessionData = {
  session_key: 2, session_name: 'Practice 1', session_type: 'Practice',
  date_start: '2024-03-02T11:30:00Z', date_end: '2024-03-02T12:30:00Z',
};

const T0 = new Date('2024-03-02T12:00:00Z').valueOf();
const at = (sec: number) => new Date(T0 + sec * 1000);

// race_control: GREEN @ +10s, YELLOW @ +120s. fastest_lap 은 +60s 이후 등장.
const events = [
  { date: at(10), message: 'GREEN', lap_number: 1, category: 'Flag', flag: 'GREEN' },
  { date: at(120), message: 'YELLOW', lap_number: 5, category: 'Flag', flag: 'YELLOW' },
];

function makeTimeDependentDs(initial: Date) {
  return makeFakeDs({
    displayTime: initial,
    getAllBefore: (endpoint: string, t: Date, _f: unknown, limit?: number) => {
      if (endpoint === 'race_control') {
        return events
          .filter((e) => e.date.valueOf() <= t.valueOf())
          .sort((a, b) => b.date.valueOf() - a.date.valueOf())
          .slice(0, limit ?? 5);
      }
      return [];
    },
    getAggregateBefore: (aggregate: string, t: Date) => {
      if (aggregate === 'fastest_lap') {
        return t.valueOf() >= at(60).valueOf()
          ? { driver_number: 1, lap_number: 2, lap_duration: 90 }
          : null;
      }
      if (aggregate === 'purple_sectors') return { s1: null, s2: null, s3: null };
      return new Map();
    },
  });
}

describe('DashboardApp 시크 일관성', () => {
  it('forward/backward seek — 두 패널 동시 갱신(인수2) + 미래 누설 zero(인수8)', () => {
    const handle = makeTimeDependentDs(at(30)); // 초기 t = +30s
    render(
      <DataSourceProvider ds={handle.ds}>
        <DashboardApp meeting={meeting} session={session} year={2024} mode="replay" map={<div />} />
      </DataSourceProvider>,
    );

    // race_control 메시지는 ④ 배너 + ⑦ 티커 양쪽에 나타나므로 티커로 스코프.
    const ticker = () => within(screen.getByTestId('event-ticker'));

    // 초기 +30s: GREEN(+10s) 보임, YELLOW(+120s) 미표시, fastest_lap(+60s) 미표시.
    expect(ticker().getByText('GREEN')).toBeTruthy();
    expect(ticker().queryByText('YELLOW')).toBeNull();
    expect(screen.queryByText('1:30.000')).toBeNull();

    // forward seek → +150s: YELLOW + fastest_lap(1:30.000)가 동시에(같은 t) 나타남 = 단일 시계.
    act(() => handle.setTime(at(150)));
    expect(ticker().getByText('YELLOW')).toBeTruthy();
    expect(screen.getByText('1:30.000')).toBeTruthy(); // FastestLapBadges 만 — 고유

    // backward seek → +30s: 미래(YELLOW, fastest_lap) 모두 사라짐 = 미래 누설 zero.
    act(() => handle.setTime(at(30)));
    expect(ticker().queryByText('YELLOW')).toBeNull();
    expect(screen.queryByText('1:30.000')).toBeNull();
    expect(ticker().getByText('GREEN')).toBeTruthy(); // 과거 데이터는 유지
  });
});
