/**
 * Polyline / viewport fitting utilities for circuit rendering.
 */

import type { Lap, LocationRow } from '@/api/types'

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

export function computeBbox(points: [number, number][]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }
  let minX = points[0][0],
    minY = points[0][1],
    maxX = points[0][0],
    maxY = points[0][1]
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { minX, minY, maxX, maxY }
}

// ---------------------------------------------------------------------------
// Padded viewBox
// ---------------------------------------------------------------------------

/**
 * Adds symmetric padding (as a fraction of the larger dimension) around a bbox
 * and (optionally) extends the viewBox along one axis so its aspect ratio
 * matches a target container aspect. This lets `preserveAspectRatio="xMidYMid meet"`
 * fill the container without letterboxing — the extra padding fills what would
 * otherwise be dead space, no crop, no distortion.
 *
 * When `containerAspect` is null/undefined/non-positive, only symmetric padding
 * is applied (matches the original `paddedViewBox` behavior).
 */
export function paddedViewBoxForAspect(
  bbox: ReturnType<typeof computeBbox>,
  containerAspect: number | null,
  padPct = 0.05,
): { x: number; y: number; width: number; height: number; viewBox: string } {
  const w = bbox.maxX - bbox.minX
  const h = bbox.maxY - bbox.minY
  const basePad = Math.max(w, h) * padPct
  let x = bbox.minX - basePad
  let y = bbox.minY - basePad
  let width = w + 2 * basePad
  let height = h + 2 * basePad

  if (containerAspect !== null && containerAspect > 0 && width > 0 && height > 0) {
    const contentAspect = width / height
    if (containerAspect > contentAspect) {
      // Container is wider than content — extend viewBox horizontally.
      const extraW = height * containerAspect - width
      x -= extraW / 2
      width += extraW
    } else if (containerAspect < contentAspect) {
      // Container is taller than content — extend viewBox vertically.
      const extraH = width / containerAspect - height
      y -= extraH / 2
      height += extraH
    }
  }
  const viewBox = `${x} ${y} ${width} ${height}`
  return { x, y, width, height, viewBox }
}

/**
 * Backward-compatibility shim — symmetric padding only, no aspect awareness.
 * New callers should use `paddedViewBoxForAspect` directly.
 */
export function paddedViewBox(
  bbox: ReturnType<typeof computeBbox>,
  padPct = 0.05,
): { x: number; y: number; width: number; height: number; viewBox: string } {
  return paddedViewBoxForAspect(bbox, null, padPct)
}

// ---------------------------------------------------------------------------
// Moving-average smoothing
// ---------------------------------------------------------------------------

/**
 * Smooths a 2-D polyline with a centred moving average.
 * Edge windows are truncated (no padding): for window=5, point 0 averages
 * points [0,1,2], point 1 averages [0,1,2,3], etc.
 */
export function smoothPolyline(
  points: [number, number][],
  window = 5,
): [number, number][] {
  if (points.length === 0) return []
  const half = Math.floor(window / 2)
  return points.map((_, i) => {
    const lo = Math.max(0, i - half)
    const hi = Math.min(points.length - 1, i + half)
    let sx = 0,
      sy = 0
    for (let j = lo; j <= hi; j++) {
      sx += points[j][0]
      sy += points[j][1]
    }
    const count = hi - lo + 1
    return [sx / count, sy / count]
  })
}

// ---------------------------------------------------------------------------
// Catmull-Rom → SVG path
// ---------------------------------------------------------------------------

/**
 * Converts a polyline to an SVG path string "M ... C ..." using
 * Catmull-Rom → cubic Bézier conversion.
 *
 * For each interior segment [i, i+1] the two control points are:
 *   cp1 = P[i]   + tension · (P[i+1] − P[i-1]) / 2
 *   cp2 = P[i+1] − tension · (P[i+2] − P[i])   / 2
 * Endpoints are clamped: P[-1] = P[0], P[n] = P[n-1].
 */
export function catmullRomToPath(
  points: [number, number][],
  tension = 0.5,
): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${fmt(points[0][0])} ${fmt(points[0][1])}`

  const n = points.length
  const p = (i: number): [number, number] =>
    i < 0 ? points[0] : i >= n ? points[n - 1] : points[i]

  const parts: string[] = [`M ${fmt(points[0][0])} ${fmt(points[0][1])}`]

  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = p(i - 1)
    const [x1, y1] = p(i)
    const [x2, y2] = p(i + 1)
    const [x3, y3] = p(i + 2)

    const cp1x = x1 + (tension * (x2 - x0)) / 2
    const cp1y = y1 + (tension * (y2 - y0)) / 2
    const cp2x = x2 - (tension * (x3 - x1)) / 2
    const cp2y = y2 - (tension * (y3 - y1)) / 2

    parts.push(
      `C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(x2)} ${fmt(y2)}`,
    )
  }

  return parts.join(' ')
}

function fmt(n: number): string {
  // Trim trailing zeros for compact output
  return parseFloat(n.toFixed(6)).toString()
}

// ---------------------------------------------------------------------------
// Lap picking
// ---------------------------------------------------------------------------

/**
 * Returns the first "clean" lap number: not a pit-out lap and has a non-null
 * duration. Laps are checked in the order provided (assumed lap_number order).
 */
export function pickCleanLap(
  laps: Pick<Lap, 'lap_number' | 'is_pit_out_lap' | 'lap_duration'>[],
): number | null {
  for (const lap of laps) {
    if (!lap.is_pit_out_lap && lap.lap_duration !== null) {
      return lap.lap_number
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Sample filtering
// ---------------------------------------------------------------------------

/**
 * Filters LocationRow[] to samples whose `date` falls within
 * [lapStartIso, lapEndIso) — inclusive start, exclusive end.
 */
export function filterSamplesToLap(
  samples: LocationRow[],
  lapStartIso: string,
  lapEndIso: string,
): LocationRow[] {
  return samples.filter(
    (s) => s.date >= lapStartIso && s.date < lapEndIso,
  )
}
