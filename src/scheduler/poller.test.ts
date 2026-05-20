import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Poller } from './poller'
import type { OpenF1Client } from '../api/client'

// Tiny noop RateLimiter — returns immediately so fake timers don't interfere
function makeClient(): { client: OpenF1Client; fetchJson: ReturnType<typeof vi.fn> } {
  const fetchJson = vi.fn().mockImplementation(async () => [])
  const client = { fetchJson } as unknown as OpenF1Client
  return { client, fetchJson }
}

function makeHandlers() {
  return {
    onLocation: vi.fn(),
    onIntervals: vi.fn(),
    onRaceControl: vi.fn(),
    onPosition: vi.fn(),
    onLaps: vi.fn(),
    onPit: vi.fn(),
    onStints: vi.fn(),
    onWeather: vi.fn(),
    onError: vi.fn(),
  }
}

describe('Poller cadence over 5 minutes', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires each endpoint at the correct rate over 300s', async () => {
    const { client, fetchJson } = makeClient()
    const handlers = makeHandlers()

    const poller = new Poller({ client, sessionKey: 9999, handlers })
    poller.start()

    // Advance 5 minutes of fake time
    await vi.advanceTimersByTimeAsync(300_000)

    // Count calls per endpoint by inspecting the path argument
    function countCalls(pathFragment: string): number {
      return fetchJson.mock.calls.filter((args) =>
        (args[0] as string).includes(pathFragment),
      ).length
    }

    const locationCalls = countCalls('/location')
    const intervalsCalls = countCalls('/intervals')
    const raceControlCalls = countCalls('/race_control')
    const positionCalls = countCalls('/position')
    const lapsCalls = countCalls('/laps')
    const pitCalls = countCalls('/pit')
    const stintsCalls = countCalls('/stints')
    const weatherCalls = countCalls('/weather')

    // location: 1 initial + floor(300000/6000)=50 → 51, allow ±1
    expect(locationCalls).toBeGreaterThanOrEqual(50)
    expect(locationCalls).toBeLessThanOrEqual(52)

    // intervals: 1 initial + floor(300000/10000)=30 → 31, allow ±1
    expect(intervalsCalls).toBeGreaterThanOrEqual(30)
    expect(intervalsCalls).toBeLessThanOrEqual(32)

    // race_control: 1 initial + floor(300000/60000)=5 → 6, allow ±1
    expect(raceControlCalls).toBeGreaterThanOrEqual(5)
    expect(raceControlCalls).toBeLessThanOrEqual(7)

    // position: 1 initial + floor(300000/30000)=10 → 11, allow ±1
    expect(positionCalls).toBeGreaterThanOrEqual(10)
    expect(positionCalls).toBeLessThanOrEqual(12)

    // laps: 1 initial + floor(300000/12000)=25 → 26, allow ±1
    expect(lapsCalls).toBeGreaterThanOrEqual(25)
    expect(lapsCalls).toBeLessThanOrEqual(27)

    // pit: 1 initial + floor(300000/90000)=3 → 4, allow ±1
    expect(pitCalls).toBeGreaterThanOrEqual(3)
    expect(pitCalls).toBeLessThanOrEqual(5)

    // stints: same as pit
    expect(stintsCalls).toBeGreaterThanOrEqual(3)
    expect(stintsCalls).toBeLessThanOrEqual(5)

    // weather: 1 initial + floor(300000/120000)=2 → 3, allow ±1
    expect(weatherCalls).toBeGreaterThanOrEqual(2)
    expect(weatherCalls).toBeLessThanOrEqual(4)

    // Total ≈ 51+31+6+11+26+4+4+3 = 136 → ~27 req/min average
    const total = fetchJson.mock.calls.length
    // ~26 req/min × 5 min = 130, allow some for initial fetches and rounding
    expect(total).toBeGreaterThanOrEqual(128)
    expect(total).toBeLessThanOrEqual(140)

    poller.stop()
  })

  it('no 60-second rolling window exceeds 30 calls', async () => {
    const { client, fetchJson } = makeClient()
    const handlers = makeHandlers()

    // Track timestamps of each call
    const callTimestamps: number[] = []
    fetchJson.mockImplementation(async () => {
      callTimestamps.push(Date.now())
      return []
    })

    const poller = new Poller({ client, sessionKey: 9999, handlers })
    poller.start()

    await vi.advanceTimersByTimeAsync(300_000)

    // Check every 60s window
    for (let windowStart = 0; windowStart <= 240_000; windowStart += 1_000) {
      const windowEnd = windowStart + 60_000
      const count = callTimestamps.filter((ts) => ts >= windowStart && ts < windowEnd).length
      expect(count).toBeLessThanOrEqual(30)
    }

    poller.stop()
  })

  it('no 1-second rolling window exceeds 3 calls', async () => {
    const { client, fetchJson } = makeClient()
    const handlers = makeHandlers()

    const callTimestamps: number[] = []
    fetchJson.mockImplementation(async () => {
      callTimestamps.push(Date.now())
      return []
    })

    const poller = new Poller({ client, sessionKey: 9999, handlers })
    poller.start()

    // Only advance 30s to keep the check tractable
    await vi.advanceTimersByTimeAsync(30_000)

    // Check per-second windows
    for (let windowStart = 0; windowStart <= 29_000; windowStart += 100) {
      const windowEnd = windowStart + 1_000
      const count = callTimestamps.filter((ts) => ts >= windowStart && ts < windowEnd).length
      expect(count).toBeLessThanOrEqual(3)
    }

    poller.stop()
  })
})
