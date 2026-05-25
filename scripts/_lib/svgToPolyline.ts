// SVG path → polyline + arc-length 변환 — live-map §1.3.1 step 4·5.
//
// 책임:
//   1. SVG 텍스트에서 viewBox + 첫 번째 <path d="..."> 추출
//   2. path d 를 svg-path-properties 로 평가해 균등 호 길이 간격으로 샘플링
//   3. 누적 arc-length 테이블 산출
//
// 본 모듈은 입력 SVG 문자열만 받고, 파일 I/O 는 호출자(fetch-circuit-maps.ts) 책임.
// 단위 테스트가 합성 SVG 로 검증 가능.
//
// 단순 정규식 파싱: julesr0y SVG 는 평탄한 구조(`<svg ...><path d="..."/></svg>`)라
// 풀 XML 파서 의존성은 과잉. 다른 소스를 추가할 때만 교체 검토.

import { svgPathProperties } from 'svg-path-properties';

export type Point2D = readonly [number, number];

export interface PolylineResult {
  /** SVG viewBox `[minX, minY, width, height]`. */
  viewBox: readonly [number, number, number, number];
  /** 균등 호 길이로 샘플링된 점들. 마지막 점은 보통 시작점과 일치(closed loop). */
  polyline: Point2D[];
  /** polyline[i] 까지의 누적 호 길이. arc_length_table[0] === 0, [last] === totalLength. */
  arc_length_table: number[];
  /** path 전체 호 길이 (viewBox 단위). */
  total_length: number;
}

export interface SvgToPolylineOptions {
  /** 샘플링 간격 (viewBox 단위). 기본 2.0 — 보통 500-1000 segment 가 생성됨 (§5.7 budget). */
  stepUnits?: number;
  /** 좌표 반올림 자릿수. 기본 2 (≈ 0.01 viewBox 단위 정밀도, JSON 크기 절감). */
  decimals?: number;
}

const DEFAULT_STEP = 2.0;
const DEFAULT_DECIMALS = 2;

/**
 * SVG 텍스트로부터 메인 트랙 polyline 을 추출한다.
 * @throws viewBox/path 추출 실패 시
 */
export function svgToPolyline(svgText: string, opts: SvgToPolylineOptions = {}): PolylineResult {
  const step = opts.stepUnits ?? DEFAULT_STEP;
  const decimals = opts.decimals ?? DEFAULT_DECIMALS;
  if (!(step > 0)) throw new Error(`stepUnits must be > 0 (got ${step})`);

  const viewBox = extractViewBox(svgText);
  const pathD = extractFirstPathD(svgText);
  if (pathD === null) throw new Error('No <path d="..."> found in SVG');

  const props = new svgPathProperties(pathD);
  const totalLength = props.getTotalLength();
  if (!(totalLength > 0)) {
    throw new Error(`SVG path has non-positive length: ${totalLength}`);
  }

  // 균등 샘플링: s = 0, step, 2*step, ..., (n-1)*step
  // n*step >= totalLength 가 되도록. 마지막 점은 totalLength 에서 1회 더 샘플링해
  // closed-loop 의 endpoint 가 시작점과 일치하도록 (rounding 오차 흡수).
  const interiorCount = Math.max(1, Math.floor(totalLength / step));
  const polyline: Point2D[] = [];
  const arc_length_table: number[] = [];

  for (let i = 0; i < interiorCount; i++) {
    const s = i * step;
    const p = props.getPointAtLength(s);
    polyline.push([round(p.x, decimals), round(p.y, decimals)]);
    arc_length_table.push(round(s, decimals));
  }
  // closing point at exact totalLength
  const closing = props.getPointAtLength(totalLength);
  polyline.push([round(closing.x, decimals), round(closing.y, decimals)]);
  arc_length_table.push(round(totalLength, decimals));

  return {
    viewBox,
    polyline,
    arc_length_table,
    total_length: round(totalLength, decimals),
  };
}

// ── parsers ─────────────────────────────────────────────────────────────

/**
 * `<svg viewBox="0 0 500 500">` 또는 `<svg width="500" height="500">` 에서 viewBox 추출.
 * 둘 다 있으면 viewBox 우선. 둘 다 없으면 throw.
 */
export function extractViewBox(
  svgText: string,
): readonly [number, number, number, number] {
  const vbMatch = /<svg\b[^>]*\bviewBox\s*=\s*"([^"]+)"/i.exec(svgText);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2], parts[3]] as const;
    }
    throw new Error(`Malformed viewBox: "${vbMatch[1]}"`);
  }
  const wMatch = /<svg\b[^>]*\bwidth\s*=\s*"([^"]+)"/i.exec(svgText);
  const hMatch = /<svg\b[^>]*\bheight\s*=\s*"([^"]+)"/i.exec(svgText);
  if (wMatch && hMatch) {
    const w = parseFloat(wMatch[1]);
    const h = parseFloat(hMatch[1]);
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return [0, 0, w, h] as const;
    }
  }
  throw new Error('SVG missing both viewBox and width/height');
}

/**
 * SVG 본문에서 첫 번째 `<path>` 요소의 d 속성 추출. 못 찾으면 null.
 * julesr0y minimal SVG 는 보통 2개 path 가 있고 둘이 같은 d (outer/inner stroke) — 첫 번째 사용.
 */
export function extractFirstPathD(svgText: string): string | null {
  const m = /<path\b[^>]*\bd\s*=\s*"([^"]+)"/i.exec(svgText);
  return m ? m[1] : null;
}

// ── helpers ─────────────────────────────────────────────────────────────

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
