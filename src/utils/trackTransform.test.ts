import { describe, it, expect } from 'vitest'
import { applyTransform } from './trackTransform'
import { TRACK_REGISTRY, resolveCircuitId, getTrackByCircuitId } from '../assets/tracks/registry'

describe('applyTransform', () => {
  it('returns translation when (a,b,c,d)=identity', () => {
    expect(applyTransform({ a: 1, b: 0, c: 0, d: 1, e: 5, f: 7 }, 10, 20)).toEqual([15, 27])
  })

  it('applies linear + translation', () => {
    expect(applyTransform({ a: 2, b: 0, c: 0, d: 3, e: 1, f: 1 }, 5, 10)).toEqual([11, 31])
  })
})

describe('TRACK_REGISTRY', () => {
  it('contains 24 circuits, each with a path and a transform', () => {
    expect(TRACK_REGISTRY).toHaveLength(24)
    for (const t of TRACK_REGISTRY) {
      expect(t.pathD.length).toBeGreaterThan(0)
      expect(t.transform).toBeDefined()
    }
  })
})

describe('resolveCircuitId', () => {
  it('matches OpenF1 short names case-insensitively', () => {
    expect(resolveCircuitId('Monaco')).toBe('monaco')
    expect(resolveCircuitId('Suzuka')).toBe('suzuka')
    expect(resolveCircuitId('Sakhir')).toBe('bahrain')
    expect(resolveCircuitId('Marina Bay')).toBe('singapore')
  })

  it('returns null for unknown or missing names', () => {
    expect(resolveCircuitId(undefined)).toBeNull()
    expect(resolveCircuitId('Unknown Circuit')).toBeNull()
  })
})

describe('getTrackByCircuitId', () => {
  it('returns the registry entry by id', () => {
    expect(getTrackByCircuitId('monaco')?.lengthM).toBe(3337)
  })

  it('returns null for unknown id', () => {
    expect(getTrackByCircuitId('zzzz')).toBeNull()
  })
})
