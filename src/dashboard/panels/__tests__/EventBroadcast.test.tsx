/// @vitest-environment jsdom
// US-D — EventBroadcast §2.7/#5: 중요 이벤트 전진 시 상단 알림 + 자동 사라짐 + 미래 누설 zero.
// 시간 의존 fake ds 로 setTime forward/backward. (전진 시크는 useDisplayTime 즉시 반영 = 2초 초과 점프.)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { EventBroadcast } from '../EventBroadcast';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { RaceControlRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

const T0 = new Date('2024-03-02T12:00:00Z').valueOf();
const at = (sec: number) => new Date(T0 + sec * 1000);

function rc(p: Partial<RaceControlRecord> & { date: Date; message: string }): RaceControlRecord {
  return {
    session_key: 1, meeting_key: 1, category: 'Flag', flag: null, scope: null,
    sector: null, driver_number: null, lap_number: null, ...p,
  } as RaceControlRecord;
}

// getAllBefore('race_control', t, undefined, 1) 모사 — date≤t 중 최신 limit 건.
function latestBefore(events: RaceControlRecord[], t: Date, limit?: number) {
  return events
    .filter((e) => e.date instanceof Date && e.date.valueOf() <= t.valueOf())
    .sort((a, b) => (b.date as Date).valueOf() - (a.date as Date).valueOf())
    .slice(0, limit ?? 5);
}

function mount(initial: Date, events: RaceControlRecord[]) {
  const handle = makeFakeDs({
    displayTime: initial,
    getAllBefore: (ep: string, t: Date, _f: unknown, limit?: number) =>
      ep === 'race_control' ? latestBefore(events, t, limit) : [],
  });
  render(
    <DataSourceProvider ds={handle.ds}>
      <EventBroadcast />
    </DataSourceProvider>,
  );
  return handle;
}

const YELLOW = rc({ date: at(30), message: 'YELLOW SECTOR 4', flag: 'YELLOW' });
const INFO = rc({ date: at(30), message: 'TRACK LIMITS TURN 5', flag: null, category: 'Other' });

describe('EventBroadcast', () => {
  it('전진 시크로 중요 플래그 새로 지나면 상단 알림 (D2-1)', () => {
    const h = mount(at(0), [YELLOW]); // 마운트 시점엔 이벤트 없음(YELLOW@+30 > 0)
    expect(screen.queryByTestId('event-broadcast')).toBeNull();
    act(() => h.setTime(at(45))); // 전진 → YELLOW 크로스
    expect(screen.getByTestId('event-broadcast').textContent).toContain('YELLOW SECTOR 4');
  });

  it('비중요(other) 이벤트는 알림 없음 (D2-2)', () => {
    const h = mount(at(0), [INFO]);
    act(() => h.setTime(at(45)));
    expect(screen.queryByTestId('event-broadcast')).toBeNull();
  });

  it('마운트(기존 최신) + 후진 시크 → 알림 없음 (D2-3)', () => {
    const h = mount(at(45), [YELLOW]); // 마운트 시 YELLOW 이미 최신 → baseline, 무통지
    expect(screen.queryByTestId('event-broadcast')).toBeNull();
    act(() => h.setTime(at(10))); // 후진 → latest 없음
    expect(screen.queryByTestId('event-broadcast')).toBeNull();
  });

  it('~5s 후 자동 사라짐 (D2-4)', () => {
    vi.useFakeTimers();
    try {
      const h = mount(at(0), [YELLOW]);
      act(() => h.setTime(at(45)));
      expect(screen.getByTestId('event-broadcast')).toBeTruthy();
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.queryByTestId('event-broadcast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('미래 누설 zero — t 이후 이벤트로는 발생 안 함 (D2-5)', () => {
    const future = rc({ date: at(100), message: 'RED FLAG', flag: 'RED' });
    const h = mount(at(0), [future]);
    act(() => h.setTime(at(50))); // future@+100 은 t=50 이후 → getAllBefore 가 컷 → latest 없음
    expect(screen.queryByTestId('event-broadcast')).toBeNull();
  });
});
