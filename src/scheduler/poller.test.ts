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

    // intervals: same as location
    expect(intervalsCalls).toBeGreaterThanOrEqual(50)
    expect(intervalsCalls).toBeLessThanOrEqual(52)

    // race_control: 1 initial + floor(300000/10000)=30 → 31, allow ±1
    expect(raceControlCalls).toBeGreaterThanOrEqual(30)
    expect(raceControlCalls).toBeLessThanOrEqual(32)

    // position: 1 initial + floor(300000/30000)=10 → 11, allow ±1
    expect(positionCalls).toBeGreaterThanOrEqual(10)
    expect(positionCalls).toBeLessThanOrEqual(12)

    // laps: 1 initial + floor(300000/60000)=5 → 6, allow ±1
    expect(lapsCalls).toBeGreaterThanOrEqual(5)
    expect(lapsCalls).toBeLessThanOrEqual(7)

    // pit: 1 initial + floor(300000/180000)=1 → 2, allow ±1
    expect(pitCalls).toBeGreaterThanOrEqual(2)
    expect(pitCalls).toBeLessThanOrEqual(3)

    // stints: same as pit
    expect(stintsCalls).toBeGreaterThanOrEqual(2)
    expect(stintsCalls).toBeLessThanOrEqual(3)

    // weather: same as pit
    expect(weatherCalls).toBeGreaterThanOrEqual(2)
    expect(weatherCalls).toBeLessThanOrEqual(3)

    // Total ≈ 51+51+31+11+6+2+2+2 = 156 ≈ 30 req/min average
    const total = fetchJson.mock.calls.length
    // 30 req/min × 5 min = 150, allow some for initial fetches
    expect(total).toBeGreaterThanOrEqual(150)
    expect(total).toBeLessThanOrEqual(165)

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
