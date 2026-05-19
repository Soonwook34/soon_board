import { describe, it, expect, beforeEach } from 'vitest'
import { useTelemetryStore } from './telemetryStore'
import type { LocationRow } from '../api/types'

beforeEach(() => {
  useTelemetryStore.getState().flush()
})

function makeRow(driver_number: number, dateIso: string, x = 0, y = 0): LocationRow {
  return { session_key: 1, driver_number, date: dateIso, x, y, z: 0 }
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
    // First sample should be the 2nd inserted (index 1), not the 1st (index 0)
    expect(buf.samples[0].x).toBe(1)
    expect(buf.samples[199].x).toBe(200)
  })
})

describe('appendLocationBatch deduplication', () => {
  it('dedupes by (driver, t)', () => {
    const isoDate = '2024-09-01T12:00:00.000Z'
    const row = makeRow(1, isoDate, 10, 20)

    useTelemetryStore.getState().appendLocationBatch([row])
    useTelemetryStore.getState().appendLocationBatch([row]) // duplicate

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

describe('appendLap', () => {
  it('updates lastLap and sparklineLaps', () => {
    useTelemetryStore.getState().appendLap({
      session_key: 1,
      driver_number: 5,
      lap_number: 3,
      date_start: '2024-09-01T12:00:00.000Z',
      lap_duration: 90.5,
      duration_sector_1: 30,
      duration_sector_2: 30,
      duration_sector_3: 30.5,
      is_pit_out_lap: false,
    })
    const buf = useTelemetryStore.getState().byDriver.get(5)!
    expect(buf.lastLap).toBe(3)
    expect(buf.sparklineLaps).toEqual([90500])
  })

  it('caps sparklineLaps at 10', () => {
    for (let i = 1; i <= 12; i++) {
      useTelemetryStore.getState().appendLap({
        session_key: 1,
        driver_number: 7,
        lap_number: i,
        date_start: '2024-09-01T12:00:00.000Z',
        lap_duration: 90 + i,
        duration_sector_1: null,
        duration_sector_2: null,
        duration_sector_3: null,
        is_pit_out_lap: false,
      })
    }
    const buf = useTelemetryStore.getState().byDriver.get(7)!
    expect(buf.sparklineLaps.length).toBe(10)
  })
})

describe('appendStint', () => {
  it('updates tireCompound and resets tireAgeLaps', () => {
    useTelemetryStore.getState().appendLap({
      session_key: 1,
      driver_number: 1,
      lap_number: 5,
      date_start: '2024-09-01T12:00:00.000Z',
      lap_duration: 88,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      is_pit_out_lap: false,
    })
    useTelemetryStore.getState().appendStint({
      session_key: 1,
      driver_number: 1,
      stint_number: 2,
      lap_start: 5,
      lap_end: 10,
      compound: 'HARD',
      tyre_age_at_start: 0,
    })
    const buf = useTelemetryStore.getState().byDriver.get(1)!
    expect(buf.tireCompound).toBe('HARD')
    expect(buf.tireAgeLaps).toBe(0)
  })
})

describe('appendPit', () => {
  it('increments pitStops', () => {
    useTelemetryStore.getState().appendPit({
      session_key: 1,
      driver_number: 44,
      lap_number: 20,
      date: '2024-09-01T13:00:00.000Z',
      pit_duration: 25.4,
    })
    useTelemetryStore.getState().appendPit({
      session_key: 1,
      driver_number: 44,
      lap_number: 35,
      date: '2024-09-01T13:30:00.000Z',
      pit_duration: 22.1,
    })
    const buf = useTelemetryStore.getState().byDriver.get(44)!
    expect(buf.pitStops).toBe(2)
  })
})
