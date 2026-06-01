/// @vitest-environment jsdom
// US-9 — PitHistory §3.4: getAllBefore('pit') 만 사용(미래누설 zero=인수17a), null pit_duration → '—'.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PitHistory } from '../PitHistory';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { PitRecord } from '../../../shared/openf1Types';

afterEach(cleanup);
const T = new Date('2024-03-02T15:30:00.000Z');

function pit(p: Partial<PitRecord>): PitRecord {
  return { date: T, driver_number: 1, session_key: 1, meeting_key: 1, lap_number: 1, pit_duration: null, ...p };
}

function renderPH(overrides: Record<string, unknown>) {
  return render(
    <DataSourceProvider ds={makeFakeDs({ displayTime: T, ...overrides }).ds}>
      <PitHistory driverNumber={1} />
    </DataSourceProvider>,
  );
}

describe('PitHistory', () => {
  it('핏 항목 — Lap N · {duration}s, getAllBefore 위임', () => {
    renderPH({
      getAllBefore: (ep: string) => (ep === 'pit' ? [pit({ lap_number: 18, pit_duration: 24.6 }), pit({ lap_number: 35, pit_duration: 22.1 })] : []),
    });
    expect(screen.getByTestId('pit-18')).toBeTruthy();
    expect(screen.getByTestId('pit-35')).toBeTruthy();
    expect(screen.getByText('Lap 18 · 24.6s')).toBeTruthy();
  });

  it('pit_duration null → —', () => {
    renderPH({ getAllBefore: (ep: string) => (ep === 'pit' ? [pit({ lap_number: 12, pit_duration: null })] : []) });
    expect(screen.getByText('Lap 12 · —')).toBeTruthy();
  });

  it('핏 없으면 핏 기록 없음', () => {
    renderPH({ getAllBefore: () => [] });
    expect(screen.getByText('핏 기록 없음')).toBeTruthy();
  });
});
