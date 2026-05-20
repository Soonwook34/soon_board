import { create } from 'zustand'
import { parseOpenF1DateMs } from '../utils/sessionStatus'
import type { LocationRow } from '../api/types'

// Hot store for live car positions. apply() rescales each incoming batch so
// the latest sub-sample lands at the caller-supplied `nowMs` and older
// sub-samples are placed at `nowMs - (latestServer - serverT)`. Consecutive
// polls compose into a contiguous timeline regardless of poll jitter, and the
// renderer's `target = nowMs - RENDER_BUFFER_MS` always lands inside the
// buffered bracket instead of in the extrapolation tail.

export interface CarSample {
  t: number
  // Server timestamp the sub-sample was emitted at. Dedup key across
  // overlapping poll windows — `t` alone is unstable because polling jitter
  // perturbs the per-batch anchor, which would otherwise re-insert the same
  // server sample at a shifted client time and create the "marker drifts
  // back-and-forth" stutter.
  tServer: number
  x: number
  y: number
}

export interface CarPosition {
  driver_number: number
  samples: CarSample[]
  heading: number
  lastUpdate: number
}

interface CarsPositionState {
  byNumber: Map<number, CarPosition>
}

interface CarsPositionActions {
  apply(rows: LocationRow[], nowMs: number): void
  getActive(nowMs: number, windowMs?: number): CarPosition[]
  isActive(driverNumber: number, nowMs: number, windowMs?: number): boolean
  reset(): void
}

export const CARS_ACTIVE_WINDOW_MS = 30_000
export const SAMPLE_RETENTION_MS = 30_000

function headingFromVec(dx: number, dy: number, fallback: number): number {
  if (dx === 0 && dy === 0) return fallback
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360
}

export const useCarsPositionStore = create<CarsPositionState & CarsPositionActions>(
  (set, get) => ({
    byNumber: new Map(),

    apply(rows, nowMs) {
      if (rows.length === 0) return

      // Group incoming rows per driver_number and tag each with its parsed
      // server timestamp. Rows with unparseable dates are dropped.
      const byDriver = new Map<number, { x: number; y: number; tServer: number }[]>()
      for (const r of rows) {
        const tServer = parseOpenF1DateMs(r.date)
        if (!Number.isFinite(tServer)) continue
        const arr = byDriver.get(r.driver_number)
        const entry = { x: r.x, y: r.y, tServer }
        if (arr) arr.push(entry)
        else byDriver.set(r.driver_number, [entry])
      }
      if (byDriver.size === 0) return

      const next = new Map(get().byNumber)
      for (const [driver_number, arr] of byDriver) {
        arr.sort((a, b) => a.tServer - b.tServer)
        const latestServer = arr[arr.length - 1].tServer
        const incoming: CarSample[] = arr.map((s) => ({
          x: s.x,
          y: s.y,
          tServer: s.tServer,
          t: nowMs - (latestServer - s.tServer),
        }))

        const existing = next.get(driver_number)
        const seenServer = new Set<number>()
        const merged: CarSample[] = []
        if (existing) {
          for (const s of existing.samples) {
            if (!seenServer.has(s.tServer)) {
              merged.push(s)
              seenServer.add(s.tServer)
            }
          }
        }
        for (const s of incoming) {
          if (!seenServer.has(s.tServer)) {
            merged.push(s)
            seenServer.add(s.tServer)
          }
        }
        merged.sort((a, b) => a.t - b.t)

        const cutoff = nowMs - SAMPLE_RETENTION_MS
        let firstKeep = 0
        while (firstKeep < merged.length - 1 && merged[firstKeep].t < cutoff) firstKeep++
        const trimmed = firstKeep > 0 ? merged.slice(firstKeep) : merged

        const latest = trimmed[trimmed.length - 1]
        const second = trimmed.length >= 2 ? trimmed[trimmed.length - 2] : latest
        const heading = headingFromVec(
          latest.x - second.x,
          latest.y - second.y,
          existing?.heading ?? 0,
        )

        next.set(driver_number, {
          driver_number,
          samples: trimmed,
          heading,
          lastUpdate: nowMs,
        })
      }
      set({ byNumber: next })
    },

    getActive(nowMs, windowMs = CARS_ACTIVE_WINDOW_MS) {
      const out: CarPosition[] = []
      for (const car of get().byNumber.values()) {
        if (nowMs - car.lastUpdate <= windowMs) out.push(car)
      }
      return out
    },

    isActive(driverNumber, nowMs, windowMs = CARS_ACTIVE_WINDOW_MS) {
      const car = get().byNumber.get(driverNumber)
      if (!car) return false
      return nowMs - car.lastUpdate <= windowMs
    },

    reset() {
      set({ byNumber: new Map() })
    },
  }),
)
