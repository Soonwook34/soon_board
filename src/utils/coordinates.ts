/**
 * 2-D affine / similarity transform utilities.
 *
 * Affine matrix (column-major, 2×3 augmented form):
 *   | a  c  tx |   maps (x,y) → (a·x + c·y + tx,  b·x + d·y + ty)
 *   | b  d  ty |
 *
 * For a similarity transform (scale + rotation, no shear):
 *   a = s·cos θ,  b = s·sin θ,  c = −s·sin θ,  d = s·cos θ
 */

export interface Affine {
  a: number
  b: number // first column / x basis
  c: number
  d: number // second column / y basis
  tx: number
  ty: number // translation
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

export function applyAffine([x, y]: [number, number], A: Affine): [number, number] {
  return [A.a * x + A.c * y + A.tx, A.b * x + A.d * y + A.ty]
}

/**
 * Compose two transforms so that:
 *   applyAffine(p, composeAffine(A, B)) === applyAffine(applyAffine(p, B), A)
 * i.e. B is applied first, then A.
 */
export function composeAffine(A: Affine, B: Affine): Affine {
  return {
    a: A.a * B.a + A.c * B.b,
    b: A.b * B.a + A.d * B.b,
    c: A.a * B.c + A.c * B.d,
    d: A.b * B.c + A.d * B.d,
    tx: A.a * B.tx + A.c * B.ty + A.tx,
    ty: A.b * B.tx + A.d * B.ty + A.ty,
  }
}

export interface AffineFit {
  affine: Affine
  residual: number // RMS distance, target units
}

/**
 * Fit a 4-parameter similarity transform (scale, rotation, 2-D translation)
 * to corresponding point pairs using the closed-form least-squares solution.
 *
 * The 4 free parameters are { a, b, tx, ty } where the similarity matrix is:
 *   A = | a  -b |    (a = s·cosθ, b = s·sinθ)
 *       | b   a |
 *
 * Normal-equation solution (Umeyama, PAMI 1991 — reduced form for 2-D):
 *   a  = (Σ xi·qi + Σ yi·ri) / D
 *   b  = (Σ xi·ri − Σ yi·qi) / D     where qi = (px−μp)·(qx−μq)+...,
 *   tx = μq_x − a·μp_x + b·μp_y
 *   ty = μq_y − b·μp_x − a·μp_y
 * with D = Σ(xi²+yi²).  Works for n≥2 coincident-free point sets.
 *
 * Degenerate case: all source points coincide (D≈0) → returns IDENTITY fit
 * with non-zero residual (callers should check residual).
 */
export function fitAffine(
  source: [number, number][],
  target: [number, number][],
): AffineFit {
  if (source.length !== target.length || source.length < 2) {
    throw new Error('fitAffine requires equal non-empty point lists')
  }
  const n = source.length

  // Centroids
  let msx = 0,
    msy = 0,
    mtx = 0,
    mty = 0
  for (let i = 0; i < n; i++) {
    msx += source[i][0]
    msy += source[i][1]
    mtx += target[i][0]
    mty += target[i][1]
  }
  msx /= n
  msy /= n
  mtx /= n
  mty /= n

  // Accumulate sums in centred coordinates
  let sumXQ = 0,
    sumYQ = 0,
    sumXR = 0,
    sumYR = 0,
    D = 0
  for (let i = 0; i < n; i++) {
    const xi = source[i][0] - msx
    const yi = source[i][1] - msy
    const qi = target[i][0] - mtx // target x centred
    const ri = target[i][1] - mty // target y centred
    sumXQ += xi * qi
    sumYQ += yi * qi
    sumXR += xi * ri
    sumYR += yi * ri
    D += xi * xi + yi * yi
  }

  let a: number, b: number
  if (Math.abs(D) < 1e-12) {
    // Degenerate: all source points coincide — return identity translation
    a = 1
    b = 0
  } else {
    a = (sumXQ + sumYR) / D
    b = (sumXR - sumYQ) / D
  }

  const tx = mtx - a * msx + b * msy
  const ty = mty - b * msx - a * msy

  const affine: Affine = { a, b: b, c: -b, d: a, tx, ty }

  // Compute RMS residual
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const [px, py] = applyAffine(source[i], affine)
    const dx = px - target[i][0]
    const dy = py - target[i][1]
    sumSq += dx * dx + dy * dy
  }
  const residual = Math.sqrt(sumSq / n)

  return { affine, residual }
}

/**
 * Returns the affine that maps telemetry (x, y_up) into SVG (x, y_down) space.
 * SVG y increases downward; telemetry y typically increases upward.
 *
 * Transform: x' = x,  y' = (viewBoxHeight + 2·yOffset) − y
 *   → Affine: a=1, b=0, c=0, d=-1, tx=0, ty=(viewBoxHeight + 2·yOffset)
 *
 * With yOffset=0 (default): maps y=0→viewBoxHeight, y=viewBoxHeight→0.
 */
export function yFlipAffine(viewBoxHeight: number, yOffset = 0): Affine {
  return {
    a: 1,
    b: 0,
    c: 0,
    d: -1,
    tx: 0,
    ty: viewBoxHeight + 2 * yOffset,
  }
}
