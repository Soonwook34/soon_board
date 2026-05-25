// scripts/extract-openf1-transform.ts 의 computeConfidence 단위 테스트.

import { describe, expect, it } from 'vitest';
import { computeConfidence } from '../extract-openf1-transform.js';

describe('computeConfidence', () => {
  it('returns 1.0 for rmse <= threshold/2 (ideal)', () => {
    expect(computeConfidence(0, 5)).toBe(1);
    expect(computeConfidence(2.5, 5)).toBe(1);
    expect(computeConfidence(2, 5)).toBe(1);
  });

  it('returns 0 for rmse >= threshold*3 (useless)', () => {
    expect(computeConfidence(15, 5)).toBe(0);
    expect(computeConfidence(100, 5)).toBe(0);
  });

  it('linearly ramps in (threshold/2, threshold*3)', () => {
    // At threshold=5: ideal=2.5, useless=15, range=12.5
    // rmse=5.0 → (5.0 - 2.5) / 12.5 = 0.2 → confidence = 0.8
    expect(computeConfidence(5, 5)).toBeCloseTo(0.8, 6);
    // rmse=8.75 = midpoint of (2.5, 15) → confidence = 0.5
    expect(computeConfidence(8.75, 5)).toBeCloseTo(0.5, 6);
    // Bahrain-like: rmse=5.60 → (5.6 - 2.5) / 12.5 = 0.248 → confidence ≈ 0.752
    expect(computeConfidence(5.6, 5)).toBeCloseTo(0.752, 3);
  });

  it('clamps to 0 for negative or NaN rmse', () => {
    expect(computeConfidence(-1, 5)).toBe(0);
    expect(computeConfidence(NaN, 5)).toBe(0);
  });

  it('scales with threshold', () => {
    expect(computeConfidence(10, 10)).toBeCloseTo(0.8, 6); // ideal=5, useless=30
    expect(computeConfidence(0, 10)).toBe(1);
    expect(computeConfidence(30, 10)).toBe(0);
  });
});
