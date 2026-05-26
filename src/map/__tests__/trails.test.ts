// src/map/trails.ts — plan §4.3 트레일 회귀.

import { describe, expect, it } from 'vitest';
import { PerDriverBuffer } from '../PerDriverBuffer.js';
import { collectTrailPoints, drawTrail, TRAIL_WINDOW_MS } from '../trails.js';
import { computeViewport, type Point2D } from '../viewport.js';
import type { DriverSample } from '../interpolation.js';

interface MockCall {
  method: string;
  args: unknown[];
}
function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (typeof prop === 'string' && prop in props) return props[prop];
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
        };
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

const VIEWPORT = computeViewport({
  viewBox: [0, 0, 500, 500],
  canvasWidth: 500,
  canvasHeight: 500,
});

function sample(date: number, x: number, y: number): DriverSample {
  return { date, rawXY: [x, y], s: 0, n: 0 };
}

describe('drawTrail', () => {
  it('points < 2 → no-op', () => {
    const { ctx, calls } = makeMockCtx();
    drawTrail(ctx, [], { color: '#fff', lineWidth: 2, alphaStart: 0, alphaEnd: 0.3 });
    drawTrail(ctx, [[1, 1]], { color: '#fff', lineWidth: 2, alphaStart: 0, alphaEnd: 0.3 });
    expect(calls).toHaveLength(0);
  });
  it('4 점 → 3 segment, 각 segment 마다 globalAlpha 변화', () => {
    const { ctx, calls } = makeMockCtx();
    const pts: Point2D[] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0],
    ];
    drawTrail(ctx, pts, { color: '#27f4d2', lineWidth: 2, alphaStart: 0, alphaEnd: 0.3 });
    const strokes = calls.filter((c) => c.method === 'stroke');
    expect(strokes).toHaveLength(3); // 3 segments
    // globalAlpha 값들 (segment 별 평균): seg0 = (0 + 0.1)/2 = 0.05, seg1 = (0.1+0.2)/2 = 0.15, seg2 = (0.2+0.3)/2 = 0.25, 그 후 reset 1
    const alphas = calls
      .filter((c) => c.method === 'set:globalAlpha')
      .map((c) => c.args[0] as number);
    expect(alphas).toHaveLength(4); // 3 segment + 1 final reset
    expect(alphas[0]).toBeCloseTo(0.05);
    expect(alphas[1]).toBeCloseTo(0.15);
    expect(alphas[2]).toBeCloseTo(0.25);
    expect(alphas[3]).toBe(1); // reset
  });
  it('lineCap = round, strokeStyle/lineWidth 설정', () => {
    const { ctx, calls } = makeMockCtx();
    drawTrail(
      ctx,
      [
        [0, 0],
        [10, 0],
      ],
      { color: '#27f4d2', lineWidth: 3, alphaStart: 0, alphaEnd: 0.3 },
    );
    expect(calls.find((c) => c.method === 'set:strokeStyle')?.args[0]).toBe('#27f4d2');
    expect(calls.find((c) => c.method === 'set:lineWidth')?.args[0]).toBe(3);
    expect(calls.find((c) => c.method === 'set:lineCap')?.args[0]).toBe('round');
  });
});

describe('collectTrailPoints', () => {
  it('윈도우 안 sample 만 포함 (1500ms 안)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(0, 100, 100));
    b.push(44, sample(500, 110, 110));
    b.push(44, sample(1000, 120, 120));
    b.push(44, sample(1800, 130, 130));
    // displayTime=2000. 윈도우 = [500, 2000]. 0 은 제외, 500/1000/1800 포함.
    const pts = collectTrailPoints(b, 44, 2000, VIEWPORT);
    expect(pts).toHaveLength(3);
  });
  it('미래 sample 제외 (s.date > displayTime)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(500, 110, 110));
    b.push(44, sample(1000, 120, 120));
    b.push(44, sample(3000, 200, 200)); // 미래
    const pts = collectTrailPoints(b, 44, 1500, VIEWPORT);
    expect(pts).toHaveLength(2);
  });
  it('sample 0건 → 빈 배열', () => {
    const b = new PerDriverBuffer();
    expect(collectTrailPoints(b, 44, 1000, VIEWPORT)).toEqual([]);
  });
  it('정사각 1:1 viewport — sample rawXY 그대로 canvas 좌표', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(500, 100, 200));
    b.push(44, sample(1000, 150, 250));
    const pts = collectTrailPoints(b, 44, 1500, VIEWPORT);
    expect(pts[0]).toEqual([100, 200]);
    expect(pts[1]).toEqual([150, 250]);
  });
  it('TRAIL_WINDOW_MS === 1500 (plan §4.3)', () => {
    expect(TRAIL_WINDOW_MS).toBe(1500);
  });
});
