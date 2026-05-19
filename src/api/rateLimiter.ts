export interface RateLimiterOptions {
  perSecond: number
  perMinute: number
  now?: () => number
}

const DEFAULTS: Required<RateLimiterOptions> = {
  perSecond: 3,
  perMinute: 30,
  now: () => Date.now(),
}

interface PendingItem {
  resolve: () => void
  reject: (err: unknown) => void
  signal?: AbortSignal
}

export class RateLimiter {
  private readonly perSecond: number
  private readonly perMinute: number
  private readonly now: () => number

  // Sliding window: timestamps of recent acquisitions
  private readonly secondWindow: number[] = []
  private readonly minuteWindow: number[] = []

  private readonly queue: PendingItem[] = []
  // null = no drain scheduled; 'micro' = queued as microtask; number = setTimeout id
  private drainScheduled: 'micro' | ReturnType<typeof setTimeout> | null = null

  constructor(opts?: Partial<RateLimiterOptions>) {
    const merged = { ...DEFAULTS, ...opts }
    this.perSecond = merged.perSecond
    this.perMinute = merged.perMinute
    this.now = merged.now
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    }

    return new Promise<void>((resolve, reject) => {
      const item: PendingItem = { resolve, reject, signal }

      if (signal) {
        const onAbort = () => {
          const idx = this.queue.indexOf(item)
          if (idx !== -1) this.queue.splice(idx, 1)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }

      this.queue.push(item)
      this.scheduleImmediate()
    })
  }

  /** Schedule a drain on the microtask queue (no fake-timer interference). */
  private scheduleImmediate(): void {
    if (this.drainScheduled !== null) return
    this.drainScheduled = 'micro'
    Promise.resolve().then(() => {
      this.drainScheduled = null
      this.drain()
    })
  }

  /** Schedule a drain after a real delay (uses setTimeout, subject to fake timers in tests). */
  private scheduleDelay(ms: number): void {
    if (this.drainScheduled !== null) return
    this.drainScheduled = setTimeout(() => {
      this.drainScheduled = null
      this.drain()
    }, ms)
  }

  private drain(): void {
    const t = this.now()
    this.evict(t)

    while (this.queue.length > 0) {
      if (
        this.secondWindow.length >= this.perSecond ||
        this.minuteWindow.length >= this.perMinute
      ) {
        // Must wait — schedule via setTimeout so fake timers can advance it in tests
        const nextMs = this.nextAvailableMs(t)
        this.scheduleDelay(nextMs)
        return
      }

      const item = this.queue.shift()!
      if (item.signal?.aborted) continue

      const ts = this.now()
      this.secondWindow.push(ts)
      this.minuteWindow.push(ts)
      item.resolve()
    }
  }

  private evict(t: number): void {
    const secondCutoff = t - 1000
    const minuteCutoff = t - 60_000
    while (this.secondWindow.length > 0 && this.secondWindow[0] <= secondCutoff) {
      this.secondWindow.shift()
    }
    while (this.minuteWindow.length > 0 && this.minuteWindow[0] <= minuteCutoff) {
      this.minuteWindow.shift()
    }
  }

  private nextAvailableMs(t: number): number {
    const candidates: number[] = []

    if (this.secondWindow.length >= this.perSecond) {
      // secondWindow[0] + 1000 is when it expires; add 1ms buffer
      candidates.push(this.secondWindow[0] + 1000 - t + 1)
    }
    if (this.minuteWindow.length >= this.perMinute) {
      candidates.push(this.minuteWindow[0] + 60_000 - t + 1)
    }

    return candidates.length > 0 ? Math.max(1, Math.min(...candidates)) : 1
  }
}
