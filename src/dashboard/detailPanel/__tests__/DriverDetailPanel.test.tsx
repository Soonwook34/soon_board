/// @vitest-environment jsdom
// US-8C — DriverDetailPanel 컨테이너: selectionStore 구독 + 닫기(X·ESC).
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DriverDetailPanel } from '../DriverDetailPanel';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { DriversProvider, type DriversMap } from '../../shared/DriversContext';
import { selectDriver, _resetSelection } from '../../shared/selectionStore';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { DriverRecord } from '../../../shared/openf1Types';
import type { SessionData } from '../../../shared/seasonData';

afterEach(() => {
  cleanup();
  _resetSelection();
});

const T = new Date('2024-03-02T15:30:00.000Z');
const session: SessionData = {
  session_key: 1, session_name: 'Race', session_type: 'Race',
  date_start: '2024-03-02T15:00:00Z', date_end: '2024-03-02T17:00:00Z', // 종료 미래 → 결과 숨김
};

function drivers1(): DriversMap {
  const d: DriverRecord = {
    driver_number: 1, session_key: 1, meeting_key: 1, broadcast_name: 'VER', full_name: 'Max Verstappen',
    name_acronym: 'VER', team_name: 'Red Bull', team_colour: '3671C6', first_name: 'Max', last_name: 'V',
    headshot_url: null, country_code: 'NED',
  };
  return new Map([[1, d]]);
}

function renderPanel() {
  return render(
    <DataSourceProvider ds={makeFakeDs({ displayTime: T }).ds}>
      <DriversProvider drivers={drivers1()}>
        <DriverDetailPanel session={session} />
      </DriversProvider>
    </DataSourceProvider>,
  );
}

describe('DriverDetailPanel', () => {
  it('선택 없으면 렌더 null', () => {
    renderPanel();
    expect(screen.queryByTestId('driver-detail')).toBeNull();
  });

  it('selectDriver 후 패널 + 헤더 + 현재상태 등장', () => {
    act(() => selectDriver(1));
    renderPanel();
    expect(screen.getByTestId('driver-detail')).toBeTruthy();
    expect(screen.getByTestId('driver-header')).toBeTruthy();
    expect(screen.getByTestId('current-state')).toBeTruthy();
    expect(screen.getByText('Max Verstappen')).toBeTruthy();
  });

  it('G — 헤더 다음 5섹션이 구분선 래퍼(detail-section)로 감싸짐', () => {
    act(() => selectDriver(1));
    renderPanel();
    const sections = screen.getAllByTestId('detail-section');
    expect(sections).toHaveLength(5); // CurrentState/RecentLaps/Pit/Stint/SessionResult
    expect(sections[0].style.borderTop).toContain('1px'); // 상단 구분선
  });

  it('X 버튼 클릭 → 닫힘', () => {
    act(() => selectDriver(1));
    renderPanel();
    fireEvent.click(screen.getByTestId('detail-close'));
    expect(screen.queryByTestId('driver-detail')).toBeNull();
  });

  it('ESC 키 → 닫힘', () => {
    act(() => selectDriver(1));
    renderPanel();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(screen.queryByTestId('driver-detail')).toBeNull();
  });
});
