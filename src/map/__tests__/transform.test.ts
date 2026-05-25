// src/map/transform.ts 런타임 단위 테스트.
// scripts/_lib/openf1Affine.ts 의 applyAffine2D 와 수치 일치 cross-check (인수 US-003).

import { describe, expect, it } from 'vitest';
import { applyAffine2D, type Affine2D } from '../../../scripts/_lib/openf1Affine.js';
import { applyOpenF1Transform, type OpenF1Transform } from '../transform.js';

describe('applyOpenF1Transform', () => {
  it('identity (no rotation, scale=1, translate=[0,0])', () => {
    const t: OpenF1Transform = {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
    };
    const [x, y] = applyOpenF1Transform(123.4, -56.7, t);
    expect(x).toBeCloseTo(123.4, 9);
    expect(y).toBeCloseTo(-56.7, 9);
  });

  it('scale + translate', () => {
    const t: OpenF1Transform = {
      scale: 0.025,
      rotation_deg: 0,
      translate: [250, 250],
    };
    const [x, y] = applyOpenF1Transform(2000, 1000, t);
    expect(x).toBeCloseTo(2000 * 0.025 + 250, 6);
    expect(y).toBeCloseTo(1000 * 0.025 + 250, 6);
  });

  it('rotation -47.3° + scale + translate', () => {
    const t: OpenF1Transform = {
      scale: 0.05,
      rotation_deg: -47.3,
      translate: [100, 200],
    };
    const [x, y] = applyOpenF1Transform(1000, 500, t);
    const rad = (-47.3 * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    expect(x).toBeCloseTo(0.05 * (c * 1000 - s * 500) + 100, 6);
    expect(y).toBeCloseTo(0.05 * (s * 1000 + c * 500) + 200, 6);
  });

  it('reflection=true flips Y of input before rotation', () => {
    const t: OpenF1Transform = {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
      reflection: true,
    };
    const [x, y] = applyOpenF1Transform(3, 4, t);
    expect(x).toBeCloseTo(3, 9);
    expect(y).toBeCloseTo(-4, 9);
  });

  it('reflection field omitted → backward-compat (false default)', () => {
    const t: OpenF1Transform = {
      scale: 1,
      rotation_deg: 0,
      translate: [0, 0],
    };
    // No reflection
    const [, y] = applyOpenF1Transform(0, 7, t);
    expect(y).toBeCloseTo(7, 9);
  });

  it('matches scripts/_lib/openf1Affine.ts applyAffine2D exactly (cross-check)', () => {
    const cases: { runtime: OpenF1Transform; build: Affine2D; pts: [number, number][] }[] = [
      {
        runtime: { scale: 1, rotation_deg: 0, translate: [0, 0] },
        build: { scale: 1, rotation_deg: 0, translate: [0, 0], reflection: false },
        pts: [[1, 2], [-3, 4], [100, -200]],
      },
      {
        runtime: { scale: 0.025, rotation_deg: 47.3, translate: [250, 250], reflection: true },
        build: { scale: 0.025, rotation_deg: 47.3, translate: [250, 250], reflection: true },
        pts: [[0, 0], [1000, 500], [-1500, 2000]],
      },
      {
        runtime: { scale: 2, rotation_deg: -90, translate: [-50, 75], reflection: false },
        build: { scale: 2, rotation_deg: -90, translate: [-50, 75], reflection: false },
        pts: [[3.14159, 2.71828], [0, 0], [1e6, -1e6]],
      },
    ];
    for (const { runtime, build, pts } of cases) {
      for (const [px, py] of pts) {
        const [rx, ry] = applyOpenF1Transform(px, py, runtime);
        const [bx, by] = applyAffine2D([px, py], build);
        expect(rx).toBeCloseTo(bx, 9);
        expect(ry).toBeCloseTo(by, 9);
      }
    }
  });
});
