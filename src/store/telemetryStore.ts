import { create } from 'zustand'
import type { Lap, Stint, PitStop } from '../api/types'

export const MAX_BUFFERED_SESSIONS = 1

// Raw per-driver buffer for lap-keyed data. Live positions live in
// carsPositionStore — keeping them out of this store prevents the
// leaderboard recompute path from sharing change-detection with the hot
// 60fps location feed.
export interface DriverBuffer {
  laps: Lap[]
  stints: Stint[]
  pitStops: PitStop[]
}

interface TelemetryState {
  byDriver: Map<number, DriverBuffer>
}

interface TelemetryActions {
  appendLap(lap: Lap): void
  appendStint(stint: Stint): void
  appendPit(pit: PitStop): void
  flush(): void
}

function emptyBuffer(): DriverBuffer {
  return { laps: [], stints: [], pitStops: [] }
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
