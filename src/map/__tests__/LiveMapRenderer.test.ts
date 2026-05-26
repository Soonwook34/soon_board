// src/map/LiveMapRenderer.ts — plan §10 단계 6 합성 sample end-to-end 검증.
// 시케인 (path-arc) + 1랩 wrapping + 다중 driver + 라벨 토글 + start/stop.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMapRenderer } from '../LiveMapRenderer.js';
import { mapStyles } from '../mapStyles.js';
import { PerDriverBuffer } from '../PerDriverBuffer.js';
import { SyntheticDataSource } from '../../shared/__tests__/SyntheticDataSource.js';
import { computeViewport, type Point2D } from '../viewport.js';
import type { DriverSample } from '../interpolation.js';

interface MockCall {
  method: string;
  args: unknown[];
}

function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const props: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (typeof prop === 'string' && prop in props) return props[prop];
        return record(String(prop));
      },
      set(_t, prop: string, value) {
        props[String(prop)] = value;
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

// 정사각 polyline (0,0)→(500,0)→(500,500)→(0,500)→(0,0), perimeter=2000
const POLY: Point2D[] = [
  [0, 0],
  [500, 0],
  [500, 500],
  [0, 500],
  [0, 0],
];
const POLY_S = [0, 500, 1000, 1500, 2000];
const VIEWPORT = computeViewport({
  viewBox: [0, 0, 500, 500],
  canvasWidth: 500,
  canvasHeight: 500,
});

function sample(date: number, x: number, y: number, s: number, n = 0): DriverSample {
  return { date, rawXY: [x, y], s, n };
}

function makeRenderer(opts: {
  ctx: CanvasRenderingContext2D;
  buffer: PerDriverBuffer;
  ds: SyntheticDataSource;
  showLabel?: boolean;
  drivers?: Map<number, { teamColour: string; nameAcronym: string }>;
}) {
  const drivers = opts.drivers ?? new Map([[44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }]]);
  return new LiveMapRenderer({
    ctx: opts.ctx,
    canvasWidth: 500,
    canvasHeight: 500,
    polyline: POLY,
    arcLengthTable: POLY_S,
    totalLength: 2000,
    viewport: VIEWPORT,
    dataSource: opts.ds,
    buffer: opts.buffer,
    getDriverMeta: (n) => drivers.get(n) ?? null,
    showLabel: () => opts.showLabel ?? true,
  });
}

describe('LiveMapRenderer.renderFrame — 정적 트랙 + 마커', () => {
  it('clearRect 후 정적 트랙 + 마커 드로우', () => {
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 100, 0, 100));
    buffer.push(44, sample(1000, 200, 0, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds });
    r.renderFrame(500);
    const methods = calls.map((c) => c.method);
    expect(methods.indexOf('clearRect')).toBeLessThan(methods.indexOf('arc'));
    // 정적 트랙 stroke + 마커 arc 둘 다 호출
    expect(calls.some((c) => c.method === 'stroke')).toBe(true);
    expect(calls.some((c) => c.method === 'arc')).toBe(true);
  });
});

describe('LiveMapRenderer.renderFrame — 시케인 path-arc', () => {
  it('Z 형 polyline 에서 마커 위치가 polyline 위 (직선 lerp 와 다름)', () => {
    // Z polyline 으로 재구성
    const Z: Point2D[] = [
      [0, 0],
      [100, 0],
      [100, 50],
      [200, 50],
      [200, 100],
    ];
    const Z_S = [0, 100, 150, 250, 300];
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 50, 0, 50));
    buffer.push(44, sample(1000, 150, 50, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = new LiveMapRenderer({
      ctx,
      canvasWidth: 300,
      canvasHeight: 300,
      polyline: Z,
      arcLengthTable: Z_S,
      totalLength: 300,
      viewport: computeViewport({ viewBox: [0, 0, 300, 300], canvasWidth: 300, canvasHeight: 300 }),
      dataSource: ds,
      buffer,
      getDriverMeta: () => ({ teamColour: '#fff', nameAcronym: 'X' }),
      showLabel: () => false,
    });
    r.renderFrame(250); // u=0.25 → path-arc sNow=87.5 → polyline (87.5, 0)
    const arcCall = calls.find((c) => c.method === 'arc');
    expect(arcCall).toBeDefined();
    // canvasWidth=300, viewBox=300 → scale=1, x=87.5, y=0
    expect(arcCall?.args[0]).toBeCloseTo(87.5);
    expect(arcCall?.args[1]).toBeCloseTo(0);
  });
});

describe('LiveMapRenderer.renderFrame — 1랩 wrapping', () => {
  it('s1=1900 (finish 근방), s2=100 (start), total=2000 → wrapping 정상', () => {
    const buffer = new PerDriverBuffer();
    // 사각형 perimeter 2000. s=1900 은 마지막 segment (0,500)→(0,0) 위, s=100 은 첫 segment (0,0)→(500,0) 위.
    buffer.push(44, sample(0, 0, 100, 1900)); // s=1900 → polyline (0, 100)
    buffer.push(44, sample(1000, 100, 0, 100)); // s=100 → polyline (100, 0)
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds, showLabel: false });
    r.renderFrame(500);
    // wrap formula: sNow = (1900 + 0.5*(100 + 2000 - 1900)) mod 2000 = (1900 + 100) mod 2000 = 0 → polyline[0] = (0, 0)
    const arcCall = calls.find((c) => c.method === 'arc');
    expect(arcCall?.args[0]).toBeCloseTo(0);
    expect(arcCall?.args[1]).toBeCloseTo(0);
  });
});

describe('LiveMapRenderer.renderFrame — 다중 driver + 라벨 토글', () => {
  it('3대 → arc 3회 + driver_number 3회', () => {
    const buffer = new PerDriverBuffer();
    [44, 1, 11].forEach((d, i) => {
      buffer.push(d, sample(0, 50 + i * 10, 0, 50 + i * 10));
      buffer.push(d, sample(1000, 150 + i * 10, 0, 150 + i * 10));
    });
    const ds = new SyntheticDataSource();
    const drivers = new Map([
      [44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }],
      [1, { teamColour: '#3671c6', nameAcronym: 'VER' }],
      [11, { teamColour: '#3671c6', nameAcronym: 'PER' }],
    ]);
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds, drivers });
    r.renderFrame(500);
    const arcs = calls.filter((c) => c.method === 'arc');
    expect(arcs).toHaveLength(3);
  });
  it('showLabel=false 시 fillText 는 driver_number 만 (3대 → 3회), 라벨 없음', () => {
    const buffer = new PerDriverBuffer();
    [44, 1, 11].forEach((d, i) => {
      buffer.push(d, sample(0, 50 + i * 10, 0, 50 + i * 10));
      buffer.push(d, sample(1000, 150 + i * 10, 0, 150 + i * 10));
    });
    const ds = new SyntheticDataSource();
    const drivers = new Map([
      [44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }],
      [1, { teamColour: '#3671c6', nameAcronym: 'VER' }],
      [11, { teamColour: '#3671c6', nameAcronym: 'PER' }],
    ]);
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds, drivers, showLabel: false });
    r.renderFrame(500);
    const fillTexts = calls.filter((c) => c.method === 'fillText');
    expect(fillTexts).toHaveLength(3); // driverNumber only, no labels
  });
  it('showLabel=true 시 fillText 는 6회 (3 number + 3 label)', () => {
    const buffer = new PerDriverBuffer();
    [44, 1, 11].forEach((d, i) => {
      buffer.push(d, sample(0, 50 + i * 10, 0, 50 + i * 10));
      buffer.push(d, sample(1000, 150 + i * 10, 0, 150 + i * 10));
    });
    const ds = new SyntheticDataSource();
    const drivers = new Map([
      [44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }],
      [1, { teamColour: '#3671c6', nameAcronym: 'VER' }],
      [11, { teamColour: '#3671c6', nameAcronym: 'PER' }],
    ]);
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds, drivers, showLabel: true });
    r.renderFrame(500);
    const fillTexts = calls.filter((c) => c.method === 'fillText');
    expect(fillTexts).toHaveLength(6);
  });
});

describe('LiveMapRenderer.renderFrame — 가라지 sentinel (plan 인수 6)', () => {
  it('sentinel-only buffer (push 시 모두 skip) → drawMarker 호출 0회', () => {
    const buffer = new PerDriverBuffer();
    // |x|+|y| < 50 → sentinel skip. buffer 비어있음.
    buffer.push(44, sample(0, 10, 10, 0));
    buffer.push(44, sample(1000, 20, 20, 0));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds });
    r.renderFrame(500);
    // 트랙 stroke 는 있지만 arc (마커) 는 없음
    const arcs = calls.filter((c) => c.method === 'arc');
    expect(arcs).toHaveLength(0);
  });
  it('driver 가 meta lookup 실패 시 마커 건너뜀', () => {
    const buffer = new PerDriverBuffer();
    buffer.push(99, sample(0, 100, 0, 100));
    buffer.push(99, sample(1000, 200, 0, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({
      ctx,
      buffer,
      ds,
      drivers: new Map(), // 99 메타 없음
    });
    r.renderFrame(500);
    expect(calls.filter((c) => c.method === 'arc')).toHaveLength(0);
  });
});

describe('LiveMapRenderer.renderFrame — Phase 7 trail + state', () => {
  it('trailsEnabled=true (default) + sample ≥ 2 → trail stroke (track + trail + marker stroke 등)', () => {
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 100, 0, 100));
    buffer.push(44, sample(500, 150, 0, 150));
    buffer.push(44, sample(1000, 200, 0, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds }); // default trailsEnabled true
    r.renderFrame(1000);
    // stroke 호출 분류: 정적 트랙 1 + 트레일 segment N + 마커 stroke 1
    const strokes = calls.filter((c) => c.method === 'stroke');
    expect(strokes.length).toBeGreaterThanOrEqual(3); // 최소 track + 1 trail seg + marker
  });

  it('trailsEnabled=false 명시 → trail stroke 없음 (track + marker 만)', () => {
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 100, 0, 100));
    buffer.push(44, sample(500, 150, 0, 150));
    buffer.push(44, sample(1000, 200, 0, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const drivers = new Map([[44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }]]);
    const r = new LiveMapRenderer({
      ctx,
      canvasWidth: 500,
      canvasHeight: 500,
      polyline: POLY,
      arcLengthTable: POLY_S,
      totalLength: 2000,
      viewport: VIEWPORT,
      dataSource: ds,
      buffer,
      getDriverMeta: (n) => drivers.get(n) ?? null,
      showLabel: () => false,
      trailsEnabled: false,
    });
    r.renderFrame(1000);
    // 정적 트랙 stroke 1 + 마커 stroke 1 = 2. trail segment 없음.
    const strokes = calls.filter((c) => c.method === 'stroke');
    expect(strokes).toHaveLength(2);
  });

  it("latest sample > 1.5s 전 → disconnected → '?' 배지 fillText 호출 + globalAlpha 0.5", () => {
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 100, 0, 100)); // latest at t=0
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds, showLabel: false });
    r.renderFrame(2000); // 2000 - 0 = 2000 > 1500 → disconnected
    // disconnected: globalAlpha 0.5 → marker → 1.0 복원
    const alphas = calls
      .filter((c) => c.method === 'set:globalAlpha')
      .map((c) => c.args[0] as number);
    expect(alphas.some((a) => a === 0.5)).toBe(true);
    // '?' 배지 fillText
    const questionMark = calls.find((c) => c.method === 'fillText' && c.args[0] === '?');
    expect(questionMark).toBeDefined();
  });

  it('getDriverHints isDnf=true → retired → fill 이 retiredFill (textMuted)', () => {
    const buffer = new PerDriverBuffer();
    buffer.push(44, sample(0, 100, 0, 100));
    buffer.push(44, sample(1000, 200, 0, 200));
    const ds = new SyntheticDataSource();
    const { ctx, calls } = makeMockCtx();
    const drivers = new Map([[44, { teamColour: '#27f4d2', nameAcronym: 'HAM' }]]);
    const r = new LiveMapRenderer({
      ctx,
      canvasWidth: 500,
      canvasHeight: 500,
      polyline: POLY,
      arcLengthTable: POLY_S,
      totalLength: 2000,
      viewport: VIEWPORT,
      dataSource: ds,
      buffer,
      getDriverMeta: (n) => drivers.get(n) ?? null,
      showLabel: () => false,
      getDriverHints: () => ({ isDnf: true }),
    });
    r.renderFrame(500);
    // retired: 마커 fillStyle 이 retiredFill (gray), teamColour 무시. 또한 trail 비활성 (retired 면 skip).
    const fillStyles = calls.filter((c) => c.method === 'set:fillStyle').map((c) => c.args[0]);
    expect(fillStyles.some((v) => v === mapStyles.retiredFill)).toBe(true);
    expect(fillStyles.every((v) => v !== '#27f4d2')).toBe(true); // teamColour 무시
  });
});

describe('LiveMapRenderer.start/stop — RAF 라이프사이클', () => {
  let rafSpy: ReturnType<typeof vi.fn>;
  let cancelSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    rafSpy = vi.fn().mockReturnValue(1);
    cancelSpy = vi.fn();
    vi.stubGlobal('requestAnimationFrame', rafSpy);
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('start() 시 RAF 콜백 1회 등록', () => {
    const buffer = new PerDriverBuffer();
    const ds = new SyntheticDataSource();
    const { ctx } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds });
    r.start();
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });
  it('start() 두 번 호출해도 중복 등록 안 됨 (멱등)', () => {
    const buffer = new PerDriverBuffer();
    const ds = new SyntheticDataSource();
    const { ctx } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds });
    r.start();
    r.start();
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });
  it('stop() 시 cancelAnimationFrame 호출', () => {
    const buffer = new PerDriverBuffer();
    const ds = new SyntheticDataSource();
    const { ctx } = makeMockCtx();
    const r = makeRenderer({ ctx, buffer, ds });
    r.start();
    r.stop();
    expect(cancelSpy).toHaveBeenCalledWith(1);
  });
});
