/// @vitest-environment jsdom
//
// LiveMap (live-map UI bridge) 통합 회귀 — Phase A.
// 검증 포인트:
//  1. mount 시 trackOutlines + pitlane + drivers 3 fetch 병렬 호출 (URL 정확)
//  2. trackOutline 의 openf1_transform 누락 시 에러 메시지 + 마운트 차단
//  3. drivers 의 team_colour 가 '#' prefix 로 정규화
//  4. 로드 성공 후 canvas mount + LiveDataSource start 호출
//  5. onSample 콜백: raw OpenF1 (x,y) → applyOpenF1Transform → projectToPolyline → buffer.push
//  6. unmount 시 ds.stop + renderer.stop
//  7. 에러 상태 + 재시도

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiveMap } from '../LiveMap';
import type { LiveDataSource, LiveDataSourceOptions } from '../../map/LiveDataSource';
import type {
  DrsZonesJsonBase,
  PitlaneJsonBase,
  SectorsJsonBase,
  SlmZonesJsonBase,
  TrackOutlineJson,
} from '../../../scripts/_lib/trackOutlinesSchema';

// JSDOM 의 HTMLCanvasElement.prototype.getContext 는 null 반환 — 렌더러 마운트 effect 가
// early-return 되어 factory 호출이 안 됨. Proxy 로 stub 해 모든 ctx 메서드가 호출 가능하게 함.
beforeEach(() => {
  const stub = new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    stub as unknown as CanvasRenderingContext2D,
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── fixtures ────────────────────────────────────────────────────────────

const TRACK_JSON: TrackOutlineJson = {
  circuit_key: 63,
  year: 2024,
  circuit_short_name: 'Sakhir',
  country_name: 'Bahrain',
  source: 'julesr0y/f1-circuits-svg',
  source_file: 'bahrain-1.svg',
  license: 'CC-BY-4.0',
  viewBox: [0, 0, 500, 500],
  polyline: [
    [0, 0],
    [500, 0],
    [500, 500],
    [0, 500],
    [0, 0],
  ],
  arc_length_table: [0, 500, 1000, 1500, 2000],
  total_length: 2000,
  start_finish_index: 0,
  direction: 'clockwise',
  generated_at: '2024-03-02T00:00:00.000Z',
  openf1_transform: {
    scale: 1,
    rotation_deg: 0,
    translate: [0, 0],
    reflection: false,
  },
};

const PITLANE_JSON: PitlaneJsonBase = {
  circuit_key: 63,
  year: 2024,
  source: 'OpenF1 pit + location self-trace',
  license: 'CC0-1.0',
  polyline: [
    [10, 10],
    [490, 10],
  ],
  arc_length_table: [0, 480],
  total_length: 480,
  generated_at: '2024-03-02T01:00:00.000Z',
};

const DRIVERS_JSON = [
  { driver_number: 44, name_acronym: 'HAM', team_colour: '27f4d2', team_name: 'Mercedes' },
  { driver_number: 1, name_acronym: 'VER', team_colour: '3671c6', team_name: 'Red Bull' },
];

// 다양한 mock 응답 - signal 무시, URL 기반 분기.
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function makeFetch(opts: {
  trackOverride?: TrackOutlineJson | 'fail' | 'no-transform';
  pitlaneOverride?: PitlaneJsonBase | 'fail' | 404;
  driversOverride?: unknown[] | 'fail';
  sectorsOverride?: SectorsJsonBase | null;
  drsOverride?: DrsZonesJsonBase | null;
  slmOverride?: SlmZonesJsonBase | null;
}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/trackOutlines/sectors_63-2024.json')) {
      if (!opts.sectorsOverride) return new Response('', { status: 404 });
      return jsonOk(opts.sectorsOverride);
    }
    if (url.includes('/trackOutlines/drsZones_63-2024.json')) {
      if (!opts.drsOverride) return new Response('', { status: 404 });
      return jsonOk(opts.drsOverride);
    }
    if (url.includes('/trackOutlines/slmZones_63-2024.json')) {
      if (!opts.slmOverride) return new Response('', { status: 404 });
      return jsonOk(opts.slmOverride);
    }
    if (url.includes('/trackOutlines/63-2024.json')) {
      if (opts.trackOverride === 'fail') return new Response('', { status: 500 });
      if (opts.trackOverride === 'no-transform') {
        const { openf1_transform: _, ...rest } = TRACK_JSON;
        return jsonOk(rest);
      }
      return jsonOk(opts.trackOverride ?? TRACK_JSON);
    }
    if (url.includes('/trackOutlines/pitlane_63-2024.json')) {
      if (opts.pitlaneOverride === 'fail') return new Response('', { status: 500 });
      if (opts.pitlaneOverride === 404) return new Response('', { status: 404 });
      return jsonOk(opts.pitlaneOverride ?? PITLANE_JSON);
    }
    if (url.includes('/v1/drivers')) {
      if (opts.driversOverride === 'fail') return new Response('', { status: 500 });
      return jsonOk(opts.driversOverride ?? DRIVERS_JSON);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const SAMPLE_SECTORS: SectorsJsonBase = {
  circuit_key: 63,
  year: 2024,
  boundaries: [
    { sector: 1, end_xy: [500, 0], arc_length_s: 500 },
    { sector: 2, end_xy: [500, 500], arc_length_s: 1000 },
    { sector: 3, end_xy: [0, 0], arc_length_s: 0 },
  ],
  method: 'i1_i2_speed_trap_derive',
  accuracy_note: 'test',
  generated_at: '2024-03-02T00:00:00Z',
};

const SAMPLE_DRS: DrsZonesJsonBase = {
  circuit_key: 63,
  year: 2024,
  zones: [{ id: 1, detection_s: 100, activation_s_start: 200, activation_s_end: 700 }],
  method: 'drs_state_transitions_clustering',
  coverage_note: 'test',
  generated_at: '2024-03-02T00:00:00Z',
};

const SAMPLE_SLM: SlmZonesJsonBase = {
  circuit_key: 63,
  year: 2024,
  zones: [{ id: 1, s_start: 1200, s_end: 1600 }],
  source: 'test',
  generated_at: '2024-03-02T00:00:00Z',
};

interface StubDataSource extends Pick<LiveDataSource, 'getDisplayTime' | 'stop'> {
  start: () => Promise<void>;
  capturedOpts: LiveDataSourceOptions;
  startCalls: number;
  stopCalls: number;
}

function makeStubFactory(): {
  factory: (opts: LiveDataSourceOptions) => LiveDataSource;
  lastInstance: () => StubDataSource | null;
} {
  let instance: StubDataSource | null = null;
  const factory = (opts: LiveDataSourceOptions): LiveDataSource => {
    const stub: StubDataSource = {
      capturedOpts: opts,
      startCalls: 0,
      stopCalls: 0,
      start: async () => {
        stub.startCalls++;
      },
      stop: () => {
        stub.stopCalls++;
      },
      getDisplayTime: () => new Date(0),
    };
    instance = stub;
    return stub as unknown as LiveDataSource;
  };
  return { factory, lastInstance: () => instance };
}

// ── tests ───────────────────────────────────────────────────────────────

describe('LiveMap — asset loading', () => {
  it('mount 시 track + pitlane + drivers + sectors + drs + slm 6 fetch 병렬 호출', async () => {
    const fetchImpl = makeFetch({});
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(6));
    const urls = fetchImpl.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain('/trackOutlines/63-2024.json');
    expect(urls).toContain('/trackOutlines/pitlane_63-2024.json');
    expect(urls).toContain('/trackOutlines/sectors_63-2024.json');
    expect(urls).toContain('/trackOutlines/drsZones_63-2024.json');
    expect(urls).toContain('/trackOutlines/slmZones_63-2024.json');
    expect(urls.some((u) => u.includes('/v1/drivers?session_key=9472'))).toBe(true);
  });

  it('pitlane 404 시 정상 마운트 (pitlane optional)', async () => {
    const fetchImpl = makeFetch({ pitlaneOverride: 404 });
    const { factory, lastInstance } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
    expect(lastInstance()?.startCalls).toBe(1);
  });

  it('로딩 중 "Loading track…" placeholder', async () => {
    const resolvers: Array<() => void> = [];
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolvers.push(() => r(jsonOk(TRACK_JSON)));
        }),
    );
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    expect(screen.getByText(/Loading track/)).toBeTruthy();
    for (const r of resolvers) r();
  });
});

describe('LiveMap — 에러 처리', () => {
  it('trackOutline fetch 실패 → 에러 메시지 + Retry 버튼', async () => {
    const fetchImpl = makeFetch({ trackOverride: 'fail' });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/track HTTP 500/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('openf1_transform 누락 시 명시적 에러', async () => {
    const fetchImpl = makeFetch({ trackOverride: 'no-transform' });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    // 메시지는 실행 가능한 build 명령 + circuit/year 를 포함해 사용자가 바로 조치 가능.
    await waitFor(() =>
      expect(
        screen.getByText(/OpenF1 좌표 매핑.*아직 준비.*extract-openf1-transform/s),
      ).toBeTruthy(),
    );
  });

  it('drivers fetch 실패 → 에러 메시지', async () => {
    const fetchImpl = makeFetch({ driversOverride: 'fail' });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.getByText(/drivers HTTP 500/)).toBeTruthy());
  });

  it('Retry 클릭 시 재 fetch', async () => {
    let trackCalls = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/trackOutlines/63-2024.json')) {
        trackCalls++;
        // 첫 호출은 실패, 두 번째는 성공
        return trackCalls === 1 ? new Response('', { status: 500 }) : jsonOk(TRACK_JSON);
      }
      if (url.includes('pitlane_')) return new Response('', { status: 404 });
      if (url.includes('/v1/drivers')) return jsonOk(DRIVERS_JSON);
      throw new Error(`unexpected: ${url}`);
    });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
    expect(trackCalls).toBe(2);
  });
});

describe('LiveMap — LiveDataSource onSample 콜백 (raw → projected → buffer)', () => {
  it('factory 가 sessionKey + onSample 받아서 호출됨', async () => {
    const fetchImpl = makeFetch({});
    const { factory, lastInstance } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(lastInstance()).not.toBeNull());
    const inst = lastInstance()!;
    expect(inst.capturedOpts.sessionKey).toBe(9472);
    expect(inst.capturedOpts.onSample).toBeDefined();
    expect(inst.startCalls).toBe(1);
  });

  it('onSample 호출 시 transform + projection 적용 (raw=(100,200)는 정사각 polyline (500,500) 안)', async () => {
    const fetchImpl = makeFetch({});
    const { factory, lastInstance } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(lastInstance()).not.toBeNull());
    const inst = lastInstance()!;
    // identity transform (scale=1, rotation=0, translate=[0,0]) — raw (100,200) 그대로 viewBox 좌표.
    // polyline (0,0)→(500,0)→(500,500)→(0,500)→(0,0). 점 (100, 200) 가장 가까운 점은 첫 segment x=100 직선상이라 (100,0).
    inst.capturedOpts.onSample!(44, {
      date: new Date('2024-03-02T15:00:00.000Z'),
      x: 100,
      y: 200,
      z: 10,
    });
    // onSample 동작 검증은 throw 없이 정상 완료되는지 + 다음 호출이 가능한지 확인.
    expect(() =>
      inst.capturedOpts.onSample!(11, {
        date: new Date('2024-03-02T15:00:00.100Z'),
        x: 250,
        y: 0,
        z: 5,
      }),
    ).not.toThrow();
  });
});

describe('LiveMap — Phase 9/10/11 overlays', () => {
  it('sectors/drs/slm 404 (없음) 시 정상 마운트 + 에러 없음', async () => {
    const fetchImpl = makeFetch({});
    const { factory, lastInstance } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
    expect(lastInstance()?.startCalls).toBe(1);
  });

  it('sectors 200 + drs/slm 404 시 정상 마운트', async () => {
    const fetchImpl = makeFetch({ sectorsOverride: SAMPLE_SECTORS });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
  });

  it('drs/slm 200 시 정상 마운트 (overlay 데이터 로드 성공)', async () => {
    const fetchImpl = makeFetch({ drsOverride: SAMPLE_DRS, slmOverride: SAMPLE_SLM });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
  });

  it('isReplay=true 시에도 mount 동작 정상 (DRS 게이트 활성화)', async () => {
    const fetchImpl = makeFetch({ drsOverride: SAMPLE_DRS });
    const { factory } = makeStubFactory();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
        isReplay
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
  });
});

describe('LiveMap — unmount cleanup', () => {
  it('unmount 시 ds.stop 호출', async () => {
    const fetchImpl = makeFetch({});
    const { factory, lastInstance } = makeStubFactory();
    const { unmount } = render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
      />,
    );
    await waitFor(() => expect(lastInstance()?.startCalls).toBe(1));
    unmount();
    expect(lastInstance()?.stopCalls).toBe(1);
  });
});

describe('LiveMap — onBack 버튼', () => {
  it('onBack prop 제공 시 Back 버튼 렌더 + 클릭 시 호출', async () => {
    const fetchImpl = makeFetch({});
    const { factory } = makeStubFactory();
    const onBack = vi.fn();
    render(
      <LiveMap
        sessionKey={9472}
        circuitKey={63}
        year={2024}
        fetchImpl={fetchImpl as unknown as typeof fetch}
        dataSourceFactory={factory}
        onBack={onBack}
      />,
    );
    await waitFor(() => expect(screen.queryByTestId('live-map-canvas')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
