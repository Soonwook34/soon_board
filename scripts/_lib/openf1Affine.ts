// OpenF1 X/Y ↔ SVG viewBox 정합 (2D similarity / Procrustes) — live-map §2.2.
//
// 책임:
//   - fitSimilarity2D: 두 대응 점 집합에 대해 최적 scale·rotation·translate (선택적 Y-reflect)
//     를 closed-form 2D Procrustes 로 산출
//   - arcLengthResample: 임의 polyline 을 균등 호 길이로 재샘플링 (대응점 생성용)
//   - applyAffine2D: 단일 점 변환
//   - residualToPolyline: 변환된 점들에서 SVG polyline 최근접 segment 까지 평균 거리
//
// 본 모듈은 순수 함수만. 빌드 타임 스크립트(extract-openf1-transform.ts)와 단위 테스트가 사용.
// 런타임 (src/map/transform.ts) 은 별도 wrapping — 노드 의존성 분리.
//
// 수학 메모:
//   - 2D similarity transform = uniform scale + rotation + (optional Y-reflect) + translate
//   - Procrustes 공식: A, B 가 centered N×2 일 때
//       M = sum_i A_i^T B_i = [[sum a_x*b_x, sum a_x*b_y], [sum a_y*b_x, sum a_y*b_y]]
//       θ = atan2(M[0,1] - M[1,0], M[0,0] + M[1,1])  (B = scale*Rot(θ)*A 의 θ)
//       scale = (cos θ * trace(M) + sin θ * (M[0,1] - M[1,0])) / sum||A||²
//       translate = mean(B) - scale * Rot(θ) * (reflected mean(A))
//   - Reflection 처리: A_y → -A_y 적용 후 동일 공식 — 잔차 작은 쪽 채택

export type Point2D = readonly [number, number];

export interface Affine2D {
  scale: number;
  /** 회전 (도, [-180, 180]). */
  rotation_deg: number;
  translate: readonly [number, number];
  /** Y-축 반사 적용 여부. SVG 는 보통 Y-down, OpenF1 은 Y-up 이라 자주 true. */
  reflection: boolean;
}

export interface FitResult extends Affine2D {
  /** Procrustes 잔차의 RMSE (대응점 기준). 시각적 검증은 residualToPolyline 으로 별도 산출. */
  rmse: number;
}

// ── core: 2D similarity Procrustes ───────────────────────────────────────

export interface FitOptions {
  /** Y-flip 후보까지 시도해 잔차 작은 쪽 채택. 기본 true. */
  allowReflection?: boolean;
}

/**
 * 대응 점 집합 src → dst 의 최적 2D similarity transform 산출.
 * 결과를 src 의 각 점에 적용하면 dst 와 RMSE-최소화된 일치.
 */
export function fitSimilarity2D(src: Point2D[], dst: Point2D[], opts: FitOptions = {}): FitResult {
  const allowReflection = opts.allowReflection ?? true;
  const n = src.length;
  if (n !== dst.length) {
    throw new Error(`fitSimilarity2D: src.length(${n}) !== dst.length(${dst.length})`);
  }
  if (n < 2) throw new Error('fitSimilarity2D: need at least 2 points');

  const meanSrc = meanPoint(src);
  const meanDst = meanPoint(dst);

  const tryFit = (reflectY: boolean): FitResult => {
    let m00 = 0;
    let m01 = 0;
    let m10 = 0;
    let m11 = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < n; i++) {
      const axRaw = src[i][0] - meanSrc[0];
      const ayRaw = src[i][1] - meanSrc[1];
      const ax = axRaw;
      const ay = reflectY ? -ayRaw : ayRaw;
      const bx = dst[i][0] - meanDst[0];
      const by = dst[i][1] - meanDst[1];
      m00 += ax * bx;
      m01 += ax * by;
      m10 += ay * bx;
      m11 += ay * by;
      normA += ax * ax + ay * ay;
      normB += bx * bx + by * by;
    }
    if (normA === 0) {
      throw new Error('fitSimilarity2D: degenerate src (zero variance)');
    }

    // Closed-form 2D Procrustes:
    // θ s.t. R = Rot(θ) maximizes trace(R^T M) where M = A_refl^T B
    // trace(R^T M) = cos(θ) (m00+m11) + sin(θ) (m01-m10)
    // d/dθ = -sin(m00+m11) + cos(m01-m10) = 0 → tan(θ) = (m01-m10)/(m00+m11)
    const theta = Math.atan2(m01 - m10, m00 + m11);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Optimal scale: trace_RTM / normA where trace_RTM = c*(m00+m11) + s*(m01-m10)
    const trRTM = c * (m00 + m11) + s * (m01 - m10);
    const scale = trRTM / normA;

    // SSR = normB - 2*scale*trRTM + scale²*normA = normB - scale * trRTM
    const ssr = Math.max(0, normB - scale * trRTM);
    const rmse = Math.sqrt(ssr / n);

    // Translation: t = mean(dst) - scale * Rot(θ) * (reflected mean(src))
    const msY = reflectY ? -meanSrc[1] : meanSrc[1];
    const tx = meanDst[0] - scale * (c * meanSrc[0] - s * msY);
    const ty = meanDst[1] - scale * (s * meanSrc[0] + c * msY);

    return {
      scale,
      rotation_deg: (theta * 180) / Math.PI,
      translate: [tx, ty] as const,
      reflection: reflectY,
      rmse,
    };
  };

  const noRefl = tryFit(false);
  if (!allowReflection) return noRefl;
  const refl = tryFit(true);
  return refl.rmse < noRefl.rmse ? refl : noRefl;
}

// ── core: 점 변환 ────────────────────────────────────────────────────────

/**
 * Affine 을 한 점에 적용한다. src/map/transform.ts 의 런타임 함수가 본 공식 그대로 사용.
 */
export function applyAffine2D(p: Point2D, t: Affine2D): Point2D {
  const x = p[0];
  const y = t.reflection ? -p[1] : p[1];
  const rad = (t.rotation_deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    t.scale * (c * x - s * y) + t.translate[0],
    t.scale * (s * x + c * y) + t.translate[1],
  ];
}

// ── arc-length 재샘플링 ─────────────────────────────────────────────────

/**
 * 임의 polyline (>= 2 점) 을 균등 호 길이로 n 개 점으로 재샘플링한다.
 * 출력의 첫·끝 점은 입력의 첫·끝 점과 동일. closed loop 인 경우 마지막 점이
 * 시작점과 거의 일치 (입력 polyline 이 그러하다는 전제).
 */
export function arcLengthResample(polyline: Point2D[], n: number): Point2D[] {
  if (polyline.length < 2) throw new Error('arcLengthResample: polyline length < 2');
  if (n < 2) throw new Error('arcLengthResample: n < 2');

  // Cumulative arc length
  const cum: number[] = [0];
  for (let i = 1; i < polyline.length; i++) {
    const dx = polyline[i][0] - polyline[i - 1][0];
    const dy = polyline[i][1] - polyline[i - 1][1];
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1];
  if (total === 0) throw new Error('arcLengthResample: zero-length polyline');

  const out: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const target = (i * total) / (n - 1);
    out.push(pointAtArcLength(polyline, cum, target));
  }
  return out;
}

function pointAtArcLength(polyline: Point2D[], cum: number[], s: number): Point2D {
  if (s <= 0) return polyline[0];
  const total = cum[cum.length - 1];
  if (s >= total) return polyline[polyline.length - 1];
  // Binary search for the segment containing s
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen > 0 ? (s - cum[lo]) / segLen : 0;
  return [
    polyline[lo][0] + t * (polyline[hi][0] - polyline[lo][0]),
    polyline[lo][1] + t * (polyline[hi][1] - polyline[lo][1]),
  ];
}

// ── residual to polyline (변환 검증) ────────────────────────────────────

/**
 * 변환된 점들에서 SVG polyline 의 최근접 segment 까지 평균 거리 (viewBox 단위).
 * plan §2.2 잔차 인수 (< 5) 의 측정 함수.
 */
export function residualToPolyline(points: Point2D[], svgPolyline: Point2D[]): number {
  if (points.length === 0) return 0;
  if (svgPolyline.length < 2) {
    throw new Error('residualToPolyline: svgPolyline length < 2');
  }
  let total = 0;
  for (const p of points) {
    let best = Infinity;
    for (let i = 0; i < svgPolyline.length - 1; i++) {
      const d2 = pointToSegmentDist2(p, svgPolyline[i], svgPolyline[i + 1]);
      if (d2 < best) best = d2;
    }
    total += Math.sqrt(best);
  }
  return total / points.length;
}

function pointToSegmentDist2(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  let t: number;
  if (len2 === 0) t = 0;
  else t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = a[0] + t * dx;
  const qy = a[1] + t * dy;
  const ex = p[0] - qx;
  const ey = p[1] - qy;
  return ex * ex + ey * ey;
}

/**
 * polyline 위에서 p 에 가장 가까운 점을 반환. 본 함수는 brute-force O(N) — 빌드 타임에만 사용.
 * 런타임 hot path 의 pathProjection 은 별도 모듈(Phase 5).
 */
export function nearestPointOnPolyline(p: Point2D, polyline: Point2D[]): Point2D {
  let best = Infinity;
  let bestX = polyline[0][0];
  let bestY = polyline[0][1];
  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t: number;
    if (len2 === 0) t = 0;
    else t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const qx = a[0] + t * dx;
    const qy = a[1] + t * dy;
    const ex = p[0] - qx;
    const ey = p[1] - qy;
    const d2 = ex * ex + ey * ey;
    if (d2 < best) {
      best = d2;
      bestX = qx;
      bestY = qy;
    }
  }
  return [bestX, bestY];
}

// ── ICP refinement ──────────────────────────────────────────────────────

export interface IcpOptions {
  maxIterations?: number;
  /** 잔차 개선이 이만큼 이하면 조기 종료 (viewBox 단위). 기본 0.01. */
  tolerance?: number;
}

export interface IcpResult extends FitResult {
  iterations: number;
}

/**
 * Iterative Closest Point — 초기 affine 으로 OpenF1 을 변환 후 SVG polyline 의 최근접점을
 * correspondence 로 삼아 Procrustes 를 반복. 시작점 misalignment 잔여 + 모양 차이 흡수.
 *
 * 본 모듈은 임의 src 와 reference polyline 을 받는다. 정합 품질은 residualToPolyline 으로 측정.
 */
export function icpRefine(
  src: Point2D[],
  refPolyline: Point2D[],
  initial: Affine2D,
  opts: IcpOptions = {},
): IcpResult {
  const maxIter = opts.maxIterations ?? 10;
  const tol = opts.tolerance ?? 0.01;
  let current: FitResult = { ...initial, rmse: residualToPolyline(src.map((p) => applyAffine2D(p, initial)), refPolyline) };

  for (let iter = 1; iter <= maxIter; iter++) {
    const transformed = src.map((p) => applyAffine2D(p, current));
    const targets = transformed.map((p) => nearestPointOnPolyline(p, refPolyline));
    const next = fitSimilarity2D(src, targets, { allowReflection: true });
    const nextRmse = residualToPolyline(src.map((p) => applyAffine2D(p, next)), refPolyline);
    const improvement = current.rmse - nextRmse;
    current = { ...next, rmse: nextRmse };
    if (improvement >= 0 && improvement < tol) {
      return { ...current, iterations: iter };
    }
  }
  return { ...current, iterations: maxIter };
}

// ── helpers ─────────────────────────────────────────────────────────────

function meanPoint(pts: Point2D[]): Point2D {
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p[0];
    my += p[1];
  }
  return [mx / pts.length, my / pts.length];
}
