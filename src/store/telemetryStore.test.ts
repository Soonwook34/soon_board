import { describe, it, expect, beforeEach } from 'vitest'
import { useTelemetryStore } from './telemetryStore'
import type { LocationRow, Lap, Stint, PitStop } from '../api/types'

beforeEach(() => {
  useTelemetryStore.getState().flush()
})

function makeRow(driver_number: number, dateIso: string, x = 0, y = 0): LocationRow {
  return { session_key: 1, driver_number, date: dateIso, x, y, z: 0 }
}

function makeLap(driver_number: number, lap_number: number, lap_duration: number | null): Lap {
  return {
    session_key: 1,
    driver_number,
    lap_number,
    date_start: '2024-09-01T12:00:00.000Z',
    lap_duration,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    is_pit_out_lap: false,
  }
}

describe('ring buffer eviction', () => {
  it('evicts oldest sample when 201st is inserted', () => {
    const rows: LocationRow[] = []
    for (let i = 0; i < 201; i++) {
      rows.push(makeRow(1, `2024-09-01T12:00:${String(i).padStart(2, '0')}.000Z`, i, i))
    }
    useTelemetryStore.getState().appendLocationBatch(rows)
    const buf = useTelemetryStore.getState().byDriver.get(1)!
    expect(buf.samples.length).toBe(200)
    expect(buf.samples[0].x).toBe(1)
    expect(buf.samples[199].x).toBe(200)
  })
})

describe('appendLocationBatch deduplication', () => {
  it('dedupes by (driver, t)', () => {
    const row = makeRow(1, '2024-09-01T12:00:00.000Z', 10, 20)
    useTelemetryStore.getState().appendLocationBatch([row])
    useTelemetryStore.getState().appendLocationBatch([row])
    const buf = useTelemetryStore.getState().byDriver.get(1)!
    expect(buf.samples.length).toBe(1)
  })

  it('does not dedupe rows with different timestamps', () => {
    useTelemetryStore.getState().appendLocationBatch([
      makeRow(1, '2024-09-01T12:00:00.000Z', 1, 1),
      makeRow(1, '2024-09-01T12:00:01.000Z', 2, 2),
    ])
    const buf = useTelemetryStore.getState().byDriver.get(1)!
    expect(buf.samples.length).toBe(2)
  })
})

describe('appendLap (raw buffer)', () => {
  it('stores laps sorted by lap_number', () => {
    useTelemetryStore.getState().appendLap(makeLap(5, 3, 90.5))
    useTelemetryStore.getState().appendLap(makeLap(5, 1, 88.0))
    useTelemetryStore.getState().appendLap(makeLap(5, 2, 89.2))
    const buf = useTelemetryStore.getState().byDriver.get(5)!
    expect(buf.laps.map((l) => l.lap_number)).toEqual([1, 2, 3])
  })

  it('upserts on duplicate lap_number (latest row wins)', () => {
    useTelemetryStore.getState().appendLap(makeLap(5, 1, 90.0))
    useTelemetryStore.getState().appendLap(makeLap(5, 1, 88.5))
    const buf = useTelemetryStore.getState().byDriver.get(5)!
    expect(buf.laps).toHaveLength(1)
    expect(buf.laps[0].lap_duration).toBe(88.5)
  })
})

describe('appendStint (raw buffer)', () => {
  it('stores stints sorted by stint_number, upserts on duplicates', () => {
    const stint1: Stint = {
      session_key: 1,
      driver_number: 1,
      stint_number: 2,
      lap_start: 5,
      lap_end: 10,
      compound: 'HARD',
      tyre_age_at_start: 0,
    }
    const stint1Updated: Stint = { ...stint1, lap_end: 15 }
    useTelemetryStore.getState().appendStint(stint1)
    useTelemetryStore.getState().appendStint(stint1Updated)
    const buf = useTelemetryStore.getState().byDriver.get(1)!
    expect(buf.stints).toHaveLength(1)
    expect(buf.stints[0].lap_end).toBe(15)
  })
})

describe('appendPit (raw buffer)', () => {
  it('upserts by lap_number — duplicate calls do not inflate count', () => {
    const pit: PitStop = {
      session_key: 1,
      driver_number: 44,
      lap_number: 18,
      date: '2024-09-01T12:00:00.000Z',
      pit_duration: 21.5,
    }
    useTelemetryStore.getState().appendPit(pit)
    useTelemetryStore.getState().appendPit(pit)
    const buf = useTelemetryStore.getState().byDriver.get(44)!
    expect(buf.pitStops).toHaveLength(1)
  })

  it('stores multiple distinct pit stops sorted by lap_number', () => {
    useTelemetryStore.getState().appendPit({
      session_key: 1,
      driver_number: 44,
      lap_number: 35,
      date: '2024-09-01T13:30:00.000Z',
      pit_duration: 22.1,
    })
    useTelemetryStore.getState().appendPit({
      session_key: 1,
      driver_number: 44,
      lap_number: 20,
      date: '2024-09-01T13:00:00.000Z',
      pit_duration: 25.4,
    })
    const buf = useTelemetryStore.getState().byDriver.get(44)!
    expect(buf.pitStops.map((p) => p.lap_number)).toEqual([20, 35])
  })
})
