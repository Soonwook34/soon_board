import { describe, it, expect, beforeEach } from 'vitest'
import {
  useCarsPositionStore,
  CARS_ACTIVE_WINDOW_MS,
  SAMPLE_RETENTION_MS,
} from './carsPositionStore'
import type { LocationRow } from '../api/types'

function row(driver_number: number, dateIso: string, x: number, y: number): LocationRow {
  return { session_key: 1, driver_number, date: dateIso, x, y, z: 0 }
}

beforeEach(() => {
  useCarsPositionStore.getState().reset()
})

describe('apply — latest-anchor rescale', () => {
  it('anchors latest sub-sample at nowMs and places older sub-samples by server delta', () => {
    const nowMs = 1_000_000
    useCarsPositionStore.getState().apply(
      [
        row(1, '2024-09-01T12:00:00.000Z', 0, 0),
        row(1, '2024-09-01T12:00:01.000Z', 10, 0),
        row(1, '2024-09-01T12:00:02.500Z', 20, 0),
      ],
      nowMs,
    )
    const car = useCarsPositionStore.getState().byNumber.get(1)!
    expect(car.samples.length).toBe(3)
    expect(car.samples[2].t).toBe(nowMs)
    expect(car.samples[1].t).toBe(nowMs - 1500)
    expect(car.samples[0].t).toBe(nowMs - 2500)
    expect(car.lastUpdate).toBe(nowMs)
  })

  it('composes consecutive polls into a contiguous client-clock timeline', () => {
    useCarsPositionStore
      .getState()
      .apply(
        [row(1, '2024-09-01T12:00:00.000Z', 0, 0), row(1, '2024-09-01T12:00:01.000Z', 10, 0)],
        1_000_000,
      )
    useCarsPositionStore
      .getState()
      .apply(
        [row(1, '2024-09-01T12:00:02.000Z', 20, 0), row(1, '2024-09-01T12:00:03.000Z', 30, 0)],
        1_002_000,
      )
    const car = useCarsPositionStore.getState().byNumber.get(1)!
    const ts = car.samples.map((s) => s.t)
    expect(ts).toEqual([999_000, 1_000_000, 1_001_000, 1_002_000])
  })

  it('dedupes by t across overlapping polls', () => {
    useCarsPositionStore
      .getState()
      .apply([row(1, '2024-09-01T12:00:00.000Z', 0, 0)], 1_000_000)
    useCarsPositionStore
      .getState()
      .apply([row(1, '2024-09-01T12:00:00.000Z', 0, 0)], 1_000_000)
    const car = useCarsPositionStore.getState().byNumber.get(1)!
    expect(car.samples.length).toBe(1)
  })

  it('dedupes overlapping polls by server timestamp even when nowMs and pipeline latency drift', () => {
    // First poll: baseline batch.
    useCarsPositionStore.getState().apply(
      [
        row(1, '2024-09-01T12:00:00.000Z', 0, 0),
        row(1, '2024-09-01T12:00:01.000Z', 10, 0),
      ],
      1_000_000,
    )
    expect(useCarsPositionStore.getState().byNumber.get(1)!.samples).toHaveLength(2)

    // Second poll arrives 5s later but with a different effective pipeline
    // latency — older entries would land at perturbed t values if dedup
    // ignored server time. The two overlapping rows must NOT re-insert.
    useCarsPositionStore.getState().apply(
      [
        row(1, '2024-09-01T12:00:00.000Z', 0, 0),
        row(1, '2024-09-01T12:00:01.000Z', 10, 0),
        row(1, '2024-09-01T12:00:05.000Z', 50, 0),
      ],
      1_005_100,
    )
    const samples = useCarsPositionStore.getState().byNumber.get(1)!.samples
    expect(samples).toHaveLength(3)
    // Unique server timestamps survive once each.
    const tServers = new Set(samples.map((s) => s.tServer))
    expect(tServers.size).toBe(3)
  })

  it('drops samples older than SAMPLE_RETENTION_MS behind nowMs', () => {
    useCarsPositionStore
      .getState()
      .apply(
        [row(1, '2024-09-01T12:00:00.000Z', 0, 0), row(1, '2024-09-01T12:00:01.000Z', 10, 0)],
        1_000_000,
      )
    const advancedNow = 1_000_000 + SAMPLE_RETENTION_MS + 2_000
    useCarsPositionStore
      .getState()
      .apply([row(1, '2024-09-01T12:01:30.000Z', 100, 0)], advancedNow)
    const car = useCarsPositionStore.getState().byNumber.get(1)!
    for (const s of car.samples) {
      expect(s.t).toBeGreaterThanOrEqual(advancedNow - SAMPLE_RETENTION_MS)
    }
  })

  it('updates heading from the last two samples', () => {
    useCarsPositionStore
      .getState()
      .apply(
        [
          row(1, '2024-09-01T12:00:00.000Z', 0, 0),
          row(1, '2024-09-01T12:00:01.000Z', 10, 0),
        ],
        1_000_000,
      )
    expect(useCarsPositionStore.getState().byNumber.get(1)!.heading).toBe(0)
    useCarsPositionStore
      .getState()
      .apply([row(1, '2024-09-01T12:00:02.000Z', 10, 10)], 1_001_000)
    expect(useCarsPositionStore.getState().byNumber.get(1)!.heading).toBe(90)
  })

  it('ignores rows with unparseable dates', () => {
    useCarsPositionStore.getState().apply([row(1, 'not-a-date', 0, 0)], 1_000_000)
    expect(useCarsPositionStore.getState().byNumber.size).toBe(0)
  })
})

describe('activity helpers', () => {
  it('getActive includes cars whose lastUpdate is within windowMs', () => {
    useCarsPositionStore.getState().apply([row(1, '2024-09-01T12:00:00.000Z', 0, 0)], 1_000_000)
    useCarsPositionStore.getState().apply([row(2, '2024-09-01T12:00:00.000Z', 0, 0)], 1_010_000)
    const active = useCarsPositionStore.getState().getActive(1_020_000, CARS_ACTIVE_WINDOW_MS)
    expect(active.map((c) => c.driver_number).sort()).toEqual([1, 2])
  })

  it('getActive drops cars whose lastUpdate is older than windowMs', () => {
    useCarsPositionStore.getState().apply([row(1, '2024-09-01T12:00:00.000Z', 0, 0)], 1_000_000)
    const queryNow = 1_000_000 + CARS_ACTIVE_WINDOW_MS + 1_000
    expect(useCarsPositionStore.getState().getActive(queryNow)).toEqual([])
    expect(useCarsPositionStore.getState().isActive(1, queryNow)).toBe(false)
  })

  it('reset clears byNumber', () => {
    useCarsPositionStore.getState().apply([row(1, '2024-09-01T12:00:00.000Z', 0, 0)], 1_000_000)
    useCarsPositionStore.getState().reset()
    expect(useCarsPositionStore.getState().byNumber.size).toBe(0)
  })
})
