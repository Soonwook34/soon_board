import { create } from 'zustand'
import type { LocationRow, Lap, Stint, PitStop } from '../api/types'
import { parseOpenF1DateMs } from '../utils/sessionStatus'

export const MAX_BUFFERED_SESSIONS = 1

const MAX_RING = 200

// Raw per-driver buffer. Leaderboard derives its values from this at read
// time, clipping to the current leader lap so scrubbing playback backward
// hides future pit stops / stints / lap times.
export interface DriverBuffer {
  samples: { t: number; x: number; y: number }[]
  laps: Lap[]
  stints: Stint[]
  pitStops: PitStop[]
}

interface TelemetryState {
  byDriver: Map<number, DriverBuffer>
}

interface TelemetryActions {
  appendLocationBatch(rows: LocationRow[]): void
  appendLap(lap: Lap): void
  appendStint(stint: Stint): void
  appendPit(pit: PitStop): void
  flush(): void
}

function emptyBuffer(): DriverBuffer {
  return { samples: [], laps: [], stints: [], pitStops: [] }
}

function upsertBy<T>(arr: T[], item: T, key: (t: T) => number, sortAsc = true): void {
  const k = key(item)
  const idx = arr.findIndex((x) => key(x) === k)
  if (idx >= 0) arr[idx] = item
  else arr.push(item)
  if (sortAsc) arr.sort((a, b) => key(a) - key(b))
}

export const useTelemetryStore = create<TelemetryState & TelemetryActions>((set, get) => ({
  byDriver: new Map(),

  appendLocationBatch(rows: LocationRow[]): void {
    if (rows.length === 0) return
    const map = new Map(get().byDriver)
    for (const row of rows) {
      const t = parseOpenF1DateMs(row.date)
      if (!map.has(row.driver_number)) map.set(row.driver_number, emptyBuffer())
      const buf = map.get(row.driver_number)!
      if (buf.samples.some((s) => s.t === t)) continue
      buf.samples.push({ t, x: row.x, y: row.y })
      if (buf.samples.length > MAX_RING) buf.samples.shift()
    }
    set({ byDriver: map })
  },

  appendLap(lap: Lap): void {
    const map = new Map(get().byDriver)
    if (!map.has(lap.driver_number)) map.set(lap.driver_number, emptyBuffer())
    upsertBy(map.get(lap.driver_number)!.laps, lap, (l) => l.lap_number)
    set({ byDriver: map })
  },

  appendStint(stint: Stint): void {
    const map = new Map(get().byDriver)
    if (!map.has(stint.driver_number)) map.set(stint.driver_number, emptyBuffer())
    upsertBy(map.get(stint.driver_number)!.stints, stint, (s) => s.stint_number)
    set({ byDriver: map })
  },

  appendPit(pit: PitStop): void {
    const map = new Map(get().byDriver)
    if (!map.has(pit.driver_number)) map.set(pit.driver_number, emptyBuffer())
    upsertBy(map.get(pit.driver_number)!.pitStops, pit, (p) => p.lap_number)
    set({ byDriver: map })
  },

  flush(): void {
    set({ byDriver: new Map() })
  },
}))
