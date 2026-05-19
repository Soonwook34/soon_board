import { describe, it, expect } from 'vitest'
import { formatClock, formatScrubLabel } from './format'

describe('formatClock', () => {
  it('formats a known UTC epoch as HH:MM:SS', () => {
    // 2024-03-01T14:32:07.000Z = epoch 1709302327000
    const epochMs = Date.UTC(2024, 2, 1, 14, 32, 7)
    expect(formatClock(epochMs)).toBe('14:32:07')
  })

  it('zero-pads hours, minutes, seconds', () => {
    const epochMs = Date.UTC(2024, 0, 1, 1, 2, 3)
    expect(formatClock(epochMs)).toBe('01:02:03')
  })

  it('handles midnight', () => {
    const epochMs = Date.UTC(2024, 0, 1, 0, 0, 0)
    expect(formatClock(epochMs)).toBe('00:00:00')
  })
})

describe('formatScrubLabel', () => {
  it('returns +12:34 for 12 min 34 sec from session start', () => {
    const startMs = 1_000_000
    const sessionMs = startMs + 12 * 60_000 + 34_000
    expect(formatScrubLabel(sessionMs, startMs)).toBe('+12:34')
  })

  it('returns +00:00 when at session start', () => {
    expect(formatScrubLabel(5000, 5000)).toBe('+00:00')
  })

  it('clamps to +00:00 when before session start', () => {
    expect(formatScrubLabel(1000, 5000)).toBe('+00:00')
  })

  it('handles hours correctly', () => {
    const startMs = 0
    const sessionMs = 65 * 60_000 // 1h 5m
    expect(formatScrubLabel(sessionMs, startMs)).toBe('+65:00')
  })
})
