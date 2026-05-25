// src/map/viewport.ts 단위 테스트.

import { describe, expect, it } from 'vitest';
import {
  applyViewport,
  computeViewport,
  type ViewBox,
  type ViewportTransform,
} from '../viewport.js';

describe('computeViewport', () => {
  it('square viewBox + square canvas → scale only, no offset', () => {
    const t = computeViewport({
      viewBox: [0, 0, 500, 500] as const,
      canvasWidth: 800,
      canvasHeight: 800,
    });
    expect(t.scale).toBeCloseTo(1.6, 9);
    expect(t.offsetX).toBeCloseTo(0, 9);
    expect(t.offsetY).toBeCloseTo(0, 9);
  });

  it('square viewBox + wide canvas → letterbox horizontally', () => {
    const t = computeViewport({
      viewBox: [0, 0, 500, 500] as const,
      canvasWidth: 1600,
      canvasHeight: 800,
    });
    // scale limited by height: 800/500 = 1.6. Used width = 800.
    // Letterbox: (1600 - 800)/2 = 400 on each side.
    expect(t.scale).toBeCloseTo(1.6, 9);
    expect(t.offsetX).toBeCloseTo(400, 9);
    expect(t.offsetY).toBeCloseTo(0, 9);
  });

  it('square viewBox + tall canvas → letterbox vertically', () => {
    const t = computeViewport({
      viewBox: [0, 0, 500, 500] as const,
      canvasWidth: 800,
      canvasHeight: 1600,
    });
    expect(t.scale).toBeCloseTo(1.6, 9);
    expect(t.offsetX).toBeCloseTo(0, 9);
    expect(t.offsetY).toBeCloseTo(400, 9);
  });

  it('rectangular viewBox (wide) + square canvas → letterbox vertically', () => {
    // viewBox 1000×500 in 800×800 canvas: scale=0.8, used 800×400, letterbox=200 top/bottom
    const t = computeViewport({
      viewBox: [0, 0, 1000, 500] as const,
      canvasWidth: 800,
      canvasHeight: 800,
    });
    expect(t.scale).toBeCloseTo(0.8, 9);
    expect(t.offsetX).toBeCloseTo(0, 9);
    expect(t.offsetY).toBeCloseTo(200, 9);
  });

  it('negative viewBox origin handled correctly', () => {
    // viewBox [-100, -100, 500, 500] in 800×800 canvas:
    //   scale = 800/500 = 1.6
    //   (-100, -100) should map to (0, 0)  (top-left of viewBox)
    const t = computeViewport({
      viewBox: [-100, -100, 500, 500] as const,
      canvasWidth: 800,
      canvasHeight: 800,
    });
    expect(t.scale).toBeCloseTo(1.6, 9);
    const [cx, cy] = applyViewport([-100, -100], t);
    expect(cx).toBeCloseTo(0, 9);
    expect(cy).toBeCloseTo(0, 9);
  });

  it('all four viewBox corners land inside canvas bounds', () => {
    const vb: ViewBox = [0, 0, 500, 500];
    const cw = 1024;
    const ch = 768;
    const t = computeViewport({ viewBox: vb, canvasWidth: cw, canvasHeight: ch });
    const corners: [number, number][] = [
      [vb[0], vb[1]],
      [vb[0] + vb[2], vb[1]],
      [vb[0], vb[1] + vb[3]],
      [vb[0] + vb[2], vb[1] + vb[3]],
    ];
    for (const c of corners) {
      const [px, py] = applyViewport(c, t);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(cw);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(ch);
    }
  });

  it('Bahrain-like viewBox [0,0,500,500] in 1280×720', () => {
    const t = computeViewport({
      viewBox: [0, 0, 500, 500] as const,
      canvasWidth: 1280,
      canvasHeight: 720,
    });
    // height-limited: 720/500 = 1.44, used width 720, letterbox = (1280-720)/2 = 280
    expect(t.scale).toBeCloseTo(1.44, 9);
    expect(t.offsetX).toBeCloseTo(280, 9);
    expect(t.offsetY).toBeCloseTo(0, 9);
  });

  it('throws on non-positive viewBox dimension', () => {
    expect(() => computeViewport({ viewBox: [0, 0, 0, 500], canvasWidth: 800, canvasHeight: 800 })).toThrow(/width\/height/);
    expect(() => computeViewport({ viewBox: [0, 0, 500, -1], canvasWidth: 800, canvasHeight: 800 })).toThrow(/width\/height/);
  });

  it('throws on non-positive canvas dimension', () => {
    expect(() => computeViewport({ viewBox: [0, 0, 500, 500], canvasWidth: 0, canvasHeight: 800 })).toThrow(/canvas/);
  });
});

describe('applyViewport', () => {
  it('identity-like transform (scale=1, offset=0)', () => {
    const t: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
    expect(applyViewport([3, 4], t)).toEqual([3, 4]);
  });

  it('applies scale + offset', () => {
    const t: ViewportTransform = { scale: 2, offsetX: 10, offsetY: 20 };
    expect(applyViewport([5, 7], t)).toEqual([20, 34]);
  });

  it('mid-point of viewBox maps to canvas center', () => {
    const vb: ViewBox = [0, 0, 500, 500];
    const t = computeViewport({ viewBox: vb, canvasWidth: 1280, canvasHeight: 720 });
    const center: [number, number] = [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
    const [px, py] = applyViewport(center, t);
    expect(px).toBeCloseTo(1280 / 2, 6);
    expect(py).toBeCloseTo(720 / 2, 6);
  });
});
