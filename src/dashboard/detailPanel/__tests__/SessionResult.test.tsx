/// @vitest-environment jsdom
// US-10 — SessionResult §3.6: date_end 게이트(인수11/17g) + getSessionResult 소비 + qualifying 배열.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SessionResult } from '../SessionResult';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { SessionResultRecord } from '../../../shared/openf1Types';
import type { SessionData } from '../../../shared/seasonData';

afterEach(cleanup);

const DATE_END = '2024-03-02T17:00:00Z';
function race(): SessionData {
  return { session_key: 1, session_name: 'Race', session_type: 'Race', date_start: '2024-03-02T15:00:00Z', date_end: DATE_END };
}
function quali(): SessionData {
  return { session_key: 1, session_name: 'Qualifying', session_type: 'Qualifying', date_start: '2024-03-02T15:00:00Z', date_end: DATE_END };
}
function result(p: Partial<SessionResultRecord>): SessionResultRecord {
  return { session_key: 1, meeting_key: 1, driver_number: 1, position: 1, number_of_laps: 57, duration: 5400, gap_to_leader: null, dnf: false, dns: false, dsq: false, ...p };
}

function renderSR(displayTime: Date, session: SessionData, res: SessionResultRecord | null) {
  return render(
    <DataSourceProvider ds={makeFakeDs({ displayTime, getSessionResult: () => res }).ds}>
      <SessionResult driverNumber={1} session={session} />
    </DataSourceProvider>,
  );
}

describe('SessionResult', () => {
  it('종료 전(display_time < date_end) → 렌더 null', () => {
    renderSR(new Date('2024-03-02T15:30:00Z'), race(), result({}));
    expect(screen.queryByTestId('session-result')).toBeNull();
  });

  it('종료 후 → 포지션 + laps + 갭', () => {
    renderSR(new Date('2024-03-02T17:30:00Z'), race(), result({ position: 2, number_of_laps: 57, gap_to_leader: 5.123 }));
    expect(screen.getByTestId('session-result')).toBeTruthy();
    expect(screen.getByText('P2')).toBeTruthy();
    expect(screen.getByText('57 laps')).toBeTruthy();
    expect(screen.getByText('+5.123')).toBeTruthy();
  });

  it('DNF 표지', () => {
    renderSR(new Date('2024-03-02T17:30:00Z'), race(), result({ dnf: true, position: null }));
    expect(screen.getByTestId('result-status')).toBeTruthy();
    expect(screen.getByText('DNF')).toBeTruthy();
  });

  it('Qualifying → Q1/Q2/Q3 배열', () => {
    renderSR(new Date('2024-03-02T17:30:00Z'), quali(), result({ position: 1, duration: [80.123, 79.456, 78.9] }));
    expect(screen.getByTestId('result-quali')).toBeTruthy();
    expect(screen.getByText('Q1 1:20.123')).toBeTruthy();
    expect(screen.getByText('Q3 1:18.900')).toBeTruthy();
  });

  it('종료 후 result null → 결과 없음', () => {
    renderSR(new Date('2024-03-02T17:30:00Z'), race(), null);
    expect(screen.getByText('결과 없음')).toBeTruthy();
  });
});
