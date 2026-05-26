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

  it('marker 크기 (live-map §4.1 — min 18, max 32)', () => {
    expect(mapStyles.markerSizeMin).toBe(18);
    expect(mapStyles.markerSizeMax).toBe(32);
    expect(mapStyles.markerSizeMin).toBeLessThan(mapStyles.markerSizeMax);
  });

  it('marker 외곽 — color.textPrimary (흰 테두리) + 1.5px', () => {
    expect(mapStyles.markerBorderColor).toBe(color.textPrimary);
    expect(mapStyles.markerBorderWidth).toBe(1.5);
  });

  it('label 토큰 — 라벨 색 = textPrimary, offset 6px (live-map §4.1)', () => {
    expect(mapStyles.labelColor).toBe(color.textPrimary);
    expect(mapStyles.labelOffsetPx).toBe(6);
  });

  it('Phase 7 trail 토큰 — alpha gradient + line 두께', () => {
    expect(mapStyles.trailAlphaStart).toBe(0);
    expect(mapStyles.trailAlphaEnd).toBe(0.3);
    expect(mapStyles.trailLineWidth).toBeGreaterThan(0);
  });

  it('Phase 7 state 토큰 — disconnectedAlpha 0.5, retiredFill = textMuted (raw hex 없음)', () => {
    expect(mapStyles.disconnectedAlpha).toBe(0.5);
    expect(mapStyles.retiredFill).toBe(color.textMuted);
  });

  it('Phase 8 pit 토큰 — pitDashPattern [3,2] + pitStoppedScale 0.7', () => {
    expect(mapStyles.pitDashPattern).toEqual([3, 2]);
    expect(mapStyles.pitStoppedScale).toBe(0.7);
  });
});
