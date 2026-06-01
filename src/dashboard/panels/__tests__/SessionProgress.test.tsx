/// @vitest-environment jsdom
// US-4 — SessionProgress ②.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { SessionProgress } from '../SessionProgress';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { SessionData } from '../../../shared/seasonData';

afterEach(cleanup);

const raceSession: SessionData = {
  session_key: 1, session_name: 'Race', session_type: 'Race',
  date_start: '2024-03-02T15:00:00Z', date_end: '2024-03-02T17:00:00Z',
};
const practiceSession: SessionData = {
  session_key: 2, session_name: 'Practice 1', session_type: 'Practice',
  date_start: '2024-03-02T11:30:00Z', date_end: '2024-03-02T12:30:00Z',
};

// leaderCurrentLap → position 리더 + getLapAt
const leaderOverrides = {
  getLatestBefore: (_ep: string, _t: Date, filters?: { position?: number }) =>
    filters?.position === 1 ? { driver_number: 1, position: 1 } : null,
  getLapAt: () => ({ lap_number: 12 }),
};

describe('SessionProgress — race (lap mode)', () => {
  it('raceDistance 룩업 성공 → LAP n / M', async () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T15:30:00Z'), ...leaderOverrides });
    render(
      <DataSourceProvider ds={ds}>
        <SessionProgress
          session={raceSession}
          circuitKey={63}
          year={2024}
          loadRaceDistanceImpl={() => Promise.resolve(new Map([['63:2024', 57]]))}
        />
      </DataSourceProvider>,
    );
    expect(await screen.findByText('LAP 12 / 57')).toBeTruthy();
  });

  it('raceDistance miss → LAP n / ?? (graceful degrade)', async () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T15:30:00Z'), ...leaderOverrides });
    render(
      <DataSourceProvider ds={ds}>
        <SessionProgress
          session={raceSession}
          circuitKey={63}
          year={2024}
          loadRaceDistanceImpl={() => Promise.resolve(new Map())}
        />
      </DataSourceProvider>,
    );
    expect(await screen.findByText('LAP 12 / ??')).toBeTruthy();
  });
});

describe('SessionProgress — practice (time mode)', () => {
  it('경과/총 시간 + 진행률 50%', () => {
    const { ds } = makeFakeDs({ displayTime: new Date('2024-03-02T12:00:00Z') }); // 30min/60min
    const { getByTestId } = render(
      <DataSourceProvider ds={ds}>
        <SessionProgress session={practiceSession} circuitKey={63} year={2024} />
      </DataSourceProvider>,
    );
    expect(screen.getByText('30:00')).toBeTruthy();
    expect(screen.getByText('1:00:00')).toBeTruthy();
    expect((getByTestId('progress-fill') as HTMLElement).style.width).toBe('50%');
  });
});
