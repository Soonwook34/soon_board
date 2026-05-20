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

export interface SampleAtOptions {
  mode?: 'lerp' | 'catmull'
  // When both snapDivisor > 0 and trackLength > 0, a segment longer than
  // trackLength / snapDivisor is treated as a teleport (lap wrap-around,
  // replay seek). The interpolator snaps to the later sample instead of
  // rubber-banding through the chord. Old_project uses snapDivisor=30 on
  // a 3337 m Monaco lap — ~111 m gap before snapping kicks in.
  snapDivisor?: number
  trackLength?: number
  // When extrapCapMs > 0 AND snap is configured, extrapolate from the last
  // segment's velocity for up to extrapCapMs past the newest sample. Extrap
  // is skipped if the last segment already looks like a teleport (segment
  // length > snapDist). With trackLength=0 the freeze-at-last behavior is
  // preserved so the function is safe to call before substrate is built.
  extrapCapMs?: number
}

// Given sorted samples[] and target t, return interpolated xy. Returns null
// if samples is empty. The third argument accepts either the legacy string
// mode for backward compatibility, or an options object enabling snap and
// extrapolation behavior.
export function sampleAt(
  samples: { t: number; x: number; y: number }[],
  t: number,
  mode?: 'lerp' | 'catmull',
): { x: number; y: number } | null
export function sampleAt(
  samples: { t: number; x: number; y: number }[],
  t: number,
  opts: SampleAtOptions,
): { x: number; y: number } | null
export function sampleAt(
  samples: { t: number; x: number; y: number }[],
  t: number,
  modeOrOpts?: 'lerp' | 'catmull' | SampleAtOptions,
): { x: number; y: number } | null {
  if (samples.length === 0) return null

  const opts: SampleAtOptions =
    typeof modeOrOpts === 'string'
      ? { mode: modeOrOpts }
      : modeOrOpts ?? {}
  const mode = opts.mode ?? 'lerp'
  const snapDivisor = opts.snapDivisor ?? 0
  const trackLength = opts.trackLength ?? 0
  const extrapCapMs = opts.extrapCapMs ?? 0
  const haveSnap = snapDivisor > 0 && trackLength > 0
  const snapDist = haveSnap ? trackLength / snapDivisor : 0

  const first = samples[0]
  const last = samples[samples.length - 1]

  if (t <= first.t) return { x: first.x, y: first.y }

  if (t >= last.t) {
    if (extrapCapMs > 0 && haveSnap && samples.length >= 2) {
      const prev = samples[samples.length - 2]
      const dx = last.x - prev.x
      const dy = last.y - prev.y
      const dt = last.t - prev.t
      const ahead = t - last.t
      if (ahead <= extrapCapMs && dt > 0 && Math.hypot(dx, dy) <= snapDist) {
        const u = ahead / dt
        return { x: last.x + dx * u, y: last.y + dy * u }
      }
    }
    return { x: last.x, y: last.y }
  }

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

  if (haveSnap) {
    const dx = s2.x - s1.x
    const dy = s2.y - s1.y
    if (Math.hypot(dx, dy) > snapDist) {
      return { x: s2.x, y: s2.y }
    }
  }

  if (mode === 'catmull' && samples.length >= 4) {
    const s0 = samples[Math.max(0, lo - 1)]
    const s3 = samples[Math.min(samples.length - 1, lo + 2)]
    return catmullRomXY(s0, s1, s2, s3, t)
  }

  return lerpXY(s1, s2, t)
}
