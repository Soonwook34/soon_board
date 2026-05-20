import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenF1Client } from './client'
import { ApiError } from './types'
import { RateLimiter } from './rateLimiter'

// A RateLimiter that immediately resolves — uses a static now so fake timers don't freeze it
function noopLimiter() {
  // perSecond/perMinute high enough to never block; static now so fake timer doesn't freeze drain
  return new RateLimiter({ perSecond: 100_000, perMinute: 1_000_000, now: () => 0 })
}

function makeResponse(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
): Response {
  const h = new Headers(headers)
  return new Response(JSON.stringify(body), { status, headers: h })
}

describe('OpenF1Client', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('retries on 429 with exponential backoff and succeeds on 4th attempt', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(429))
      .mockResolvedValueOnce(makeResponse(200, { ok: true }))

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    const resultPromise = client.fetchJson<{ ok: boolean }>('/sessions')

    // Advance through backoffs: 2s, 4s, 8s
    await vi.runAllTimersAsync()
    await vi.runAllTimersAsync()
    await vi.runAllTimersAsync()

    const result = await resultPromise
    expect(result).toEqual({ ok: true })
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('throws ApiError after 5 retries (6 total 429 responses)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeResponse(429))

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    // Attach catch immediately so the rejection is never "unhandled"
    let caught: unknown
    const p = client.fetchJson('/sessions').catch((e) => {
      caught = e
    })

    // Advance all timers through 5 retries
    for (let i = 0; i < 10; i++) {
      await vi.runAllTimersAsync()
    }
    await p

    expect(caught).toBeInstanceOf(ApiError)
    const err = caught as ApiError
    expect(err.status).toBe(429)
    expect(err.endpoint).toBe('sessions')
  })

  it('propagates AbortError immediately without further retry', async () => {
    const controller = new AbortController()
    let fetchCallCount = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      fetchCallCount++
      if (opts?.signal) {
        controller.abort()
      }
      return Promise.resolve(makeResponse(429))
    })

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    // Attach catch immediately so rejection is never unhandled
    let caught: unknown
    const p = client.fetchJson('/sessions', {}, { signal: controller.signal }).catch((e) => {
      caught = e
    })

    await vi.runAllTimersAsync()
    await p

    expect((caught as DOMException).name).toBe('AbortError')
    expect(fetchCallCount).toBe(1)
  })

  it('calls onServerDate exactly once even on multiple successful calls', async () => {
    const onServerDate = vi.fn()
    const dateStr = 'Mon, 19 May 2026 10:00:00 GMT'

    // Return a fresh Response each call — body can only be read once
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(makeResponse(200, { data: 1 }, { Date: dateStr })),
    )

    const client = new OpenF1Client({
      rateLimiter: noopLimiter(),
      onServerDate,
    })

    await client.fetchJson('/sessions')
    await client.fetchJson('/meetings')
    await client.fetchJson('/drivers')

    expect(onServerDate).toHaveBeenCalledTimes(1)
    const [calledDate, calledPerfNow] = onServerDate.mock.calls[0] as [Date, number]
    expect(calledDate).toBeInstanceOf(Date)
    expect(calledDate.getTime()).toBe(new Date(dateStr).getTime())
    expect(typeof calledPerfNow).toBe('number')
  })

  it('honors Retry-After header over computed backoff', async () => {
    let attempt = 0

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      attempt++
      if (attempt === 1) {
        return Promise.resolve(makeResponse(429, {}, { 'Retry-After': '10' }))
      }
      return Promise.resolve(makeResponse(200, {}))
    })

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    const p = client.fetchJson('/sessions')

    // Advance exactly 10s (Retry-After=10) plus buffer
    await vi.advanceTimersByTimeAsync(10_001)

    const result = await p
    expect(result).toEqual({})
    expect(attempt).toBe(2)
  })

  it('treats 404 as empty list (OpenF1 returns 404 on no-results queries)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      makeResponse(404, { detail: 'No results found.' }),
    )
    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    const result = await client.fetchJson('/intervals')
    expect(result).toEqual([])
  })

  it('translates date_gte/date_lte to literal OpenF1 operator keys (date> / date<)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(200, []))

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    await client.fetchJson('/location', {
      session_key: 9523,
      date_gte: '2024-05-26T13:00:00Z',
      date_lte: '2024-05-26T13:10:00Z',
    })

    const calledUrl = fetchSpy.mock.calls[0]![0] as string
    expect(calledUrl).toBe(
      'https://api.openf1.org/v1/location?session_key=9523&date>=2024-05-26T13%3A00%3A00Z&date<=2024-05-26T13%3A10%3A00Z',
    )
    expect(calledUrl).not.toContain('date_gte')
    expect(calledUrl).not.toContain('date_lte')
  })

  it('uses date_start>/date_start< for /laps (laps has no `date` field)', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeResponse(200, []))

    const client = new OpenF1Client({ rateLimiter: noopLimiter() })
    await client.fetchJson('/laps', {
      session_key: 9523,
      date_gte: '2024-05-26T13:00:00Z',
    })

    const calledUrl = fetchSpy.mock.calls[0]![0] as string
    expect(calledUrl).toContain('date_start>=2024-05-26T13%3A00%3A00Z')
    expect(calledUrl).not.toContain('date_gte')
  })
})
