import { create } from 'zustand'
import type { Interval, RacePosition, Driver } from '../api/types'
import type { DriverBuffer } from './telemetryStore'
import type { Stint } from '../api/types'

export interface LeaderboardRow {
  driver_number: number
  name_acronym: string
  team_colour: string
  position: number
  lastLapMs: number
  gapToLeaderMs: number
  intervalAheadMs: number
  tireCompound: Stint['compound']
  tireAgeLaps: number
  pitStops: number
  sparklineLaps: number[]
}

interface LeaderboardState {
  rows: LeaderboardRow[]
}

interface LeaderboardActions {
  recompute(
    intervalsLatest: Interval[],
    positionsLatest: RacePosition[],
    drivers: Driver[],
    telemetry: Map<number, DriverBuffer>,
  ): void
}

export const useLeaderboardStore = create<LeaderboardState & LeaderboardActions>((set) => ({
  rows: [],

  recompute(
    intervalsLatest: Interval[],
    positionsLatest: RacePosition[],
    drivers: Driver[],
    telemetry: Map<number, DriverBuffer>,
  ): void {
    // Build lookup maps
    const driverMap = new Map<number, Driver>()
    for (const d of drivers) {
      driverMap.set(d.driver_number, d)
    }

    const positionMap = new Map<number, number>()
    for (const p of positionsLatest) {
      positionMap.set(p.driver_number, p.position)
    }

    const intervalMap = new Map<number, Interval>()
    for (const iv of intervalsLatest) {
      intervalMap.set(iv.driver_number, iv)
    }

    const rows: LeaderboardRow[] = []

    for (const driver of drivers) {
      const dn = driver.driver_number
      const buf = telemetry.get(dn)
      const iv = intervalMap.get(dn)
      const position = positionMap.get(dn) ?? 0

      const lastLapMs = buf?.sparklineLaps.at(-1) ?? 0

      let gapToLeaderMs = 0
      if (iv) {
        const g = iv.gap_to_leader
        if (typeof g === 'number') {
          gapToLeaderMs = g * 1000
        }
      }

      let intervalAheadMs = 0
      if (iv) {
        const g = iv.interval
        if (typeof g === 'number') {
          intervalAheadMs = g * 1000
        }
      }

      rows.push({
        driver_number: dn,
        name_acronym: driver.name_acronym,
        team_colour: driver.team_colour,
        position,
        lastLapMs,
        gapToLeaderMs,
        intervalAheadMs,
        tireCompound: buf?.tireCompound ?? 'UNKNOWN',
        tireAgeLaps: buf?.tireAgeLaps ?? 0,
        pitStops: buf?.pitStops ?? 0,
        sparklineLaps: buf?.sparklineLaps ?? [],
      })
    }

    rows.sort((a, b) => a.position - b.position)

    set({ rows })
  },
}))
