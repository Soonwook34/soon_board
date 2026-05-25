// src/map/mapStyles.ts — 다크 모드 토큰 일관성 검증.

import { describe, expect, it } from 'vitest';
import { color } from '../../style/tokens.js';
import { mapStyles } from '../mapStyles.js';

describe('mapStyles', () => {
  it('all color values map to src/style/tokens.ts entries (no raw hex)', () => {
    expect(mapStyles.bgPrimary).toBe(color.bgBase);
    expect(mapStyles.trackStroke).toBe(color.bgElevated);
    expect(mapStyles.pitlaneStroke).toBe(color.bgSurface);
    expect(mapStyles.loadingTextColor).toBe(color.textSecondary);
  });

  it('stroke widths are positive numbers', () => {
    expect(mapStyles.trackStrokeWidth).toBeGreaterThan(0);
    expect(mapStyles.pitlaneStrokeWidth).toBeGreaterThan(0);
  });

  it('pit-lane dash pattern matches live-map §4.5 (4/2 dash/gap)', () => {
    expect(mapStyles.pitlaneDashPattern).toEqual([4, 2]);
  });
});
