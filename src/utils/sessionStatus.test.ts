import { describe, it, expect } from 'vitest'
import {
  parseOpenF1DateMs,
  toOpenF1Iso,
  getSessionStatus,
  getMeetingStatus,
} from './sessionStatus'

describe('parseOpenF1DateMs', () => {
  it('treats no-tz datetime as UTC (matches Z-suffixed parse)', () => {
    expect(parseOpenF1DateMs('2024-05-23T13:00:00')).toBe(
      Date.parse('2024-05-23T13:00:00Z'),
    )
  })

  it('passes through Z-suffixed datetimes', () => {
    expect(parseOpenF1DateMs('2024-05-23T13:00:00Z')).toBe(
      Date.parse('2024-05-23T13:00:00Z'),
    )
  })

  it('preserves explicit offset', () => {
    expect(parseOpenF1DateMs('2024-05-23T13:00:00+02:00')).toBe(
      Date.parse('2024-05-23T11:00:00Z'),
    )
  })
})

describe('toOpenF1Iso', () => {
  it('appends Z when no tz present', () => {
    expect(toOpenF1Iso('2024-05-23T13:00:00')).toBe('2024-05-23T13:00:00Z')
  })

  it('leaves Z-suffixed strings unchanged', () => {
    expect(toOpenF1Iso('2024-05-23T13:00:00Z')).toBe('2024-05-23T13:00:00Z')
  })

  it('leaves offset-suffixed strings unchanged', () => {
    expect(toOpenF1Iso('2024-05-23T13:00:00+02:00')).toBe('2024-05-23T13:00:00+02:00')
  })
})

describe('getSessionStatus', () => {
  const start = '2024-05-23T13:00:00'
  const end = '2024-05-23T15:00:00'

  it('past when now is after end + buffer', () => {
    expect(getSessionStatus(start, end, Date.parse('2024-05-23T15:10:00Z'))).toBe('past')
  })

  it('live during the session', () => {
    expect(getSessionStatus(start, end, Date.parse('2024-05-23T14:00:00Z'))).toBe('live')
  })

  it('upcoming when now is before start - buffer', () => {
    expect(getSessionStatus(start, end, Date.parse('2024-05-23T12:00:00Z'))).toBe('upcoming')
  })
})

describe('getMeetingStatus', () => {
  it('upcoming before date_start', () => {
    expect(getMeetingStatus('2024-05-23T00:00:00', Date.parse('2024-05-22T00:00:00Z'))).toBe(
      'upcoming',
    )
  })

  it('live within the weekend window', () => {
    expect(getMeetingStatus('2024-05-23T00:00:00', Date.parse('2024-05-25T00:00:00Z'))).toBe(
      'live',
    )
  })

  it('past after the weekend window', () => {
    expect(getMeetingStatus('2024-05-23T00:00:00', Date.parse('2024-06-01T00:00:00Z'))).toBe(
      'past',
    )
  })
})
