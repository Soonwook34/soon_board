import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from './rateLimiter'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows perSecond tokens immediately then queues the rest', async () => {
    let fakeNow = 0
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 100, now: () => fakeNow })

    const results: number[] = []
    const promises = Array.from({ length: 6 }, (_, i) =>
      limiter.acquire().then(() => results.push(i)),
    )

    // Flush microtask queue — initial drain fires, grants first 3 tokens
    await Promise.resolve()
    await Promise.resolve()
    expect(results.length).toBe(3)

    // Advance fake time by 1001ms so 1-second window entries expire
    fakeNow += 1001
    // Advance the timer by 1001ms (the scheduled drain delay)
    await vi.advanceTimersByTimeAsync(1001)
    // Flush microtasks for the resolved promises
    await Promise.resolve()
    await Promise.resolve()

    expect(results.length).toBe(6)
    await Promise.all(promises)
  })

  it('50 concurrent acquires all resolve within ~17s at 3/s', async () => {
    let fakeNow = 0
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 100, now: () => fakeNow })

    const resolved: number[] = []
    const promises = Array.from({ length: 50 }, (_, i) =>
      limiter.acquire().then(() => resolved.push(i)),
    )

    // Flush initial microtask drain — first 3 tokens
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved.length).toBe(3)

    // Advance 1s at a time; each tick: advance fakeNow, advance timer, flush
    let ticks = 0
    while (resolved.length < 50 && ticks < 20) {
      fakeNow += 1001
      ticks++
      await vi.advanceTimersByTimeAsync(1001)
      await Promise.resolve()
      await Promise.resolve()
    }

    expect(resolved.length).toBe(50)
    // ceil(50/3) = 17 — should complete within 17 ticks
    expect(ticks).toBeLessThanOrEqual(17)
    await Promise.all(promises)
  })

  it('enforces perMinute ceiling: 31st acquire waits until oldest expires', async () => {
    let fakeNow = 0
    // perSecond is high so only perMinute=30 is the binding constraint
    const limiter = new RateLimiter({ perSecond: 100, perMinute: 30, now: () => fakeNow })

    const resolved: boolean[] = []

    // Acquire 30 tokens — perSecond=100 lets them all drain in one microtask pass
    const first30 = Array.from({ length: 30 }, () =>
      limiter.acquire().then(() => resolved.push(true)),
    )
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved.length).toBe(30)

    // 31st must wait (minute window full at t=0)
    let thirtyFirst = false
    const p31 = limiter.acquire().then(() => {
      thirtyFirst = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(thirtyFirst).toBe(false)

    // Advance 60001ms — minute window entries at t=0 expire
    fakeNow += 60_001
    await vi.advanceTimersByTimeAsync(60_001)
    await Promise.resolve()
    await Promise.resolve()

    expect(thirtyFirst).toBe(true)
    await Promise.all([...first30, p31])
  })

  it('AbortError surfaces when signal is aborted before acquire', async () => {
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 30, now: () => 0 })

    const controller = new AbortController()
    controller.abort()

    await expect(limiter.acquire(controller.signal)).rejects.toThrow('Aborted')
  })

  it('AbortError surfaces when signal is aborted while queued', async () => {
    let fakeNow = 0
    const limiter = new RateLimiter({ perSecond: 3, perMinute: 100, now: () => fakeNow })

    // Consume all 3 perSecond tokens
    const first3 = Array.from({ length: 3 }, () => limiter.acquire())
    await Promise.resolve()
    await Promise.resolve()
    await Promise.all(first3)

    const controller = new AbortController()

    let caught: unknown
    const pending = limiter.acquire(controller.signal).catch((e) => {
      caught = e
    })

    // Abort while queued (timer hasn't fired yet — fakeNow still 0)
    controller.abort()
    await Promise.resolve()
    await Promise.resolve()

    await pending
    expect((caught as DOMException).name).toBe('AbortError')

    // Cleanup: advance time so drain timer doesn't linger
    fakeNow += 1001
    await vi.advanceTimersByTimeAsync(1001)
  })
})
