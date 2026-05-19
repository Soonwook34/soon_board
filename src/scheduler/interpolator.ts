// Pure interpolation utilities — no external dependencies.

export function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha
}

export function lerpXY(
  s0: { t: number; x: number; y: number },
  s1: { t: number; x: number; y: number },
  t: number,
): { x: number; y: number } {
  if (s1.t === s0.t) return { x: s0.x, y: s0.y }
  const alpha = (t - s0.t) / (s1.t - s0.t)
  return {
    x: lerp(s0.x, s1.x, alpha),
    y: lerp(s0.y, s1.y, alpha),
  }
}

// Catmull-Rom spline — interpolates between s1 and s2 using s0 and s3 as outer control points.
// t must be in [s1.t, s2.t].
export function catmullRomXY(
  s0: { t: number; x: number; y: number },
  s1: { t: number; x: number; y: number },
  s2: { t: number; x: number; y: number },
  s3: { t: number; x: number; y: number },
  t: number,
  tension = 0.5,
): { x: number; y: number } {
  if (s2.t === s1.t) return { x: s1.x, y: s1.y }
  const alpha = (t - s1.t) / (s2.t - s1.t)

  // Catmull-Rom matrix form using tension
  const t2 = alpha * alpha
  const t3 = t2 * alpha

  const c0 = -tension * t3 + 2 * tension * t2 - tension * alpha
  const c1 = (2 - tension) * t3 + (tension - 3) * t2 + 1
  const c2 = (tension - 2) * t3 + (3 - 2 * tension) * t2 + tension * alpha
  const c3 = tension * t3 - tension * t2

  return {
    x: c0 * s0.x + c1 * s1.x + c2 * s2.x + c3 * s3.x,
    y: c0 * s0.y + c1 * s1.y + c2 * s2.y + c3 * s3.y,
  }
}

// Given sorted samples[] and target t, return interpolated xy.
// Returns null if samples is empty.
// Clamps: t < first.t → first sample; t > last.t → last sample (no extrapolation).
export function sampleAt(
  samples: { t: number; x: number; y: number }[],
  t: number,
  mode: 'lerp' | 'catmull' = 'lerp',
): { x: number; y: number } | null {
  if (samples.length === 0) return null

  const first = samples[0]
  const last = samples[samples.length - 1]

  if (t <= first.t) return { x: first.x, y: first.y }
  if (t >= last.t) return { x: last.x, y: last.y }

  // Binary search for the interval [samples[lo], samples[lo+1]] containing t
  let lo = 0
  let hi = samples.length - 2
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (samples[mid + 1].t <= t) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  const s1 = samples[lo]
  const s2 = samples[lo + 1]

  if (mode === 'catmull' && samples.length >= 4) {
    const s0 = samples[Math.max(0, lo - 1)]
    const s3 = samples[Math.min(samples.length - 1, lo + 2)]
    return catmullRomXY(s0, s1, s2, s3, t)
  }

  return lerpXY(s1, s2, t)
}
