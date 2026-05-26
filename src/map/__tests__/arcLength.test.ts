// src/map/arcLength.ts — plan §5.3 binary search 회귀.

import { describe, expect, it } from 'vitest';
import { sampleAtArcLength, wrapArcLength } from '../arcLength.js';
import type { Point2D } from '../viewport.js';

// 사각형 perimeter 400: (0,0)→(100,0)→(100,100)→(0,100)→(0,0)
const SQUARE: readonly Point2D[] = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];
const SQUARE_S = [0, 100, 200, 300, 400];

describe('sampleAtArcLength — 사각형 perimeter 400', () => {
  it.each([
    [0, [0, 0]],
    [50, [50, 0]],
    [100, [100, 0]],
    [150, [100, 50]],
    [200, [100, 100]],
    [250, [50, 100]],
    [300, [0, 100]],
    [350, [0, 50]],
    [400, [0, 0]],
  ] as Array<[number, [number, number]]>)('s=%s → %o', (s, [ex, ey]) => {
    const [x, y] = sampleAtArcLength(SQUARE, SQUARE_S, s);
    expect(x).toBeCloseTo(ex);
    expect(y).toBeCloseTo(ey);
  });
});

describe('sampleAtArcLength — boundary clamp', () => {
  it('s < 0 → polyline[0]', () => {
    expect(sampleAtArcLength(SQUARE, SQUARE_S, -100)).toEqual([0, 0]);
  });
  it('s > total → polyline[last]', () => {
    expect(sampleAtArcLength(SQUARE, SQUARE_S, 500)).toEqual([0, 0]);
  });
});

describe('sampleAtArcLength — 잘못된 입력', () => {
  it('polyline 길이 < 2 → throw', () => {
    expect(() => sampleAtArcLength([[0, 0]], [0], 0)).toThrow();
  });
  it('arcLengthTable 길이 불일치 → throw', () => {
    expect(() => sampleAtArcLength(SQUARE, [0, 100, 200], 50)).toThrow();
  });
});

describe('wrapArcLength — 1랩 wrapping', () => {
  it.each([
    [0, 400, 0],
    [50, 400, 50],
    [400, 400, 0],
    [450, 400, 50],
    [1250, 400, 50],
    [-50, 400, 350],
    [-400, 400, 0],
    [-450, 400, 350],
  ])('wrapArcLength(%s, %s) === %s', (s, total, expected) => {
    expect(wrapArcLength(s, total)).toBeCloseTo(expected);
  });
  it('totalLength ≤ 0 → throw', () => {
    expect(() => wrapArcLength(50, 0)).toThrow();
    expect(() => wrapArcLength(50, -10)).toThrow();
  });
});
