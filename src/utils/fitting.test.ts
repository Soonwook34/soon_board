import { describe, it, expect } from 'vitest'
import {
  computeBbox,
  paddedViewBox,
  smoothPolyline,
  catmullRomToPath,
  pickCleanLap,
  filterSamplesToLap,
} from './fitting'
import type { Lap, LocationRow } from '@/api/types'

// ---------------------------------------------------------------------------
// computeBbox
// ---------------------------------------------------------------------------

describe('computeBbox', () => {
  it('returns expected min/max for a 4-point square', () => {
    const pts: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]
    const bbox = computeBbox(pts)
    expect(bbox.minX).toBe(0)
    expect(bbox.minY).toBe(0)
    expect(bbox.maxX).toBe(100)
    expect(bbox.maxY).toBe(100)
  })

  it('handles negative coordinates', () => {
    const pts: [number, number][] = [[-10, -20], [30, 40]]
    const bbox = computeBbox(pts)
    expect(bbox.minX).toBe(-10)
    expect(bbox.minY).toBe(-20)
    expect(bbox.maxX).toBe(30)
    expect(bbox.maxY).toBe(40)
  })

  it('returns zeros for empty input', () => {
    const bbox = computeBbox([])
    expect(bbox).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })
})

// ---------------------------------------------------------------------------
// paddedViewBox
// ---------------------------------------------------------------------------

describe('paddedViewBox', () => {
  it('100×100 bbox with 5% pad → x=-5, y=-5, width=110, height=110', () => {
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const vb = paddedViewBox(bbox, 0.05)
    expect(vb.x).toBeCloseTo(-5)
    expect(vb.y).toBeCloseTo(-5)
    expect(vb.width).toBeCloseTo(110)
    expect(vb.height).toBeCloseTo(110)
    expect(vb.viewBox).toBe('-5 -5 110 110')
  })

  it('viewBox string is the ready-to-use SVG attribute', () => {
    const bbox = { minX: 10, minY: 20, maxX: 110, maxY: 220 }
    const vb = paddedViewBox(bbox, 0)
    // 0% pad → exactly the bbox
    expect(vb.x).toBeCloseTo(10)
    expect(vb.y).toBeCloseTo(20)
    expect(vb.width).toBeCloseTo(100)
    expect(vb.height).toBeCloseTo(200)
  })
})

// ---------------------------------------------------------------------------
// smoothPolyline
// ---------------------------------------------------------------------------

describe('smoothPolyline', () => {
  it('returns empty array for empty input', () => {
    expect(smoothPolyline([], 5)).toEqual([])
  })

  it('reduces the effect of an outlier', () => {
    // 10-point line y=0 with one outlier at index 5 (y=100)
    const pts: [number, number][] = Array.from({ length: 10 }, (_, i) => [
      i,
      i === 5 ? 100 : 0,
    ])
    const smoothed = smoothPolyline(pts, 5)
    // The smoothed outlier value should be less than 100 and > 0
    expect(smoothed[5][1]).toBeLessThan(100)
    expect(smoothed[5][1]).toBeGreaterThan(0)
    // Points far from the outlier should be smoothed close to 0
    expect(smoothed[0][1]).toBeCloseTo(0)
  })

  it('output has same length as input', () => {
    const pts: [number, number][] = Array.from({ length: 7 }, (_, i) => [i, i * 2])
    expect(smoothPolyline(pts, 5)).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// catmullRomToPath
// ---------------------------------------------------------------------------

describe('catmullRomToPath', () => {
  it('returns empty string for empty input', () => {
    expect(catmullRomToPath([])).toBe('')
  })

  it('starts with M for single point', () => {
    const path = catmullRomToPath([[10, 20]])
    expect(path.startsWith('M ')).toBe(true)
  })

  it('starts with M and contains C for 4+ points', () => {
    const pts: [number, number][] = [
      [0, 0],
      [10, 5],
      [20, 0],
      [30, 5],
    ]
    const path = catmullRomToPath(pts)
    expect(path.startsWith('M ')).toBe(true)
    expect(path).toContain('C ')
  })

  it('has one C segment per interior segment (n-1 total) for n points', () => {
    const pts: [number, number][] = [[0,0],[1,1],[2,0],[3,1],[4,0]]
    const path = catmullRomToPath(pts)
    // 5 points → 4 segments → 4 'C' tokens
    const cCount = (path.match(/\bC\b/g) ?? []).length
    expect(cCount).toBe(pts.length - 1)
  })
})

// ---------------------------------------------------------------------------
// pickCleanLap
// ---------------------------------------------------------------------------

describe('pickCleanLap', () => {
  function makeLap(
    lap_number: number,
    is_pit_out_lap: boolean,
    lap_duration: number | null,
  ): Pick<Lap, 'lap_number' | 'is_pit_out_lap' | 'lap_duration'> {
    return { lap_number, is_pit_out_lap, lap_duration }
  }

  it('returns null for empty list', () => {
    expect(pickCleanLap([])).toBeNull()
  })

  it('skips pit-out laps', () => {
    const laps = [makeLap(1, true, 90), makeLap(2, false, 88)]
    expect(pickCleanLap(laps)).toBe(2)
  })

  it('skips laps with null duration', () => {
    const laps = [makeLap(1, false, null), makeLap(2, false, 92)]
    expect(pickCleanLap(laps)).toBe(2)
  })

  it('returns first eligible lap when multiple qualify', () => {
    const laps = [
      makeLap(1, true, 90),
      makeLap(2, false, null),
      makeLap(3, false, 88),
      makeLap(4, false, 87),
    ]
    expect(pickCleanLap(laps)).toBe(3)
  })

  it('returns null when all laps are disqualified', () => {
    const laps = [makeLap(1, true, 90), makeLap(2, false, null)]
    expect(pickCleanLap(laps)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// filterSamplesToLap
// ---------------------------------------------------------------------------

describe('filterSamplesToLap', () => {
  function makeRow(date: string): LocationRow {
    return { session_key: 1, driver_number: 1, date, x: 0, y: 0, z: 0 }
  }

  const samples = [
    makeRow('2024-01-01T00:00:00.000Z'),
    makeRow('2024-01-01T00:00:01.000Z'),
    makeRow('2024-01-01T00:00:02.000Z'),
    makeRow('2024-01-01T00:00:03.000Z'),
    makeRow('2024-01-01T00:00:04.000Z'),
  ]

  it('includes samples exactly on lapStartIso', () => {
    const result = filterSamplesToLap(
      samples,
      '2024-01-01T00:00:01.000Z',
      '2024-01-01T00:00:04.000Z',
    )
    expect(result.map((r) => r.date)).toContain('2024-01-01T00:00:01.000Z')
  })

  it('excludes samples exactly on lapEndIso', () => {
    const result = filterSamplesToLap(
      samples,
      '2024-01-01T00:00:01.000Z',
      '2024-01-01T00:00:04.000Z',
    )
    expect(result.map((r) => r.date)).not.toContain('2024-01-01T00:00:04.000Z')
  })

  it('returns samples in [start, end) window', () => {
    const result = filterSamplesToLap(
      samples,
      '2024-01-01T00:00:01.000Z',
      '2024-01-01T00:00:03.000Z',
    )
    expect(result).toHaveLength(2)
    expect(result[0].date).toBe('2024-01-01T00:00:01.000Z')
    expect(result[1].date).toBe('2024-01-01T00:00:02.000Z')
  })

  it('returns empty array when no samples in window', () => {
    const result = filterSamplesToLap(
      samples,
      '2024-01-02T00:00:00.000Z',
      '2024-01-03T00:00:00.000Z',
    )
    expect(result).toHaveLength(0)
  })
})
