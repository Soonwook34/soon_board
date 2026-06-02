/// @vitest-environment jsdom
// US-3 — SessionHeader ①.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SessionHeader } from '../SessionHeader';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { MeetingData, SessionData } from '../../../shared/seasonData';

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
const session: SessionData = {
  session_key: 9468,
  session_name: 'Race',
  session_type: 'Race',
  date_start: '2024-03-02T15:00:00Z',
  date_end: '2024-03-02T17:00:00Z',
};

describe('SessionHeader', () => {
  it('트랙·세션·연도 표시', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('Sakhir')).toBeTruthy();
    expect(screen.getByText('BRN')).toBeTruthy();
    expect(screen.getByText('Race · 2024')).toBeTruthy();
  });

  it('현지 시계 = display_time + gmt_offset (12:00Z + 3h = 15:00:00)', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('15:00:00')).toBeTruthy();
  });

  it('LIVE 모드 배지', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z'), streamState: 'live' });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('-30s')).toBeTruthy();
  });

  it('음수 gmt_offset 적용 (17:00Z - 5h = 12:00:00)', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T17:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={{ ...meeting, gmt_offset: '-05:00:00' }} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('12:00:00')).toBeTruthy();
  });

  it('lagging stream 상태 배지', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z'), streamState: 'lagging' });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('LAGGING')).toBeTruthy();
  });

  it('데이터 전이면 시계 --:--:--', () => {
    const { ds } = makeFakeDs(); // displayTime epoch 0
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="replay" />
      </DataSourceProvider>,
    );
    expect(screen.getByText('--:--:--')).toBeTruthy();
    expect(screen.getByText('REPLAY')).toBeTruthy();
  });

  it('E2-1 — onBack 제공 시 Back 버튼 렌더 + 클릭 시 콜백', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    const onBack = vi.fn();
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" onBack={onBack} />
      </DataSourceProvider>,
    );
    const back = screen.getByTestId('header-back');
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('E2-1 — onBack 미제공 시 Back 버튼 없음', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') });
    render(
      <DataSourceProvider ds={ds}>
        <SessionHeader meeting={meeting} session={session} year={2024} mode="live" />
      </DataSourceProvider>,
    );
    expect(screen.queryByTestId('header-back')).toBeNull();
  });
});
