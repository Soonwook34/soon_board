/// @vitest-environment jsdom
// dashboard §2.7 — EventTicker 패널 단위 테스트. 최근 5건 race_control, 최신 위, 카테고리 아이콘.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EventTicker } from '../EventTicker';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { RaceControlRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

// 헬퍼: RaceControlRecord 생성
function makeRc(partial: Partial<RaceControlRecord> & { message: string }): RaceControlRecord {
  return {
    date: new Date('2024-03-02T12:00:00Z'),
    session_key: 1,
    meeting_key: 1,
    category: 'Other',
    flag: null,
    scope: null,
    sector: null,
    driver_number: null,
    lap_number: null,
    ...partial,
  };
}

describe('EventTicker', () => {
  it('최대 5건 렌더, 최신(인덱스 0) 순으로 표시', () => {
    // getAllBefore 는 이미 최신 위(newest-first)로 반환 — 컴포넌트는 순서를 그대로 렌더링
    const records = [
      makeRc({ message: 'Event A' }),
      makeRc({ message: 'Event B' }),
      makeRc({ message: 'Event C' }),
      makeRc({ message: 'Event D' }),
      makeRc({ message: 'Event E' }),
    ];
    const { ds } = makeFakeDs({
      getAllBefore: (_endpoint: string, _t: Date, _filters: unknown, limit?: number) => {
        if (_endpoint !== 'race_control') return [];
        return limit != null ? records.slice(0, limit) : records;
      },
    });

    render(
      <DataSourceProvider ds={ds}>
        <EventTicker />
      </DataSourceProvider>,
    );

    const items = screen.getAllByTestId('ticker-item');
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain('Event A');
    expect(items[4].textContent).toContain('Event E');
  });

  it('SafetyCar 카테고리 → 🚨 아이콘 표시', () => {
    const records = [makeRc({ message: 'Safety car deployed', category: 'SafetyCar' })];
    const { ds } = makeFakeDs({
      getAllBefore: (_endpoint: string) => {
        if (_endpoint !== 'race_control') return [];
        return records;
      },
    });

    render(
      <DataSourceProvider ds={ds}>
        <EventTicker />
      </DataSourceProvider>,
    );

    expect(screen.getByText('🚨')).toBeTruthy();
    expect(screen.getByText('Safety car deployed')).toBeTruthy();
  });

  it('빈 배열 → "이벤트 없음" 렌더, 크래시 없음', () => {
    const { ds } = makeFakeDs({
      getAllBefore: () => [],
    });

    render(
      <DataSourceProvider ds={ds}>
        <EventTicker />
      </DataSourceProvider>,
    );

    expect(screen.getByText('이벤트 없음')).toBeTruthy();
    expect(screen.queryAllByTestId('ticker-item')).toHaveLength(0);
  });

  it('lap_number 있으면 L# suffix 표시', () => {
    const records = [makeRc({ message: 'Yellow flag sector 3', lap_number: 42 })];
    const { ds } = makeFakeDs({
      getAllBefore: (_endpoint: string) => {
        if (_endpoint !== 'race_control') return [];
        return records;
      },
    });

    render(
      <DataSourceProvider ds={ds}>
        <EventTicker />
      </DataSourceProvider>,
    );

    expect(screen.getByText('L42')).toBeTruthy();
    expect(screen.getByText('Yellow flag sector 3')).toBeTruthy();
  });
});
