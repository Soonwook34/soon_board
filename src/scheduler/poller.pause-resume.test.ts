import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Poller } from './poller'
import type { OpenF1Client } from '../api/client'

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

describe('Poller pause/resume', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pause stops fetches; resume restarts them at LOCKED cadence', async () => {
    const fetchJson = vi.fn().mockImplementation(async () => [])
    const client = { fetchJson } as unknown as OpenF1Client
    const handlers = makeHandlers()

    const poller = new Poller({ client, sessionKey: 9999, handlers })
    poller.start()

    // Let first round land (immediate fetches fire at t=0)
    await vi.advanceTimersByTimeAsync(6_000)
    const countAfterFirstRound = fetchJson.mock.calls.length
    expect(countAfterFirstRound).toBeGreaterThan(0)

    // Pause and confirm no further fetches in 60s
    poller.pause()
    const countAtPause = fetchJson.mock.calls.length

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchJson.mock.calls.length).toBe(countAtPause)

    // Resume and confirm fetches restart
    poller.resume()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fetchJson.mock.calls.length).toBeGreaterThan(countAtPause)

    poller.stop()
  })

  it('pause aborts in-flight fetch via AbortSignal', async () => {
    let resolveHeld: (() => void) | undefined
    let capturedSignal: AbortSignal | null = null

    const fetchJson = vi.fn().mockImplementation(
      (_p: string, _params: unknown, opts?: { signal?: AbortSignal }) => {
        capturedSignal = opts?.signal ?? null
        // Return a promise that won't resolve until we release it
        return new Promise<unknown[]>((resolve, reject) => {
          resolveHeld = () => resolve([])
          if (opts?.signal) {
            opts.signal.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'))
            })
          }
        })
      },
    )

    const client = { fetchJson } as unknown as OpenF1Client
    const handlers = makeHandlers()
    const onError = vi.fn()
    handlers.onError = onError

    const poller = new Poller({ client, sessionKey: 9999, handlers })
    poller.start()

    // Let the immediate fetch calls fire (they're in-flight, unresolved)
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedSignal).not.toBeNull()
    expect(capturedSignal!.aborted).toBe(false)

    // Pause — should abort the in-flight signals
    poller.pause()

    // AbortSignal should be aborted now
    expect(capturedSignal!.aborted).toBe(true)

    // Release the held promise (it will reject via abort listener)
    resolveHeld && resolveHeld()

    // Flush — onError should NOT be called (AbortError is silently swallowed)
    await Promise.resolve()
    await Promise.resolve()
    expect(onError).not.toHaveBeenCalled()

    poller.stop()
  })

  it('refetchWindow calls handlers in ascending endpoint priority order', async () => {
    const callOrder: string[] = []

    const fetchJson = vi.fn().mockImplementation(async () => [])
    const client = { fetchJson } as unknown as OpenF1Client

    const handlers = {
      onLocation: vi.fn().mockImplementation(() => callOrder.push('location')),
      onIntervals: vi.fn().mockImplementation(() => callOrder.push('intervals')),
      onRaceControl: vi.fn().mockImplementation(() => callOrder.push('race_control')),
      onPosition: vi.fn().mockImplementation(() => callOrder.push('position')),
      onLaps: vi.fn().mockImplementation(() => callOrder.push('laps')),
      onPit: vi.fn().mockImplementation(() => callOrder.push('pit')),
      onStints: vi.fn().mockImplementation(() => callOrder.push('stints')),
      onWeather: vi.fn().mockImplementation(() => callOrder.push('weather')),
      onError: vi.fn(),
    }

    const poller = new Poller({ client, sessionKey: 9999, handlers })

    // Don't start — just call refetchWindow directly
    const t1 = Date.now()
    await poller.refetchWindow(t1 - 30_000, t1)

    // All 8 endpoints should have been called
    expect(callOrder).toHaveLength(8)

    // Verify ascending priority order
    const expectedOrder = [
      'location',
      'intervals',
      'race_control',
      'position',
      'laps',
      'pit',
      'stints',
      'weather',
    ]
    expect(callOrder).toEqual(expectedOrder)
  })
})
