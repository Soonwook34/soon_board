/// @vitest-environment jsdom
// US-2 — RaceControlBanner ④.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RaceControlBanner } from '../RaceControlBanner';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { RaceControlRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

const T0 = Date.parse('2024-03-02T15:00:00.000Z');
const at = (sec: number) => new Date(T0 + sec * 1000);

function rc(sec: number, p: Partial<RaceControlRecord>): RaceControlRecord {
  return {
    date: at(sec), session_key: 1, meeting_key: 1, category: '', flag: null,
    scope: null, sector: null, driver_number: null, lap_number: null, message: '', qualifying_phase: null, ...p,
  };
}

const messages = [
  rc(10, { flag: 'YELLOW', category: 'Flag', message: 'YELLOW SECTOR 4' }),
  rc(20, { flag: 'GREEN', category: 'Flag', message: 'GREEN SECTOR 4' }),
];

describe('RaceControlBanner', () => {
  it('YELLOW 구간에서 메시지 표시', () => {
    const { ds } = makeFakeDs({ displayTime: at(15), getAllBefore: () => messages });
    render(<DataSourceProvider ds={ds}><RaceControlBanner /></DataSourceProvider>);
    expect(screen.getByText('YELLOW SECTOR 4')).toBeTruthy();
  });

  it('GREEN 5초 경과 후 활성 없음 → TRACK CLEAR', () => {
    const { ds } = makeFakeDs({ displayTime: at(26), getAllBefore: () => messages });
    render(<DataSourceProvider ds={ds}><RaceControlBanner /></DataSourceProvider>);
    expect(screen.getByText('TRACK CLEAR')).toBeTruthy();
  });

  it('메시지 없으면 TRACK CLEAR (crash 없음)', () => {
    const { ds } = makeFakeDs({ displayTime: at(5), getAllBefore: () => [] });
    render(<DataSourceProvider ds={ds}><RaceControlBanner /></DataSourceProvider>);
    expect(screen.getByText('TRACK CLEAR')).toBeTruthy();
  });
});
