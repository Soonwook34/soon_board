import { describe, it, expect } from 'vitest'
import { formatLapTime, formatGap } from './format'

describe('formatLapTime', () => {
  it('formats milliseconds to mm:ss.SSS', () => {
    expect(formatLapTime(83456)).toBe('1:23.456')
  })

  it('returns em dash for null', () => {
    expect(formatLapTime(null)).toBe('—')
  })

  it('formats sub-minute lap correctly', () => {
    expect(formatLapTime(59000)).toBe('0:59.000')
  })

  it('formats multi-minute lap correctly', () => {
    expect(formatLapTime(125000)).toBe('2:05.000')
  })
})

describe('formatGap', () => {
  it('passes through +1 LAP literal', () => {
    expect(formatGap('+1 LAP')).toBe('+1 LAP')
  })

  it('formats ms to +s.SSS', () => {
    expect(formatGap(512)).toBe('+0.512')
  })

  it('returns em dash for null', () => {
    expect(formatGap(null)).toBe('—')
  })

  it('formats larger gaps', () => {
    expect(formatGap(2500)).toBe('+2.500')
  })
})
