/// @vitest-environment jsdom
// US-1 — WeatherMini ⑨.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WeatherMini } from '../WeatherMini';
import { DataSourceProvider } from '../../shared/DataSourceContext';
import { makeFakeDs } from '../../__tests__/fakeDataSource';
import type { WeatherRecord } from '../../../shared/openf1Types';

afterEach(cleanup);

const weather: WeatherRecord = {
  date: new Date('2024-03-02T15:00:00Z'),
  session_key: 1,
  meeting_key: 1,
  air_temperature: 27.4,
  humidity: 40,
  pressure: 1010,
  rainfall: 0,
  track_temperature: 41.2,
  wind_direction: 90,
  wind_speed: 3.6,
};

describe('WeatherMini', () => {
  it('최신 날씨 값 표시 (기온/노면/강수/바람)', () => {
    const { ds } = makeFakeDs({ getLatestBefore: () => weather });
    render(<DataSourceProvider ds={ds}><WeatherMini /></DataSourceProvider>);
    expect(screen.getByText('27°')).toBeTruthy();
    expect(screen.getByText('41°')).toBeTruthy();
    expect(screen.getByText('☀')).toBeTruthy(); // rainfall 0
    expect(screen.getByText('4 →')).toBeTruthy(); // wind 3.6→4, 90°→→
  });

  it('비 오면 🌧', () => {
    const { ds } = makeFakeDs({ getLatestBefore: () => ({ ...weather, rainfall: 1 }) });
    render(<DataSourceProvider ds={ds}><WeatherMini /></DataSourceProvider>);
    expect(screen.getByText('🌧')).toBeTruthy();
  });

  it('풍향 정규화 — 0°→↑, 음수 방어(-90°→←)', () => {
    const { ds: ds0 } = makeFakeDs({ getLatestBefore: () => ({ ...weather, wind_speed: 5, wind_direction: 0 }) });
    const r0 = render(<DataSourceProvider ds={ds0}><WeatherMini /></DataSourceProvider>);
    expect(screen.getByText('5 ↑')).toBeTruthy();
    r0.unmount();
    const { ds: dsNeg } = makeFakeDs({ getLatestBefore: () => ({ ...weather, wind_speed: 5, wind_direction: -90 }) });
    render(<DataSourceProvider ds={dsNeg}><WeatherMini /></DataSourceProvider>);
    expect(screen.getByText('5 ←')).toBeTruthy();
  });

  it('데이터 없으면 — fallback (crash 없음)', () => {
    const { ds } = makeFakeDs({ getLatestBefore: () => null });
    render(<DataSourceProvider ds={ds}><WeatherMini /></DataSourceProvider>);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });
});
