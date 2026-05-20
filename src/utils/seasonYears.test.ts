import { describe, it, expect } from 'vitest'
import { getAvailableYears, pickInitialYear, FIRST_AVAILABLE_YEAR } from './seasonYears'

function nowAt(year: number, month = 5, day = 20): number {
  return Date.UTC(year, month, day)
}

describe('getAvailableYears', () => {
  it('returns 2023..currentYear+1 inclusive', () => {
    expect(getAvailableYears(nowAt(2026))).toEqual([2023, 2024, 2025, 2026, 2027])
  })

  it('grows automatically when currentYear advances to 2027', () => {
    expect(getAvailableYears(nowAt(2027))).toContain(2028)
    expect(getAvailableYears(nowAt(2027)).at(-1)).toBe(2028)
  })

  it('always starts at FIRST_AVAILABLE_YEAR', () => {
    expect(getAvailableYears(nowAt(2026))[0]).toBe(FIRST_AVAILABLE_YEAR)
  })
})

describe('pickInitialYear', () => {
  it('prefers the session year when one is provided', () => {
    expect(pickInitialYear('2024-05-26T13:00:00Z', nowAt(2026))).toBe(2024)
  })

  it('falls back to currentYear when no session', () => {
    expect(pickInitialYear(undefined, nowAt(2026))).toBe(2026)
  })

  it('falls back to currentYear when session date is unparseable', () => {
    expect(pickInitialYear('not-a-date', nowAt(2026))).toBe(2026)
  })
})
