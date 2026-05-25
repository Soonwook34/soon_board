// src/map/trackRenderer.ts — Mock CanvasRenderingContext2D 로 호출 시퀀스 검증.

import { describe, expect, it } from 'vitest';
import { mapStyles } from '../mapStyles.js';
import { renderStaticTrack } from '../trackRenderer.js';
import { computeViewport, type Point2D } from '../viewport.js';

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
      get(_target, prop: string) {
        if (typeof prop === 'string' && prop in props) return props[prop];
        return record(String(prop));
      },
      set(_target, prop: string, value) {
        props[String(prop)] = value;
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const POLY: Point2D[] = [
  [0, 0],
  [500, 0],
  [500, 500],
  [0, 500],
  [0, 0],
];

const viewport = computeViewport({
  viewBox: [0, 0, 500, 500],
  canvasWidth: 800,
  canvasHeight: 800,
});

describe('renderStaticTrack', () => {
  it('clears + fills background before stroking', () => {
    const { ctx, calls } = makeMockCtx();
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
    });
    const methods = calls.map((c) => c.method);
    expect(methods.indexOf('clearRect')).toBeLessThan(methods.indexOf('fillRect'));
    expect(methods.indexOf('fillRect')).toBeLessThan(methods.indexOf('beginPath'));
  });

  it('uses mapStyles.bgPrimary for background fill', () => {
    const { ctx, calls } = makeMockCtx();
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
    });
    const fillStyleSet = calls.find((c) => c.method === 'set:fillStyle');
    expect(fillStyleSet?.args[0]).toBe(mapStyles.bgPrimary);
  });

  it('moves to first point + lineTo for each subsequent (in canvas pixels)', () => {
    const { ctx, calls } = makeMockCtx();
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
    });
    // (0,0) viewBox → (0,0) canvas with this viewport (scale 1.6, offset 0,0)
    const moveTo = calls.find((c) => c.method === 'moveTo');
    expect(moveTo?.args).toEqual([0, 0]);
    // (500,0) viewBox → (800,0) canvas
    const lineTos = calls.filter((c) => c.method === 'lineTo');
    expect(lineTos.length).toBe(POLY.length - 1);
    expect(lineTos[0]?.args).toEqual([800, 0]);
    expect(lineTos[1]?.args).toEqual([800, 800]);
  });

  it('strokes with track stroke style + width from mapStyles', () => {
    const { ctx, calls } = makeMockCtx();
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
    });
    const strokeStyleSet = calls.find((c) => c.method === 'set:strokeStyle');
    const lineWidthSet = calls.find((c) => c.method === 'set:lineWidth');
    expect(strokeStyleSet?.args[0]).toBe(mapStyles.trackStroke);
    expect(lineWidthSet?.args[0]).toBe(mapStyles.trackStrokeWidth);
    expect(calls.some((c) => c.method === 'stroke')).toBe(true);
  });

  it('renders pitlane as second stroke pass with dash pattern', () => {
    const { ctx, calls } = makeMockCtx();
    const pitlane: Point2D[] = [
      [50, 50],
      [450, 50],
    ];
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
      pitlane,
    });
    const strokes = calls.filter((c) => c.method === 'stroke');
    expect(strokes.length).toBe(2); // main track + pitlane
    const setLineDashCalls = calls.filter((c) => c.method === 'setLineDash');
    // first stroke main = empty dash, second = pitlane pattern, third = reset
    expect(setLineDashCalls.length).toBeGreaterThanOrEqual(2);
    const dashArgs = setLineDashCalls.map((c) => c.args[0]);
    expect(dashArgs).toContainEqual([...mapStyles.pitlaneDashPattern]);
  });

  it('throws when polyline length < 2', () => {
    const { ctx } = makeMockCtx();
    expect(() =>
      renderStaticTrack({
        ctx,
        canvasWidth: 800,
        canvasHeight: 800,
        polyline: [[0, 0]],
        viewport,
      }),
    ).toThrow(/length < 2/);
  });

  it('skips pitlane stroke when pitlane.length < 2', () => {
    const { ctx, calls } = makeMockCtx();
    renderStaticTrack({
      ctx,
      canvasWidth: 800,
      canvasHeight: 800,
      polyline: POLY,
      viewport,
      pitlane: [[1, 1]],
    });
    const strokes = calls.filter((c) => c.method === 'stroke');
    expect(strokes.length).toBe(1); // only main
  });
});
