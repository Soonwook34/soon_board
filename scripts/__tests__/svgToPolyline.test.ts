// scripts/_lib/svgToPolyline.ts 단위 테스트 — live-map §1.3.1 인수 9 (≤ 50KB) 의 기반.

import { describe, expect, it } from 'vitest';
import {
  extractFirstPathD,
  extractViewBox,
  svgToPolyline,
} from '../_lib/svgToPolyline.js';

// 합성 SVG: 100×100 viewBox + 정사각형 path (M0,0 L100,0 L100,100 L0,100 Z).
// total_length = 400 (4 변). step=10 이면 ~40 segment + 마지막 closing point.
const SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M0,0 L100,0 L100,100 L0,100 Z" stroke="black" fill="none"/>
</svg>`;

// width/height 만 있고 viewBox 없는 케이스.
const WIDTH_HEIGHT_ONLY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500">
  <path d="M0,0 L500,0 L500,500 L0,500 Z"/>
</svg>`;

// 첫 번째 path 가 outline, 두 번째 는 inner — 첫 번째만 쓰여야 함 (julesr0y minimal 패턴).
const TWO_PATH_SVG = `<svg viewBox="0 0 200 200">
  <path d="M10,10 L100,10 L100,100 L10,100 Z" stroke="white" stroke-width="20"/>
  <path d="M10,10 L100,10 L100,100 L10,100 Z" stroke="black" stroke-width="5"/>
</svg>`;

const NO_PATH_SVG = `<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>`;
const NO_VIEWBOX_NO_SIZE_SVG = `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0,0 L10,10"/></svg>`;

describe('extractViewBox', () => {
  it('parses standard viewBox attribute', () => {
    expect(extractViewBox(SQUARE_SVG)).toEqual([0, 0, 100, 100]);
  });
  it('falls back to width/height when viewBox absent', () => {
    expect(extractViewBox(WIDTH_HEIGHT_ONLY_SVG)).toEqual([0, 0, 500, 500]);
  });
  it('handles comma-separated viewBox values', () => {
    expect(extractViewBox('<svg viewBox="0,0,500,500"></svg>')).toEqual([0, 0, 500, 500]);
  });
  it('throws when neither viewBox nor width/height present', () => {
    expect(() => extractViewBox(NO_VIEWBOX_NO_SIZE_SVG)).toThrow(/viewBox/);
  });
});

describe('extractFirstPathD', () => {
  it('returns first <path d> attribute', () => {
    expect(extractFirstPathD(SQUARE_SVG)).toBe('M0,0 L100,0 L100,100 L0,100 Z');
  });
  it('returns only the first path when multiple exist', () => {
    const d = extractFirstPathD(TWO_PATH_SVG);
    expect(d).toBe('M10,10 L100,10 L100,100 L10,100 Z');
  });
  it('returns null when no <path> exists', () => {
    expect(extractFirstPathD(NO_PATH_SVG)).toBeNull();
  });
});

describe('svgToPolyline', () => {
  it('produces uniform-arc-length polyline for a square', () => {
    const r = svgToPolyline(SQUARE_SVG, { stepUnits: 10 });
    expect(r.viewBox).toEqual([0, 0, 100, 100]);
    expect(r.total_length).toBeCloseTo(400, 1);
    // 40 interior + 1 closing
    expect(r.polyline.length).toBe(41);
    expect(r.arc_length_table.length).toBe(41);
    // arc_length_table monotonically increasing
    for (let i = 1; i < r.arc_length_table.length; i++) {
      expect(r.arc_length_table[i]).toBeGreaterThan(r.arc_length_table[i - 1]);
    }
    expect(r.arc_length_table[0]).toBe(0);
    expect(r.arc_length_table[r.arc_length_table.length - 1]).toBeCloseTo(400, 1);
  });

  it('polyline starts at path origin and closes back to it', () => {
    const r = svgToPolyline(SQUARE_SVG, { stepUnits: 10 });
    const [x0, y0] = r.polyline[0];
    const [xN, yN] = r.polyline[r.polyline.length - 1];
    expect(x0).toBeCloseTo(0, 1);
    expect(y0).toBeCloseTo(0, 1);
    expect(xN).toBeCloseTo(0, 1);
    expect(yN).toBeCloseTo(0, 1);
  });

  it('respects decimals option for size reduction', () => {
    const r = svgToPolyline(SQUARE_SVG, { stepUnits: 10, decimals: 1 });
    // Each coordinate has at most 1 decimal place
    for (const [x, y] of r.polyline) {
      expect(Math.round(x * 10) / 10).toBeCloseTo(x, 6);
      expect(Math.round(y * 10) / 10).toBeCloseTo(y, 6);
    }
  });

  it('rejects non-positive step', () => {
    expect(() => svgToPolyline(SQUARE_SVG, { stepUnits: 0 })).toThrow(/stepUnits/);
    expect(() => svgToPolyline(SQUARE_SVG, { stepUnits: -1 })).toThrow(/stepUnits/);
  });

  it('throws when no path present', () => {
    expect(() => svgToPolyline(NO_PATH_SVG)).toThrow(/path/i);
  });

  it('uses only the first path in multi-path SVG (outer outline)', () => {
    const r = svgToPolyline(TWO_PATH_SVG, { stepUnits: 10 });
    expect(r.polyline[0][0]).toBeCloseTo(10, 1);
    expect(r.polyline[0][1]).toBeCloseTo(10, 1);
    // Square 10..100 → total_length 360
    expect(r.total_length).toBeCloseTo(360, 1);
  });

  it('smaller step produces more samples', () => {
    const coarse = svgToPolyline(SQUARE_SVG, { stepUnits: 20 });
    const fine = svgToPolyline(SQUARE_SVG, { stepUnits: 5 });
    expect(fine.polyline.length).toBeGreaterThan(coarse.polyline.length);
  });
});
