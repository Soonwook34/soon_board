// 2D affine transform mapping OpenF1 raw location coords (~thousands of units)
// onto a pre-shipped SVG outline drawn in viewBox '0 0 1000 600'.
// Same convention as old_project: [a c e; b d f; 0 0 1].
export interface AffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export function applyTransform(t: AffineTransform, x: number, y: number): [number, number] {
  return [t.a * x + t.c * y + t.e, t.b * x + t.d * y + t.f]
}
