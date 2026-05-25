// scripts/_lib/openf1Affine.ts 단위 테스트 — 2D Procrustes 닫힘 형식 검증.

import { describe, expect, it } from 'vitest';
import {
  applyAffine2D,
  arcLengthResample,
  fitSimilarity2D,
  icpRefine,
  nearestPointOnPolyline,
  residualToPolyline,
  type Affine2D,
  type Point2D,
} from '../_lib/openf1Affine.js';

const PRECISION = 1e-6;

function makeTransformedSet(src: Point2D[], t: Affine2D): Point2D[] {
  return src.map((p) => applyAffine2D(p, t));
}

describe('applyAffine2D', () => {
  it('identity transform leaves points unchanged', () => {
    const id: Affine2D = { scale: 1, rotation_deg: 0, translate: [0, 0], reflection: false };
    const p: Point2D = [3, 4];
    const q = applyAffine2D(p, id);
    expect(q[0]).toBeCloseTo(3, 9);
    expect(q[1]).toBeCloseTo(4, 9);
  });

  it('uniform scale * rotation * translate', () => {
    const t: Affine2D = {
      scale: 2,
      rotation_deg: 90,
      translate: [10, 5],
      reflection: false,
    };
    // (1, 0) → rotate 90° → (0, 1) → scale 2 → (0, 2) → translate → (10, 7)
    const q = applyAffine2D([1, 0], t);
    expect(q[0]).toBeCloseTo(10, 6);
    expect(q[1]).toBeCloseTo(7, 6);
  });

  it('reflection flips Y of input before rotation', () => {
    const t: Affine2D = {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
      reflection: true,
    };
    const q = applyAffine2D([3, 4], t);
    expect(q[0]).toBeCloseTo(3, 9);
    expect(q[1]).toBeCloseTo(-4, 9);
  });
});

describe('fitSimilarity2D', () => {
  const SRC: Point2D[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0.5, 0.5],
    [-1, 0.3],
    [0.7, -0.4],
  ];

  it('recovers identity from identical point sets', () => {
    const r = fitSimilarity2D(SRC, SRC);
    expect(r.scale).toBeCloseTo(1, 6);
    expect(Math.abs(r.rotation_deg)).toBeLessThan(PRECISION);
    expect(r.translate[0]).toBeCloseTo(0, 6);
    expect(r.translate[1]).toBeCloseTo(0, 6);
    expect(r.reflection).toBe(false);
    expect(r.rmse).toBeLessThan(PRECISION);
  });

  it('recovers scale=2, rotation=30°, translate=[10,5]', () => {
    const t: Affine2D = {
      scale: 2,
      rotation_deg: 30,
      translate: [10, 5],
      reflection: false,
    };
    const dst = makeTransformedSet(SRC, t);
    const r = fitSimilarity2D(SRC, dst);
    expect(r.scale).toBeCloseTo(2, 6);
    expect(r.rotation_deg).toBeCloseTo(30, 4);
    expect(r.translate[0]).toBeCloseTo(10, 4);
    expect(r.translate[1]).toBeCloseTo(5, 4);
    expect(r.reflection).toBe(false);
    expect(r.rmse).toBeLessThan(1e-6);
  });

  it('recovers Y-reflection (SVG screen-coord ↔ OpenF1 Y-up)', () => {
    const t: Affine2D = {
      scale: 1.5,
      rotation_deg: -47.3,
      translate: [250, 250],
      reflection: true,
    };
    const dst = makeTransformedSet(SRC, t);
    const r = fitSimilarity2D(SRC, dst);
    expect(r.reflection).toBe(true);
    expect(r.scale).toBeCloseTo(1.5, 4);
    expect(r.rotation_deg).toBeCloseTo(-47.3, 3);
    expect(r.translate[0]).toBeCloseTo(250, 3);
    expect(r.translate[1]).toBeCloseTo(250, 3);
    expect(r.rmse).toBeLessThan(1e-6);
  });

  it('round-trip: apply fit to src, RMSE vs dst tiny', () => {
    const t: Affine2D = { scale: 0.025, rotation_deg: 120, translate: [100, -50], reflection: false };
    const dst = makeTransformedSet(SRC, t);
    const fit = fitSimilarity2D(SRC, dst);
    const reapplied = SRC.map((p) => applyAffine2D(p, fit));
    for (let i = 0; i < dst.length; i++) {
      expect(reapplied[i][0]).toBeCloseTo(dst[i][0], 6);
      expect(reapplied[i][1]).toBeCloseTo(dst[i][1], 6);
    }
  });

  it('with allowReflection=false, chooses non-reflective even for reflected data', () => {
    const t: Affine2D = {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
      reflection: true,
    };
    const dst = makeTransformedSet(SRC, t);
    const r = fitSimilarity2D(SRC, dst, { allowReflection: false });
    expect(r.reflection).toBe(false);
    // Non-reflective fit has nonzero residual against reflected data
    expect(r.rmse).toBeGreaterThan(0.01);
  });

  it('throws on mismatched lengths', () => {
    expect(() => fitSimilarity2D([[0, 0]], [[0, 0], [1, 0]])).toThrow(/length/);
  });

  it('throws when n < 2', () => {
    expect(() => fitSimilarity2D([[0, 0]], [[0, 0]])).toThrow(/at least 2/);
  });

  it('throws on degenerate (all-equal) src', () => {
    expect(() =>
      fitSimilarity2D(
        [
          [1, 1],
          [1, 1],
          [1, 1],
        ],
        [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
      ),
    ).toThrow(/degenerate/);
  });
});

describe('arcLengthResample', () => {
  it('resamples a straight line uniformly', () => {
    const line: Point2D[] = [
      [0, 0],
      [10, 0],
    ];
    const r = arcLengthResample(line, 5);
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual([0, 0]);
    expect(r[4]).toEqual([10, 0]);
    expect(r[2][0]).toBeCloseTo(5, 9);
    expect(r[2][1]).toBeCloseTo(0, 9);
  });

  it('resamples a square (closed loop) uniformly across all 4 sides', () => {
    const square: Point2D[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const r = arcLengthResample(square, 9); // 8 spaces of 5 units each = 40 total
    expect(r).toHaveLength(9);
    expect(r[0]).toEqual([0, 0]);
    expect(r[8][0]).toBeCloseTo(0, 6);
    expect(r[8][1]).toBeCloseTo(0, 6);
    // r[2] is at s=10, end of first side (top-right corner)
    expect(r[2][0]).toBeCloseTo(10, 6);
    expect(r[2][1]).toBeCloseTo(0, 6);
    // r[4] is at s=20, end of second side (top-left corner)
    expect(r[4][0]).toBeCloseTo(10, 6);
    expect(r[4][1]).toBeCloseTo(10, 6);
  });

  it('throws on too few points or too small n', () => {
    expect(() => arcLengthResample([[0, 0]], 5)).toThrow(/length < 2/);
    expect(() => arcLengthResample([[0, 0], [1, 1]], 1)).toThrow(/n < 2/);
  });

  it('throws on zero-length polyline', () => {
    expect(() => arcLengthResample([[1, 1], [1, 1]], 3)).toThrow(/zero-length/);
  });
});

describe('residualToPolyline', () => {
  const SQUARE: Point2D[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  it('returns 0 for points exactly on segments', () => {
    const pts: Point2D[] = [
      [5, 0],
      [10, 5],
      [0, 7],
    ];
    expect(residualToPolyline(pts, SQUARE)).toBeCloseTo(0, 9);
  });

  it('returns mean distance for off-segment points', () => {
    // Point (5, 3) on the bottom side has distance 3 to it
    // Point (5, 5) is 5 from any side
    const r = residualToPolyline([[5, 3], [5, 5]], SQUARE);
    expect(r).toBeCloseTo((3 + 5) / 2, 6);
  });

  it('returns 0 for empty point set', () => {
    expect(residualToPolyline([], SQUARE)).toBe(0);
  });

  it('throws when svgPolyline has < 2 points', () => {
    expect(() => residualToPolyline([[0, 0]], [[1, 1]])).toThrow(/length < 2/);
  });
});

describe('nearestPointOnPolyline', () => {
  const SQUARE: Point2D[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];

  it('returns the point itself when it lies on the polyline', () => {
    const q = nearestPointOnPolyline([5, 0], SQUARE);
    expect(q[0]).toBeCloseTo(5, 6);
    expect(q[1]).toBeCloseTo(0, 6);
  });
  it('projects to nearest segment when off the polyline', () => {
    // (5, 3) → nearest on bottom segment is (5, 0)
    const q = nearestPointOnPolyline([5, 3], SQUARE);
    expect(q[0]).toBeCloseTo(5, 6);
    expect(q[1]).toBeCloseTo(0, 6);
  });
  it('chooses the corner when the projection lands at a vertex', () => {
    const q = nearestPointOnPolyline([-3, -4], SQUARE);
    expect(q[0]).toBeCloseTo(0, 6);
    expect(q[1]).toBeCloseTo(0, 6);
  });
});

describe('icpRefine', () => {
  // Non-symmetric shape (rectangle) — ICP can disambiguate rotation
  // (a circle is rotationally symmetric and ICP gets stuck).
  const RECT: Point2D[] = [];
  for (let i = 0; i < 200; i++) {
    const t = i / 200;
    // perimeter ~ 6000, 4 sides of [2000, 1000, 2000, 1000] (W=2000, H=1000)
    if (t < 2000 / 6000) RECT.push([(t * 6000), 0]);
    else if (t < 3000 / 6000) RECT.push([2000, (t * 6000 - 2000)]);
    else if (t < 5000 / 6000) RECT.push([2000 - (t * 6000 - 3000), 1000]);
    else RECT.push([0, 1000 - (t * 6000 - 5000)]);
  }

  it('improves an off-by-rotation initial on a non-symmetric shape', () => {
    const trueT: Affine2D = {
      scale: 0.1,
      rotation_deg: 30,
      translate: [200, 100],
      reflection: false,
    };
    const svgPolyline = RECT.map((p) => applyAffine2D(p, trueT));

    // Bad initial: off by 5° (small enough that ICP can pull toward optimum on a rectangle)
    const badInitial: Affine2D = {
      scale: 0.1,
      rotation_deg: 25,
      translate: [200, 100],
      reflection: false,
    };
    const initialRmse = residualToPolyline(
      RECT.map((p) => applyAffine2D(p, badInitial)),
      svgPolyline,
    );
    const refined = icpRefine(RECT, svgPolyline, badInitial, {
      maxIterations: 20,
      tolerance: 1e-5,
    });

    expect(refined.iterations).toBeGreaterThanOrEqual(1);
    // ICP 가 초기보다 잔차를 줄였음을 보장
    expect(refined.rmse).toBeLessThanOrEqual(initialRmse);
  });

  it('returns early when within tolerance', () => {
    const openf1: Point2D[] = [
      [0, 0], [10, 0], [10, 10], [0, 10],
    ];
    const trueT: Affine2D = { scale: 1, rotation_deg: 0, translate: [0, 0], reflection: false };
    const svgPolyline = openf1.map((p) => applyAffine2D(p, trueT));
    const refined = icpRefine(openf1, svgPolyline, trueT, { tolerance: 0.001 });
    expect(refined.iterations).toBeLessThanOrEqual(2);
    expect(refined.rmse).toBeLessThan(0.001);
  });
});

describe('integration: fit then verify via residualToPolyline', () => {
  it('high-density polyline fit recovers near-zero residual', () => {
    // 합성 OpenF1-like polyline: circle radius 1000, 200 points (OpenF1 단위 ~1/10 m)
    const openf1: Point2D[] = [];
    for (let i = 0; i < 200; i++) {
      const θ = (2 * Math.PI * i) / 200;
      openf1.push([1000 * Math.cos(θ), 1000 * Math.sin(θ)]);
    }
    // SVG: 동일 circle, viewBox 단위로 변환된 (scale 0.05, rotation 30°, translate [250, 250], reflection true)
    const trueT: Affine2D = {
      scale: 0.05,
      rotation_deg: 30,
      translate: [250, 250],
      reflection: true,
    };
    const svg: Point2D[] = openf1.map((p) => applyAffine2D(p, trueT));

    const fit = fitSimilarity2D(openf1, svg);
    expect(fit.scale).toBeCloseTo(0.05, 6);
    expect(fit.reflection).toBe(true);
    expect(fit.rotation_deg).toBeCloseTo(30, 4);

    const transformedOpenf1 = openf1.map((p) => applyAffine2D(p, fit));
    const meanDist = residualToPolyline(transformedOpenf1, svg);
    expect(meanDist).toBeLessThan(0.01); // viewBox 단위
  });
});
