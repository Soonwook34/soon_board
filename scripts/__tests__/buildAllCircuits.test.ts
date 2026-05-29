// scripts/build-all-circuits.ts — bulk pipeline 회귀 (Phase 14).
//
// 검증 포인트:
//  - 3 entry 입력 → 1 ok + 1 extract-failed + 1 svg-missing → residual-report.json 정확히 3 entries
//  - --key/--year filter
//  - --dry-run → fetchImpl 호출 0회
//  - exit-code 시맨틱: ok ≥ 1 이면 0, 전부 실패면 1 (CLI 단에서 처리)

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAllCircuits,
  parseCliArgs,
  shouldExitWithError,
  type BuildAllCircuitsOptions,
  type BuildAllCircuitsResult,
} from '../build-all-circuits.js';
import type { CircuitsConfig } from '../fetch-circuit-maps.js';
import type { OpenF1Client } from '../_lib/openf1Client.js';

const TMP = join(tmpdir(), `build-all-circuits-test-${process.pid}`);
const OUTPUT = join(TMP, 'output');

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

function makeConfig(circuits: Array<Partial<CircuitsConfig['circuits'][number]>> = []): CircuitsConfig {
  return {
    default_variant: 'minimal/white-outline',
    circuits: circuits.map((c, i) => ({
      circuit_key: c.circuit_key ?? 60 + i,
      circuit_short_name: c.circuit_short_name ?? `Test-${i}`,
      country_name: c.country_name ?? 'Testland',
      year: c.year ?? 2024,
      julesr0y_layout_id: c.julesr0y_layout_id ?? `test-${i}`,
      direction: c.direction,
    })),
  };
}

/**
 * 합성 OpenF1Client:
 *  - sessions: race session 1개 반환 (모든 circuit_key 에 공통)
 *  - laps: 빠른 lap 1개 반환
 *  - location: routeMap 의 circuit_key 별로 sample 배열 반환 — [] 이면 extract fails (insufficient samples)
 *  - pit: 빈 배열 (pitlane tracer 가 fallback 으로 처리)
 *
 * locationByCircuitKey 가 undefined 면 extract / pitlane 둘 다 정상 케이스.
 */
function makeMockClient(opts: {
  locationByCircuitKey?: Record<number, Array<{ date: string; x: number; y: number; z: number; driver_number: number }>>;
  pitFails?: Set<number>;
}): { client: OpenF1Client; calls: number; lastCircuitKey: number } {
  const state = { client: null as unknown as OpenF1Client, calls: 0, lastCircuitKey: 0 };
  const get = vi.fn(async (path: string, params?: Record<string, unknown>) => {
    state.calls++;
    const circuitKey = Number(params?.circuit_key ?? state.lastCircuitKey);
    if (params?.circuit_key !== undefined) state.lastCircuitKey = circuitKey;
    if (path === '/v1/sessions') {
      return [
        {
          session_key: circuitKey * 100,
          session_type: 'Race',
          session_name: 'Race',
          date_start: '2024-03-02T15:00:00.000Z',
          date_end: '2024-03-02T17:00:00.000Z',
          year: 2024,
          circuit_key: circuitKey,
        },
      ];
    }
    if (path === '/v1/laps') {
      return [
        {
          session_key: circuitKey * 100,
          driver_number: 1,
          lap_number: 5,
          lap_duration: 91.234,
          date_start: '2024-03-02T15:30:00.000Z',
          is_pit_out_lap: false,
        },
      ];
    }
    if (path === '/v1/location') {
      const samples = opts.locationByCircuitKey?.[circuitKey] ?? generateTrackLocation(circuitKey);
      return samples;
    }
    if (path === '/v1/pit') {
      if (opts.pitFails?.has(circuitKey)) {
        throw new Error(`mock: pit-failed for circuit ${circuitKey}`);
      }
      return [];
    }
    throw new Error(`mock: no route for ${path}`);
  });
  state.client = { get } as unknown as OpenF1Client;
  return state;
}

// 정사각 트랙 위의 sample 100개 (extract 가 affine 추정 가능하도록 충분).
function generateTrackLocation(circuitKey: number) {
  const samples: Array<{ date: string; x: number; y: number; z: number; driver_number: number }> = [];
  for (let i = 0; i < 100; i++) {
    const t = i / 100;
    // 사각형을 따라 도는 좌표 (perimeter 400)
    const s = t * 400;
    let x, y;
    if (s < 100) { x = s; y = 0; }
    else if (s < 200) { x = 100; y = s - 100; }
    else if (s < 300) { x = 100 - (s - 200); y = 100; }
    else { x = 0; y = 100 - (s - 300); }
    samples.push({
      date: new Date(Date.parse('2024-03-02T15:30:00.000Z') + i * 100).toISOString(),
      x,
      y,
      z: 0,
      driver_number: 1,
    });
  }
  // circuit_key 를 sample 첫 값에 인코딩 (테스트 진단용, 동작 영향 없음)
  void circuitKey;
  return samples;
}

function commonOpts(config: CircuitsConfig, extra: Partial<BuildAllCircuitsOptions> = {}): BuildAllCircuitsOptions {
  return {
    config,
    outputDir: OUTPUT,
    now: new Date('2024-03-03T00:00:00.000Z'),
    logger: () => {}, // silent for tests
    ...extra,
  };
}

describe('build-all-circuits — 3-entry mixed (ok / extract-failed / svg-missing)', () => {
  it('residual-report.json 에 3 entries + 각 status 일치', async () => {
    const config = makeConfig([{}, {}, {}]);
    const { client } = makeMockClient({
      locationByCircuitKey: { 61: [] }, // circuit_key 61 의 location 빈 응답 → extract throws
    });
    // build-all-circuits 의 orchestration 만 단위 검증 — Phase 1 (buildAll, SVG → polyline)
    // 은 spy 로 주입해 vendor SVG 파일 작성 비용 회피. trackOutline JSON 은 helper 로 직접 작성.
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [
        { circuit_key: 60, year: 2024, bytes: 1000 },
        { circuit_key: 61, year: 2024, bytes: 1000 },
      ],
      skipped: [{ circuit_key: 62, year: 2024, reason: 'SVG not found' }],
    });
    // runExtract / runTracePitlane 은 trackOutline JSON 을 읽으므로 직접 작성.
    writeTrackOutline(60, 2024);
    writeTrackOutline(61, 2024);

    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries).toHaveLength(3);
    const byKey = Object.fromEntries(
      result.report.entries.map((e) => [`${e.circuit_key}-${e.year}`, e]),
    );
    expect(byKey['60-2024'].status).toBe('ok');
    expect(byKey['61-2024'].status).toBe('extract-failed');
    expect(byKey['62-2024'].status).toBe('svg-missing');
    expect(existsSync(result.reportPath)).toBe(true);
    expect(result.builtCount).toBe(1);
    expect(result.failedCount).toBe(2);
    vi.restoreAllMocks();
  });
});

describe('build-all-circuits — --key/--year filter', () => {
  it('filter 적용 시 일치 entry 만 처리', async () => {
    const config = makeConfig([{}, {}, {}]);
    config.circuits[0].circuit_key = 60;
    config.circuits[1].circuit_key = 61;
    config.circuits[2].circuit_key = 62;

    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 61, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(61, 2024);
    const { client } = makeMockClient({});

    const result = await buildAllCircuits(
      commonOpts(config, { client, filter: { circuit_key: 61, year: 2024 } }),
    );
    expect(result.report.entries).toHaveLength(1);
    expect(result.report.entries[0].circuit_key).toBe(61);
    vi.restoreAllMocks();
  });
});

describe('build-all-circuits — pitlane-failed status', () => {
  it('extract OK 지만 pit fetch 실패 시 pitlane-failed', async () => {
    const config = makeConfig([{}]);
    config.circuits[0].circuit_key = 70;

    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 70, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(70, 2024);
    const { client } = makeMockClient({ pitFails: new Set([70]) });

    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries[0].status).toBe('pitlane-failed');
    expect(result.report.entries[0].confidence).toBeGreaterThan(0); // extract 성공했으니 보존
    vi.restoreAllMocks();
  });
});

describe('build-all-circuits — --skip-pitlane', () => {
  it('skipPitlane=true 면 pit fetch 시도 안 함 + ok 상태', async () => {
    const config = makeConfig([{}]);
    config.circuits[0].circuit_key = 80;

    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 80, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(80, 2024);
    const mock = makeMockClient({ pitFails: new Set([80]) }); // pit fails 지만 skipPitlane 이라 호출 안 됨

    const result = await buildAllCircuits(commonOpts(config, { client: mock.client, skipPitlane: true }));
    expect(result.report.entries[0].status).toBe('ok');
    // /v1/pit 호출 0회 (mock.calls 는 sessions + laps + location 만)
    const pitCalls = (mock.client.get as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === '/v1/pit',
    );
    expect(pitCalls).toHaveLength(0);
    vi.restoreAllMocks();
  });
});

describe('build-all-circuits — --dry-run', () => {
  it('네트워크 호출 0회 + report.entries 비어 있음', async () => {
    const config = makeConfig([{}, {}]);
    const mock = makeMockClient({});
    const result = await buildAllCircuits(commonOpts(config, { client: mock.client, dryRun: true }));
    expect(mock.calls).toBe(0);
    expect(result.report.entries).toHaveLength(0);
    expect(result.builtCount).toBe(0);
  });
});

describe('shouldExitWithError — svg-missing 은 nightly cron 실패 아님', () => {
  const mkResult = (entries: BuildAllCircuitsResult['report']['entries']): BuildAllCircuitsResult => ({
    reportPath: '/tmp/r.json',
    report: { generated_at: '2024-01-01T00:00:00Z', entries },
    builtCount: entries.filter((e) => e.status === 'ok').length,
    failedCount: entries.filter((e) => e.status !== 'ok').length,
  });

  it('ok 만 → exit 0', () => {
    expect(shouldExitWithError(mkResult([{ circuit_key: 1, year: 2024, status: 'ok' }]))).toBe(false);
  });

  it('svg-missing 만 (큐레이션 보류) → exit 0', () => {
    expect(shouldExitWithError(mkResult([
      { circuit_key: 1, year: 2024, status: 'svg-missing' },
      { circuit_key: 2, year: 2024, status: 'svg-missing' },
    ]))).toBe(false);
  });

  it('extract-failed + built=0 (실제 실패) → exit 1', () => {
    expect(shouldExitWithError(mkResult([
      { circuit_key: 1, year: 2024, status: 'extract-failed', error: 'boom' },
    ]))).toBe(true);
  });

  it('ok + extract-failed 혼합 (built > 0) → exit 0', () => {
    expect(shouldExitWithError(mkResult([
      { circuit_key: 1, year: 2024, status: 'ok' },
      { circuit_key: 2, year: 2024, status: 'extract-failed', error: 'boom' },
    ]))).toBe(false);
  });

  it('pitlane-failed 만 → exit 1', () => {
    expect(shouldExitWithError(mkResult([
      { circuit_key: 1, year: 2024, status: 'pitlane-failed', error: 'boom' },
    ]))).toBe(true);
  });
});

describe('parseCliArgs', () => {
  it('--key + --year + --skip-pitlane + --dry-run 모두 파싱', () => {
    const a = parseCliArgs(['--key=63', '--year=2024', '--skip-pitlane', '--dry-run']);
    expect(a.filter).toEqual({ circuit_key: 63, year: 2024 });
    expect(a.skipPitlane).toBe(true);
    expect(a.skipExtract).toBe(false);
    expect(a.dryRun).toBe(true);
  });

  it('인자 없음 → 기본값', () => {
    const a = parseCliArgs([]);
    expect(a.filter).toEqual({});
    expect(a.skipPitlane).toBe(false);
    expect(a.skipExtract).toBe(false);
    expect(a.dryRun).toBe(false);
  });
});

// ── Phase 14 — overlay (sectors/drs/slm) 통합 시나리오 ────────────────

describe('build-all-circuits — overlay integration (Phase 14)', () => {
  it('2024 ok entry → sectors ok / drs ok / slm skipped:no-seed', async () => {
    const config = makeConfig([{ circuit_key: 90, year: 2024 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 90, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(90, 2024);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    vi.spyOn(sectorsMod, 'runDeriveSectors').mockResolvedValue({
      filePath: '/tmp/s.json',
      boundaryCount: 3,
      i1SampleCount: 5,
      i2SampleCount: 5,
    });
    const drsMod = await import('../derive-drs-zones.js');
    vi.spyOn(drsMod, 'runDeriveDrs').mockResolvedValue({
      filePath: '/tmp/d.json',
      zoneCount: 2,
      detectionCount: 2,
    });
    const slmMod = await import('../load-slm-zones.js');
    vi.spyOn(slmMod, 'runLoadSlm').mockResolvedValue(null); // no seed entry

    const { client } = makeMockClient({});
    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries[0].status).toBe('ok');
    expect(result.report.entries[0].overlays?.sectors).toEqual({ status: 'ok' });
    expect(result.report.entries[0].overlays?.drs).toEqual({ status: 'ok' });
    expect(result.report.entries[0].overlays?.slm).toEqual({
      status: 'skipped',
      reason: 'no-seed',
    });
    vi.restoreAllMocks();
  });

  it('2026 entry → drs auto-skip:future (deriveDrs not called)', async () => {
    const config = makeConfig([{ circuit_key: 91, year: 2026 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 91, year: 2026, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(91, 2026);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    vi.spyOn(sectorsMod, 'runDeriveSectors').mockResolvedValue({
      filePath: '/tmp/s.json',
      boundaryCount: 3,
      i1SampleCount: 5,
      i2SampleCount: 5,
    });
    const drsMod = await import('../derive-drs-zones.js');
    const drsSpy = vi.spyOn(drsMod, 'runDeriveDrs');
    const slmMod = await import('../load-slm-zones.js');
    vi.spyOn(slmMod, 'runLoadSlm').mockResolvedValue(null);

    const { client } = makeMockClient({});
    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries[0].overlays?.drs?.status).toBe('skipped');
    expect(result.report.entries[0].overlays?.drs?.reason).toBe('future');
    expect(drsSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('--skip-sectors --skip-drs --skip-slm → all skipped:flag, derivers not called', async () => {
    const config = makeConfig([{ circuit_key: 92, year: 2024 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 92, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(92, 2024);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    const sectorsSpy = vi.spyOn(sectorsMod, 'runDeriveSectors');
    const drsMod = await import('../derive-drs-zones.js');
    const drsSpy = vi.spyOn(drsMod, 'runDeriveDrs');
    const slmMod = await import('../load-slm-zones.js');
    const slmSpy = vi.spyOn(slmMod, 'runLoadSlm');

    const { client } = makeMockClient({});
    const result = await buildAllCircuits(
      commonOpts(config, { client, skipSectors: true, skipDrs: true, skipSlm: true }),
    );
    expect(result.report.entries[0].status).toBe('ok');
    expect(result.report.entries[0].overlays).toEqual({
      sectors: { status: 'skipped', reason: 'flag' },
      drs: { status: 'skipped', reason: 'flag' },
      slm: { status: 'skipped', reason: 'flag' },
    });
    expect(sectorsSpy).not.toHaveBeenCalled();
    expect(drsSpy).not.toHaveBeenCalled();
    expect(slmSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('sectors throw → overlays.sectors.status=failed, main status stays ok', async () => {
    const config = makeConfig([{ circuit_key: 93, year: 2024 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 93, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(93, 2024);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    vi.spyOn(sectorsMod, 'runDeriveSectors').mockRejectedValue(new Error('boom-sectors'));
    const drsMod = await import('../derive-drs-zones.js');
    vi.spyOn(drsMod, 'runDeriveDrs').mockResolvedValue(null);
    const slmMod = await import('../load-slm-zones.js');
    vi.spyOn(slmMod, 'runLoadSlm').mockResolvedValue(null);

    const { client } = makeMockClient({});
    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries[0].status).toBe('ok');
    expect(result.report.entries[0].overlays?.sectors).toEqual({
      status: 'failed',
      reason: 'boom-sectors',
    });
    expect(result.builtCount).toBe(1);
    expect(result.failedCount).toBe(0); // overlay failure does NOT count toward failedCount
    vi.restoreAllMocks();
  });

  it('extract-failed entry → overlay block skipped (derivers not called)', async () => {
    const config = makeConfig([{ circuit_key: 94, year: 2024 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 94, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(94, 2024);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    const sectorsSpy = vi.spyOn(sectorsMod, 'runDeriveSectors');
    const drsMod = await import('../derive-drs-zones.js');
    const drsSpy = vi.spyOn(drsMod, 'runDeriveDrs');
    const slmMod = await import('../load-slm-zones.js');
    const slmSpy = vi.spyOn(slmMod, 'runLoadSlm');

    // extract-failed via empty location response
    const { client } = makeMockClient({ locationByCircuitKey: { 94: [] } });
    const result = await buildAllCircuits(commonOpts(config, { client }));
    expect(result.report.entries[0].status).toBe('extract-failed');
    expect(result.report.entries[0].overlays).toBeUndefined();
    expect(sectorsSpy).not.toHaveBeenCalled();
    expect(drsSpy).not.toHaveBeenCalled();
    expect(slmSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('slm raw seed has entry (slmRawPath override) → slm.status=ok', async () => {
    const config = makeConfig([{ circuit_key: 95, year: 2024 }]);
    const fetchModule = await import('../fetch-circuit-maps.js');
    vi.spyOn(fetchModule, 'buildAll').mockReturnValue({
      built: [{ circuit_key: 95, year: 2024, bytes: 1000 }],
      skipped: [],
    });
    writeTrackOutline(95, 2024);

    const sectorsMod = await import('../derive-sector-boundaries.js');
    vi.spyOn(sectorsMod, 'runDeriveSectors').mockResolvedValue({
      filePath: '/tmp/s.json',
      boundaryCount: 3,
      i1SampleCount: 5,
      i2SampleCount: 5,
    });
    const drsMod = await import('../derive-drs-zones.js');
    vi.spyOn(drsMod, 'runDeriveDrs').mockResolvedValue(null);

    // write SLM raw with entry for (95, 2024) — slmRawPath wins over default seed
    const rawPath = join(TMP, 'slm-raw.json');
    writeFileSync(
      rawPath,
      JSON.stringify({
        circuits: [
          {
            circuit_key: 95,
            year: 2024,
            zones: [{ s_start_hint: 100, s_end_hint: 200, label: 'Test Zone' }],
          },
        ],
      }),
    );

    const { client } = makeMockClient({});
    const result = await buildAllCircuits(commonOpts(config, { client, slmRawPath: rawPath }));
    expect(result.report.entries[0].overlays?.slm?.status).toBe('ok');
    vi.restoreAllMocks();
  });
});

describe('parseCliArgs — Phase 14 overlay flags', () => {
  it('--skip-sectors --skip-drs --skip-slm --slm-raw=path 모두 파싱', () => {
    const a = parseCliArgs([
      '--skip-sectors',
      '--skip-drs',
      '--skip-slm',
      '--slm-raw=/custom/slm.json',
    ]);
    expect(a.skipSectors).toBe(true);
    expect(a.skipDrs).toBe(true);
    expect(a.skipSlm).toBe(true);
    expect(a.slmRawPath).toBe('/custom/slm.json');
  });

  it('overlay flag 없음 → 모두 default false / undefined', () => {
    const a = parseCliArgs([]);
    expect(a.skipSectors).toBe(false);
    expect(a.skipDrs).toBe(false);
    expect(a.skipSlm).toBe(false);
    expect(a.slmRawPath).toBeUndefined();
  });
});

// ── helpers ─────────────────────────────────────────────────────────────

function writeTrackOutline(circuitKey: number, year: number): void {
  const json = {
    circuit_key: circuitKey,
    year,
    circuit_short_name: 'Test',
    country_name: 'Testland',
    source: 'julesr0y/f1-circuits-svg',
    source_file: 'test.svg',
    license: 'CC-BY-4.0',
    viewBox: [0, 0, 100, 100],
    polyline: [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
      [0, 0],
    ],
    arc_length_table: [0, 100, 200, 300, 400],
    total_length: 400,
    start_finish_index: 0,
    direction: 'clockwise',
    generated_at: '2024-01-01T00:00:00Z',
  };
  writeFileSync(join(OUTPUT, `${circuitKey}-${year}.json`), JSON.stringify(json));
}
