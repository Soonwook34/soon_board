import { describe, it, expect } from 'vitest'
import { lerp, lerpXY, catmullRomXY, sampleAt } from './interpolator'

describe('lerp', () => {
  it('interpolates midpoint', () => {
    expect(lerp(0, 10, 0.5)).toBe(5)
  })

  it('returns a at alpha=0', () => {
    expect(lerp(3, 7, 0)).toBe(3)
  })

  it('returns b at alpha=1', () => {
    expect(lerp(3, 7, 1)).toBe(7)
  })
})

describe('lerpXY', () => {
  const s0 = { t: 0, x: 0, y: 0 }
  const s1 = { t: 10, x: 10, y: 20 }

  it('returns s0 at t=s0.t (alpha=0)', () => {
    expect(lerpXY(s0, s1, 0)).toEqual({ x: 0, y: 0 })
  })

  it('returns s1 at t=s1.t (alpha=1)', () => {
    expect(lerpXY(s0, s1, 10)).toEqual({ x: 10, y: 20 })
  })

  it('interpolates midpoint', () => {
    const result = lerpXY(s0, s1, 5)
    expect(result.x).toBeCloseTo(5)
    expect(result.y).toBeCloseTo(10)
  })

  it('handles equal t values (returns s0)', () => {
    const same = { t: 5, x: 1, y: 2 }
    expect(lerpXY(same, same, 5)).toEqual({ x: 1, y: 2 })
  })
})

describe('catmullRomXY', () => {
  // Uniform spacing for simplicity
  const s0 = { t: 0, x: 0, y: 0 }
  const s1 = { t: 10, x: 10, y: 5 }
  const s2 = { t: 20, x: 20, y: 10 }
  const s3 = { t: 30, x: 30, y: 15 }

  it('passes through s1 at t=s1.t', () => {
    const result = catmullRomXY(s0, s1, s2, s3, s1.t)
    expect(result.x).toBeCloseTo(s1.x, 5)
    expect(result.y).toBeCloseTo(s1.y, 5)
  })

  it('passes through s2 at t=s2.t', () => {
    const result = catmullRomXY(s0, s1, s2, s3, s2.t)
    expect(result.x).toBeCloseTo(s2.x, 5)
    expect(result.y).toBeCloseTo(s2.y, 5)
  })

  it('interpolates within segment', () => {
    const result = catmullRomXY(s0, s1, s2, s3, 15)
    // For a linear set of points, Catmull-Rom should produce linear results
    expect(result.x).toBeCloseTo(15, 4)
    expect(result.y).toBeCloseTo(7.5, 4)
  })
})

describe('sampleAt', () => {
  it('returns null for empty samples', () => {
    expect(sampleAt([], 5)).toBeNull()
  })

  it('clamps t < first.t to first sample', () => {
    const samples = [
      { t: 10, x: 1, y: 2 },
      { t: 20, x: 3, y: 4 },
    ]
    expect(sampleAt(samples, 0)).toEqual({ x: 1, y: 2 })
  })

  it('freezes at last sample for t > last.t', () => {
    const samples = [
      { t: 10, x: 1, y: 2 },
      { t: 20, x: 3, y: 4 },
    ]
    const result = sampleAt(samples, 999)
    expect(result).toEqual({ x: 3, y: 4 })
  })

  it('interpolates between two sparse samples in lerp mode', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 100, x: 100, y: 200 },
    ]
    const result = sampleAt(samples, 50)
    expect(result).not.toBeNull()
    expect(result!.x).toBeCloseTo(50)
    expect(result!.y).toBeCloseTo(100)
  })

  it('uses catmull mode when requested and enough points', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 10, y: 5 },
      { t: 20, x: 20, y: 10 },
      { t: 30, x: 30, y: 15 },
    ]
    const result = sampleAt(samples, 15, 'catmull')
    expect(result).not.toBeNull()
    // For a collinear set, catmull-rom should be close to the linear midpoint
    expect(result!.x).toBeCloseTo(15, 1)
    expect(result!.y).toBeCloseTo(7.5, 1)
  })

  it('falls back to lerp in catmull mode with fewer than 4 points', () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 10, x: 10, y: 10 },
    ]
    const result = sampleAt(samples, 5, 'catmull')
    expect(result).not.toBeNull()
    expect(result!.x).toBeCloseTo(5)
    expect(result!.y).toBeCloseTo(5)
  })
})
