/// @vitest-environment jsdom
// US-6 — TyreStrategy ⑥ + Issue #89 (인수5) 반개구간 타일링 단위 테스트.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TyreStrategy, stintLapSpans } from '../TyreStrategy';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { DriversProvider, type DriversMap } from '../../shared/DriversContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { DriverRecord, PitRecord, StintRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

const T = new Date('2024-03-02T15:30:00.000Z');

function stint(p: Partial<StintRecord>): StintRecord {
  return {
    session_key: 1, meeting_key: 1, driver_number: 1, stint_number: 1,
    lap_start: 1, lap_end: 1, compound: 'SOFT', tyre_age_at_start: 0, ...p,
  };
}

function mkDriver(p: Partial<DriverRecord>): DriverRecord {
  return {
    driver_number: 1, session_key: 1, meeting_key: 1, broadcast_name: 'DRV',
    full_name: 'Driver', name_acronym: 'DRV', team_name: 'Team', team_colour: '3671C6',
    first_name: 'D', last_name: 'River', headshot_url: null, country_code: null, ...p,
  };
}

function driversOf(...records: DriverRecord[]): DriversMap {
  return new Map(records.map((d) => [d.driver_number, d]));
}

// leaderCurrentLap → position 리더(1) + getLapAt(lap_number)
function leaderOverrides(lap: number) {
  return {
    getLatestBefore: (_ep: string, _t: Date, filters?: { position?: number }) =>
      filters?.position === 1 ? { driver_number: 1, position: 1 } : null,
    getLapAt: () => ({ lap_number: lap }),
  };
}

// TyreStrategy 는 stints 를 getStintForLap(driver, lap) 으로 lap 순회 수집한다 (stints 는 date 없는
// lap-keyed endpoint 라 getAllBefore 로는 못 가져옴 — 실 DataSource 회귀). 그 동작을 stub.
function stintForLapOf(all: StintRecord[]) {
  return (driverNum: number, lap: number): StintRecord | null =>
    all.find((s) => s.driver_number === driverNum && lap >= s.lap_start && lap <= s.lap_end) ?? null;
}

describe('stintLapSpans — Issue #89 (인수5)', () => {
  it('공유 경계 lap(18)을 중복 계산하지 않는다 (총 34, NOT 35)', () => {
    const stints = [
      stint({ stint_number: 1, lap_start: 1, lap_end: 18, compound: 'SOFT' }),
      stint({ stint_number: 2, lap_start: 18, lap_end: 34, compound: 'HARD' }),
    ];
    const spans = stintLapSpans(stints, 34);

    expect(spans).toHaveLength(2);
    // 첫 스틴트 끝은 17 (다음 스틴트 시작 18 직전) — 공유 lap 18 중복 제거.
    expect(spans[0].endLap).toBe(17);
    expect(spans[1].startLap).toBe(18);
    expect(spans[1].endLap).toBe(34);

    const totalLapsCounted = spans.reduce((acc, s) => acc + (s.endLap - s.startLap + 1), 0);
    expect(totalLapsCounted).toBe(34);
  });

  it('time-desc 입력도 lap_start 오름차순으로 타일링한다', () => {
    const stints = [
      stint({ stint_number: 2, lap_start: 18, lap_end: 34, compound: 'HARD' }),
      stint({ stint_number: 1, lap_start: 1, lap_end: 18, compound: 'SOFT' }),
    ];
    const spans = stintLapSpans(stints, 34);
    expect(spans.map((s) => s.startLap)).toEqual([1, 18]);
    expect(spans[0].endLap).toBe(17);
  });
});

describe('TyreStrategy', () => {
  it('드라이버별 row + compound 색 segment 렌더', () => {
    const stints = [
      stint({ driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 12, compound: 'SOFT' }),
      stint({ driver_number: 1, stint_number: 2, lap_start: 12, lap_end: 20, compound: 'MEDIUM' }),
      stint({ driver_number: 16, stint_number: 1, lap_start: 1, lap_end: 20, compound: 'HARD' }),
    ];
    const { ds } = makeFakeDs({
      displayTime: T,
      ...leaderOverrides(20),
      getStintForLap: stintForLapOf(stints),
    });
    const drivers = driversOf(
      mkDriver({ driver_number: 1, name_acronym: 'VER' }),
      mkDriver({ driver_number: 16, name_acronym: 'LEC' }),
    );
    const { container } = render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={drivers}>
          <TyreStrategy />
        </DriversProvider>
      </DataSourceProvider>,
    );

    expect(screen.getByTestId('tyre-row-1')).toBeTruthy();
    expect(screen.getByTestId('tyre-row-16')).toBeTruthy();
    // VER 2 스틴트 + LEC 1 스틴트 = 3 segment.
    expect(container.querySelectorAll('[data-compound]')).toHaveLength(3);
    expect(screen.getByText('VER')).toBeTruthy();
    expect(screen.getByText('LEC')).toBeTruthy();
  });

  it('compound 값이 data-compound 로 노출된다 (hex 미검증, jsdom rgb)', () => {
    const stints = [
      stint({ driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 20, compound: 'SOFT' }),
    ];
    const { ds } = makeFakeDs({
      displayTime: T,
      ...leaderOverrides(20),
      getStintForLap: stintForLapOf(stints),
    });
    const drivers = driversOf(mkDriver({ driver_number: 1, name_acronym: 'VER' }));
    const { container } = render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={drivers}>
          <TyreStrategy />
        </DriversProvider>
      </DataSourceProvider>,
    );
    const seg = container.querySelector('[data-compound]') as HTMLElement;
    expect(seg.getAttribute('data-compound')).toBe('SOFT');
  });

  it('핏점 — pit lap 에 dot 렌더', () => {
    const stints = [
      stint({ driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 12, compound: 'SOFT' }),
      stint({ driver_number: 1, stint_number: 2, lap_start: 12, lap_end: 20, compound: 'HARD' }),
    ];
    const pits: PitRecord[] = [
      { date: T, driver_number: 1, session_key: 1, meeting_key: 1, lap_number: 12, pit_duration: 22.1 },
    ];
    const { ds } = makeFakeDs({
      displayTime: T,
      ...leaderOverrides(20),
      getStintForLap: stintForLapOf(stints),
      getAllBefore: (endpoint: string, _t: Date, filters?: { driver_number?: number }) => {
        if (endpoint === 'pit') return pits.filter((p) => p.driver_number === filters?.driver_number);
        return [];
      },
    });
    const drivers = driversOf(mkDriver({ driver_number: 1, name_acronym: 'VER' }));
    render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={drivers}>
          <TyreStrategy />
        </DriversProvider>
      </DataSourceProvider>,
    );
    expect(screen.getByTestId('tyre-pit-1')).toBeTruthy();
  });

  it('스틴트 없음 → crash 없이 "데이터 없음"', () => {
    const { ds } = makeFakeDs({
      displayTime: T,
      ...leaderOverrides(20),
      getAllBefore: () => [],
    });
    const drivers = driversOf(mkDriver({ driver_number: 1, name_acronym: 'VER' }));
    render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={drivers}>
          <TyreStrategy />
        </DriversProvider>
      </DataSourceProvider>,
    );
    expect(screen.getByTestId('tyre-strategy')).toBeTruthy();
    expect(screen.getByText('데이터 없음')).toBeTruthy();
  });

  it('currentLap 0 (리더 없음) → "데이터 없음"', () => {
    const { ds } = makeFakeDs({
      displayTime: T,
      getLatestBefore: () => null, // 리더 없음 → currentLap 0 → 스틴트 순회 안 함
    });
    const drivers = driversOf(mkDriver({ driver_number: 1, name_acronym: 'VER' }));
    render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={drivers}>
          <TyreStrategy />
        </DriversProvider>
      </DataSourceProvider>,
    );
    expect(screen.getByText('데이터 없음')).toBeTruthy();
  });
});
