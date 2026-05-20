import { create } from 'zustand'
import type { LocationRow, Lap, Stint, PitStop } from '../api/types'
import { parseOpenF1DateMs } from '../utils/sessionStatus'

export const MAX_BUFFERED_SESSIONS = 1

const MAX_RING = 200
const MAX_SPARKLINE = 10

export interface DriverBuffer {
  samples: { t: number; x: number; y: number }[]
  lastLap: number
  sparklineLaps: number[]
  tireCompound: Stint['compound']
  tireAgeLaps: number
  pitStops: number
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
  return {
    samples: [],
    lastLap: 0,
    sparklineLaps: [],
    tireCompound: 'UNKNOWN',
    tireAgeLaps: 0,
    pitStops: 0,
  }
}

export const useTelemetryStore = create<TelemetryState & TelemetryActions>((set, get) => ({
  byDriver: new Map(),

  appendLocationBatch(rows: LocationRow[]): void {
    const map = new Map(get().byDriver)
    for (const row of rows) {
      const t = parseOpenF1DateMs(row.date)
      if (!map.has(row.driver_number)) {
        map.set(row.driver_number, emptyBuffer())
      }
      const buf = map.get(row.driver_number)!
      // Dedupe by (driver, t)
      const alreadyExists = buf.samples.some((s) => s.t === t)
      if (alreadyExists) continue
      buf.samples.push({ t, x: row.x, y: row.y })
      if (buf.samples.length > MAX_RING) {
        buf.samples.shift()
      }
    }
    set({ byDriver: map })
  },

  appendLap(lap: Lap): void {
    const map = new Map(get().byDriver)
    if (!map.has(lap.driver_number)) {
      map.set(lap.driver_number, emptyBuffer())
    }
    const buf = map.get(lap.driver_number)!
    buf.lastLap = lap.lap_number
    if (lap.lap_duration !== null) {
      buf.sparklineLaps.push(lap.lap_duration * 1000)
      if (buf.sparklineLaps.length > MAX_SPARKLINE) {
        buf.sparklineLaps.shift()
      }
      buf.tireAgeLaps += 1
    }
    set({ byDriver: map })
  },

  appendStint(stint: Stint): void {
    const map = new Map(get().byDriver)
    if (!map.has(stint.driver_number)) {
      map.set(stint.driver_number, emptyBuffer())
    }
    const buf = map.get(stint.driver_number)!
    buf.tireCompound = stint.compound
    buf.tireAgeLaps = 0
    set({ byDriver: map })
  },

  appendPit(pit: PitStop): void {
    const map = new Map(get().byDriver)
    if (!map.has(pit.driver_number)) {
      map.set(pit.driver_number, emptyBuffer())
    }
    const buf = map.get(pit.driver_number)!
    buf.pitStops += 1
    set({ byDriver: map })
  },

  flush(): void {
    set({ byDriver: new Map() })
  },
}))
