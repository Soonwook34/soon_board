/// @vitest-environment jsdom
// dashboard §2.8 — FastestLapBadges ⑧ 테스트.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FastestLapBadges } from '../FastestLapBadges';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { DriversProvider } from '../../shared/DriversContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { DriverRecord, LapRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

function mkDriver(driver_number: number, name_acronym: string, team_colour: string): DriverRecord {
  return {
    driver_number,
    session_key: 1,
    meeting_key: 1,
    broadcast_name: name_acronym,
    full_name: name_acronym,
    name_acronym,
    team_name: 'Team',
    team_colour,
    first_name: name_acronym,
    last_name: name_acronym,
    headshot_url: null,
    country_code: null,
  };
}

const driversMap = new Map<number, DriverRecord>([
  [1, mkDriver(1, 'VER', '3671c6')],
  [44, mkDriver(44, 'HAM', '27f4d2')],
]);

const fakeLaps: LapRecord[] = [
  { driver_number: 44, st_speed: 342 } as unknown as LapRecord,
  { driver_number: 1, st_speed: 330 } as unknown as LapRecord,
];

function renderBadges(overrides: Record<string, unknown> = {}) {
  const { ds } = makeFakeDs({
    displayTime: new Date('2024-03-02T15:30:00Z'),
    getAggregateBefore: (name: string) => {
      if (name === 'fastest_lap') return { driver_number: 1, lap_number: 10, lap_duration: 91.456 };
      if (name === 'purple_sectors') return {
        s1: { driver_number: 1, sector_duration: 28.1 },
        s2: { driver_number: 44, sector_duration: 30.2 },
        s3: { driver_number: 1, sector_duration: 33.0 },
      };
      return new Map();
    },
    getAllBefore: (endpoint: string) => endpoint === 'laps' ? fakeLaps : [],
    ...overrides,
  });
  render(
    <DataSourceProvider ds={ds}>
      <DriversProvider drivers={driversMap}>
        <FastestLapBadges />
      </DriversProvider>
    </DataSourceProvider>,
  );
}

describe('FastestLapBadges', () => {
  it('fastest lap card shows formatted time + VER', () => {
    renderBadges();
    const card = screen.getByTestId('badge-fastest-lap');
    // 91.456s = 1:31.456
    expect(card.textContent).toContain('1:31.456');
    expect(card.textContent).toContain('VER');
  });

  it('S1/S2/S3 cards show sector durations + acronym', () => {
    renderBadges();
    const s1 = screen.getByTestId('badge-s1');
    expect(s1.textContent).toContain('28.100');
    expect(s1.textContent).toContain('VER');

    const s2 = screen.getByTestId('badge-s2');
    expect(s2.textContent).toContain('30.200');
    expect(s2.textContent).toContain('HAM');

    const s3 = screen.getByTestId('badge-s3');
    expect(s3.textContent).toContain('33.000');
    expect(s3.textContent).toContain('VER');
  });

  it('speed card shows max st_speed (342) + HAM', () => {
    renderBadges();
    const card = screen.getByTestId('badge-speed');
    expect(card.textContent).toContain('342');
    expect(card.textContent).toContain('HAM');
  });

  it('speed trap picks the MAX (342 over 330)', () => {
    renderBadges();
    const card = screen.getByTestId('badge-speed');
    // 342 is max — HAM, not VER (330)
    expect(card.textContent).toContain('342');
    expect(card.textContent).not.toContain('330');
  });

  it('all-null aggregates + empty laps → cards show —, no crash', () => {
    const { ds } = makeFakeDs({
      displayTime: new Date('2024-03-02T15:30:00Z'),
      getAggregateBefore: () => null,
      getAllBefore: () => [],
    });
    render(
      <DataSourceProvider ds={ds}>
        <DriversProvider drivers={driversMap}>
          <FastestLapBadges />
        </DriversProvider>
      </DataSourceProvider>,
    );
    expect(screen.getByTestId('fastest-badges')).toBeTruthy();
    // Each of the 5 cards should show — when data is null
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(5);
  });
});
