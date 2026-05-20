// Phase 6 wiring:
//   const poller = new Poller({
//     client,
//     sessionKey: currentSession.session_key,
//     handlers: {
//       onLocation: (rows) => useCarsPositionStore.getState().apply(rows, globalClockNow(useTimelineStore.getState())),
//       onIntervals: (rows) => useIntervalsStore.getState().appendBatch(rows),
//       onRaceControl: (rows) => useRaceControlStore.getState().appendBatch(rows),
//       onPosition: (rows) => usePositionStore.getState().appendBatch(rows),
//       onLaps: (rows) => useLapsStore.getState().appendBatch(rows),
//       onPit: (rows) => usePitStore.getState().appendBatch(rows),
//       onStints: (rows) => useStintsStore.getState().appendBatch(rows),
//       onWeather: (rows) => useWeatherStore.getState().appendBatch(rows),
//     }
//   })
//   poller.start()
//
// Scrub-backward sequence (M2):
//   useMasterRaf.isApplying.current = true
//   poller.pause()
//   await poller.refetchWindow(t - 30_000, t)
//   timelineStore.scrubTo(t)
//   poller.resume()
//   useMasterRaf.isApplying.current = false

import type { OpenF1Client } from '../api/client'
import type {
  EndpointName,
  LocationRow,
  Interval,
  RaceControl,
  RacePosition,
  Lap,
  PitStop,
  Stint,
  Weather,
} from '../api/types'

export interface PollerHandlers {
  onLocation: (rows: LocationRow[]) => void
  onIntervals: (rows: Interval[]) => void
  onRaceControl: (rows: RaceControl[]) => void
  onPosition: (rows: RacePosition[]) => void
  onLaps: (rows: Lap[]) => void
  onPit: (rows: PitStop[]) => void
  onStints: (rows: Stint[]) => void
  onWeather: (rows: Weather[]) => void
  onError?: (endpoint: EndpointName, err: unknown) => void
}

export interface PollerOptions {
  client: OpenF1Client
  sessionKey: number
  handlers: PollerHandlers
  /** Optional override of intervals for tests */
  intervalsMs?: Partial<Record<EndpointName, number>>
  /** Current playback time in ms. When set, time-filterable periodic fetches
   *  use a sliding window [until() - 2*interval, until()] instead of
   *  unbounded "latest" queries — this clips future rows in playback and is
   *  a no-op in live mode (until() === Date.now()). */
  until?: () => number
}

// Cadence aligned with old_project for the 30 req/min OpenF1 anonymous cap.
// Sum ≈ 25.84 req/min leaves ~14% headroom for bootstrap bursts and 429
// retries. Bumping any endpoint here without lowering another risks a 429.
// race_control / pit / stints / weather are sparse → polling them more often
// only inflates the 404 noise without delivering fresher data.
const DEFAULT_INTERVALS_MS: Record<PollerEndpoint, number> = {
  location: 6_000, // 10/min — marker smoothness floor with 20s render buffer
  intervals: 10_000, // 6/min — leaderboard gaps + positions
  race_control: 60_000, // 1/min — messages are sparse
  position: 30_000, // 2/min — official position changes
  laps: 12_000, // 5/min — last-lap + sector times during race
  pit: 90_000, // 0.67/min — pit stops
  stints: 90_000, // 0.67/min — tyre age recompute
  weather: 120_000, // 0.5/min
}

// Endpoints managed by the poller (subset of EndpointName)
type PollerEndpoint =
  | 'location'
  | 'intervals'
  | 'race_control'
  | 'position'
  | 'laps'
  | 'pit'
  | 'stints'
  | 'weather'

// Endpoint priority order (ascending) — used by refetchWindow to sort handler calls
const ENDPOINT_PRIORITY: PollerEndpoint[] = [
  'location',
  'intervals',
  'race_control',
  'position',
  'laps',
  'pit',
  'stints',
  'weather',
]

// Endpoints that support time-range filtering
const TIME_FILTERABLE = new Set<PollerEndpoint>(['location', 'intervals', 'laps', 'race_control'])

export class Poller {
  private readonly client: OpenF1Client
  private readonly sessionKey: number
  private readonly handlers: PollerHandlers
  private readonly intervalsMs: Record<PollerEndpoint, number>
  private readonly until?: () => number

  private timers: Map<PollerEndpoint, ReturnType<typeof setInterval>> = new Map()
  private abortControllers: Map<PollerEndpoint, AbortController> = new Map()
  private _isRunning = false
  private _isPaused = false

  constructor(opts: PollerOptions) {
    this.client = opts.client
    this.sessionKey = opts.sessionKey
    this.handlers = opts.handlers
    this.until = opts.until

    // Merge defaults with any test overrides
    this.intervalsMs = { ...DEFAULT_INTERVALS_MS }
    if (opts.intervalsMs) {
      for (const [ep, ms] of Object.entries(opts.intervalsMs)) {
        if (ep in this.intervalsMs) {
          (this.intervalsMs as Record<string, number>)[ep] = ms!
        }
      }
    }
  }

  start(): void {
    if (this._isRunning) return
    this._isRunning = true
    this._isPaused = false
    this._scheduleAll()
  }

  stop(): void {
    this._isRunning = false
    this._isPaused = false
    this._clearAll()
  }

  pause(): void {
    if (!this._isRunning || this._isPaused) return
    this._isPaused = true
    // Abort in-flight fetches and clear timers but keep _isRunning = true
    this._clearAll()
  }

  resume(): void {
    if (!this._isRunning || !this._isPaused) return
    this._isPaused = false
    // Re-anchor all timers from now
    this._scheduleAll()
  }

  isRunning(): boolean {
    return this._isRunning
  }

  // Fetch a time window across all endpoints that support date filtering,
  // plus a single fetch for non-filterable endpoints.
  // Calls handlers in ascending endpoint priority order after all fetches settle.
  async refetchWindow(sessionMsStart: number, sessionMsEnd: number): Promise<void> {
    const dateGte = new Date(sessionMsStart).toISOString()
    const dateLte = new Date(sessionMsEnd).toISOString()

    // Collect results keyed by endpoint in priority order
    const results: Array<{ endpoint: PollerEndpoint; rows: unknown[] }> = []

    await Promise.all(
      ENDPOINT_PRIORITY.map(async (ep) => {
        const rows = await this._fetchEndpoint(ep, { dateGte, dateLte })
        results.push({ endpoint: ep, rows })
      }),
    )

    // Sort by endpoint priority order then call handlers
    results.sort(
      (a, b) => ENDPOINT_PRIORITY.indexOf(a.endpoint) - ENDPOINT_PRIORITY.indexOf(b.endpoint),
    )

    for (const { endpoint, rows } of results) {
      this._callHandler(endpoint, rows)
    }
  }

  private _scheduleAll(): void {
    for (const ep of ENDPOINT_PRIORITY) {
      const controller = new AbortController()
      this.abortControllers.set(ep, controller)

      // Fire immediately
      this._fetchAndDeliver(ep, controller.signal)

      // Then on the interval
      const ms = this.intervalsMs[ep]
      const timer = setInterval(() => {
        // Only fetch if not paused/stopped
        if (!this._isRunning || this._isPaused) return
        const ac = this.abortControllers.get(ep)
        if (ac) {
          this._fetchAndDeliver(ep, ac.signal)
        }
      }, ms)
      this.timers.set(ep, timer)
    }
  }

  private _clearAll(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer)
    }
    this.timers.clear()

    for (const controller of this.abortControllers.values()) {
      controller.abort()
    }
    this.abortControllers.clear()
  }

  private async _fetchAndDeliver(ep: PollerEndpoint, signal: AbortSignal): Promise<void> {
    try {
      const rows = await this._fetchEndpoint(ep, { signal })
      if (signal.aborted) return
      this._callHandler(ep, rows)
    } catch (err) {
      // Swallow AbortErrors silently; report other errors via onError
      if (err instanceof DOMException && err.name === 'AbortError') return
      this.handlers.onError?.(ep, err)
    }
  }

  private async _fetchEndpoint(
    ep: PollerEndpoint,
    opts: { signal?: AbortSignal; dateGte?: string; dateLte?: string },
  ): Promise<unknown[]> {
    const { signal, dateGte, dateLte } = opts
    const base: Record<string, string | number> = { session_key: this.sessionKey }

    if (TIME_FILTERABLE.has(ep)) {
      if (dateGte !== undefined || dateLte !== undefined) {
        // Explicit window (refetchWindow path) takes precedence
        if (dateGte !== undefined) base['date_gte'] = dateGte
        if (dateLte !== undefined) base['date_lte'] = dateLte
      } else if (this.until) {
        // Periodic poll in playback or live: only fetch the slice between the
        // last interval-worth of time and the playback head. Lookback = 2×
        // interval to absorb mild timing drift / dropped polls.
        const untilMs = this.until()
        const lookbackMs = this.intervalsMs[ep] * 2
        base['date_gte'] = new Date(untilMs - lookbackMs).toISOString()
        base['date_lte'] = new Date(untilMs).toISOString()
      }
    }

    const fetchOpts = signal ? { signal } : undefined
    return this.client.fetchJson<unknown[]>(`/${ep}`, base, fetchOpts)
  }

  private _callHandler(ep: PollerEndpoint, rows: unknown[]): void {
    switch (ep) {
      case 'location':
        this.handlers.onLocation(rows as LocationRow[])
        break
      case 'intervals':
        this.handlers.onIntervals(rows as Interval[])
        break
      case 'race_control':
        this.handlers.onRaceControl(rows as RaceControl[])
        break
      case 'position':
        this.handlers.onPosition(rows as RacePosition[])
        break
      case 'laps':
        this.handlers.onLaps(rows as Lap[])
        break
      case 'pit':
        this.handlers.onPit(rows as PitStop[])
        break
      case 'stints':
        this.handlers.onStints(rows as Stint[])
        break
      case 'weather':
        this.handlers.onWeather(rows as Weather[])
        break
    }
  }
}
