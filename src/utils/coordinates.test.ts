import { describe, it, expect } from 'vitest'
import {
  applyAffine,
  composeAffine,
  fitAffine,
  yFlipAffine,
  IDENTITY,
  type Affine,
} from './coordinates'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRotationAffine(angleDeg: number, scale: number, tx: number, ty: number): Affine {
  const theta = (angleDeg * Math.PI) / 180
  const a = scale * Math.cos(theta)
  const b = scale * Math.sin(theta)
  return { a, b, c: -b, d: a, tx, ty }
}

/** Simple seeded PRNG (xorshift32) for reproducible "random" points */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s ^= s << 13
    s ^= s >> 17
    s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}

// ---------------------------------------------------------------------------
// applyAffine
// ---------------------------------------------------------------------------

describe('applyAffine', () => {
  it('returns input unchanged for identity', () => {
    expect(applyAffine([3, 7], IDENTITY)).toEqual([3, 7])
    expect(applyAffine([0, 0], IDENTITY)).toEqual([0, 0])
    expect(applyAffine([-5, 100], IDENTITY)).toEqual([-5, 100])
  })

  it('applies translation', () => {
    const A: Affine = { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: -3 }
    const [x, y] = applyAffine([2, 4], A)
    expect(x).toBeCloseTo(12)
    expect(y).toBeCloseTo(1)
  })
})

// ---------------------------------------------------------------------------
// composeAffine
// ---------------------------------------------------------------------------

describe('composeAffine', () => {
  it('compose with identity is identity', () => {
    const A = makeRotationAffine(45, 2, 5, -3)
    const AB = composeAffine(A, IDENTITY)
    const BA = composeAffine(IDENTITY, A)
    ;([AB, BA] as const).forEach((C) => {
      expect(C.a).toBeCloseTo(A.a)
      expect(C.b).toBeCloseTo(A.b)
      expect(C.c).toBeCloseTo(A.c)
      expect(C.d).toBeCloseTo(A.d)
      expect(C.tx).toBeCloseTo(A.tx)
      expect(C.ty).toBeCloseTo(A.ty)
    })
  })

  it('applyAffine(p, compose(A,B)) === applyAffine(applyAffine(p, B), A) for 10 random points', () => {
    const rng = makeRng(42)
    const A = makeRotationAffine(37, 1.5, 7, -2)
    const B = makeRotationAffine(20, 0.8, -3, 11)
    const AB = composeAffine(A, B)

    for (let i = 0; i < 10; i++) {
      const p: [number, number] = [rng() * 200 - 100, rng() * 200 - 100]
      const direct = applyAffine(p, AB)
      const stepwise = applyAffine(applyAffine(p, B), A)
      expect(direct[0]).toBeCloseTo(stepwise[0], 10)
      expect(direct[1]).toBeCloseTo(stepwise[1], 10)
    }
  })
})

// ---------------------------------------------------------------------------
// fitAffine
// ---------------------------------------------------------------------------

describe('fitAffine', () => {
  it('throws on mismatched or too-short point lists', () => {
    expect(() => fitAffine([[1, 2]], [[3, 4]])).toThrow('fitAffine requires equal non-empty point lists')
    expect(() => fitAffine([[1, 2], [3, 4]], [[5, 6]])).toThrow()
    expect(() => fitAffine([], [])).toThrow()
  })

  it('recovers scale(2) + rotate(30°) + translate(10, 5) within 1e-6, residual < 1e-9', () => {
    const A = makeRotationAffine(30, 2, 10, 5)
    const rng = makeRng(7)
    const source: [number, number][] = Array.from({ length: 5 }, () => [
      rng() * 100 - 50,
      rng() * 100 - 50,
    ])
    const target: [number, number][] = source.map((p) => applyAffine(p, A))

    const { affine, residual } = fitAffine(source, target)

    expect(affine.a).toBeCloseTo(A.a, 6)
    expect(affine.b).toBeCloseTo(A.b, 6)
    expect(affine.c).toBeCloseTo(A.c, 6)
    expect(affine.d).toBeCloseTo(A.d, 6)
    expect(affine.tx).toBeCloseTo(A.tx, 6)
    expect(affine.ty).toBeCloseTo(A.ty, 6)
    expect(residual).toBeLessThan(1e-9)
  })

  it('noise test: residual is O(σ) when gaussian noise σ=0.01 added', () => {
    const A = makeRotationAffine(15, 1.5, -3, 8)
    const rng = makeRng(99)
    // Box-Muller for gaussian noise
    const gauss = () => {
      const u1 = rng() || 1e-15
      const u2 = rng()
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
    }
    const sigma = 0.01
    const source: [number, number][] = Array.from({ length: 20 }, () => [
      rng() * 100 - 50,
      rng() * 100 - 50,
    ])
    const target: [number, number][] = source.map((p) => {
      const [x, y] = applyAffine(p, A)
      return [x + sigma * gauss(), y + sigma * gauss()]
    })

    const { residual } = fitAffine(source, target)
    // residual should be in the same ballpark as sigma (within 10×)
    expect(residual).toBeLessThan(sigma * 10)
    expect(residual).toBeGreaterThan(0)
  })

  it('handles minimum 2-point case', () => {
    const A = makeRotationAffine(45, 1, 0, 0)
    const source: [number, number][] = [[1, 0], [0, 1]]
    const target: [number, number][] = source.map((p) => applyAffine(p, A))
    const { residual } = fitAffine(source, target)
    expect(residual).toBeLessThan(1e-9)
  })
})

// ---------------------------------------------------------------------------
// yFlipAffine
// ---------------------------------------------------------------------------

describe('yFlipAffine', () => {
  it('maps y=0 → viewBoxHeight and y=viewBoxHeight → 0 (yOffset=0)', () => {
    const h = 500
    const A = yFlipAffine(h)
    const [, yTop] = applyAffine([0, 0], A)
    const [, yBot] = applyAffine([0, h], A)
    expect(yTop).toBeCloseTo(h)
    expect(yBot).toBeCloseTo(0)
  })

  it('x-coordinate is unchanged', () => {
    const A = yFlipAffine(300)
    const [x] = applyAffine([42, 0], A)
    expect(x).toBeCloseTo(42)
  })

  it('yOffset shifts the flip axis', () => {
    const h = 400
    const offset = 50
    const A = yFlipAffine(h, offset)
    // y=0 should map to h + 2*offset
    const [, y0] = applyAffine([0, 0], A)
    expect(y0).toBeCloseTo(h + 2 * offset)
    // y=(h+2*offset) should map to 0
    const [, yFull] = applyAffine([0, h + 2 * offset], A)
    expect(yFull).toBeCloseTo(0)
  })
})
