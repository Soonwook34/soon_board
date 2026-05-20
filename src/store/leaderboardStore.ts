import { create } from 'zustand'
import type { Interval, RacePosition, Driver, Stint } from '../api/types'
import type { DriverBuffer } from './telemetryStore'

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
    leaderLap?: number | null,
  ): void
}

// Highest lap_number observed across all drivers — used as the "as-of"
// time-point for clipping future pit stops / stint changes / lap rows.
export function computeLeaderLap(byDriver: Map<number, DriverBuffer>): number | null {
  let max: number | null = null
  for (const buf of byDriver.values()) {
    if (buf.laps.length === 0) continue
    const n = buf.laps[buf.laps.length - 1].lap_number
    if (max === null || n > max) max = n
  }
  return max
}

// Most recent stint whose lap_start has been reached at leaderLap. Falls back
// to the first stint when no laps have completed yet.
export function pickActiveStint(stints: Stint[], leaderLap: number | null): Stint | null {
  if (stints.length === 0) return null
  if (leaderLap === null) return stints[0]
  let best: Stint | null = null
  for (const st of stints) if (st.lap_start <= leaderLap) best = st
  return best ?? stints[0]
}

// Tyre age clipped to the leader's current lap so an in-progress stint
// doesn't display its eventual full length.
export function stintAge(st: Stint, leaderLap: number | null): number {
  let upper: number
  if (leaderLap === null) upper = st.lap_start
  else if (st.lap_end !== null && st.lap_end <= leaderLap) upper = st.lap_end
  else upper = leaderLap
  return Math.max(0, upper - st.lap_start) + st.tyre_age_at_start
}

export const useLeaderboardStore = create<LeaderboardState & LeaderboardActions>((set) => ({
  rows: [],

  recompute(
    intervalsLatest: Interval[],
    positionsLatest: RacePosition[],
    drivers: Driver[],
    telemetry: Map<number, DriverBuffer>,
    leaderLap?: number | null,
  ): void {
    const lap = leaderLap === undefined ? computeLeaderLap(telemetry) : leaderLap

    const positionMap = new Map<number, number>()
    for (const p of positionsLatest) positionMap.set(p.driver_number, p.position)

    const intervalMap = new Map<number, Interval>()
    for (const iv of intervalsLatest) intervalMap.set(iv.driver_number, iv)

    const rows: LeaderboardRow[] = []
    for (const driver of drivers) {
      const dn = driver.driver_number
      const buf = telemetry.get(dn)
      const iv = intervalMap.get(dn)
      const position = positionMap.get(dn) ?? 0

      const visibleLaps = (buf?.laps ?? []).filter(
        (l) => lap === null || l.lap_number <= lap,
      )
      const completedLaps = visibleLaps.filter((l) => l.lap_duration !== null)
      const lastLapMs =
        completedLaps.length > 0
          ? (completedLaps[completedLaps.length - 1].lap_duration ?? 0) * 1000
          : 0
      const sparklineLaps = completedLaps.slice(-10).map((l) => (l.lap_duration ?? 0) * 1000)

      const visiblePits = (buf?.pitStops ?? []).filter(
        (p) => lap === null || p.lap_number <= lap,
      )
      const pitStops = visiblePits.length

      const activeStint = pickActiveStint(buf?.stints ?? [], lap)
      const tireCompound = activeStint?.compound ?? 'UNKNOWN'
      const tireAgeLaps = activeStint ? stintAge(activeStint, lap) : 0

      let gapToLeaderMs = 0
      if (iv && typeof iv.gap_to_leader === 'number') gapToLeaderMs = iv.gap_to_leader * 1000
      let intervalAheadMs = 0
      if (iv && typeof iv.interval === 'number') intervalAheadMs = iv.interval * 1000

      rows.push({
        driver_number: dn,
        name_acronym: driver.name_acronym,
        team_colour: driver.team_colour,
        position,
        lastLapMs,
        gapToLeaderMs,
        intervalAheadMs,
        tireCompound,
        tireAgeLaps,
        pitStops,
        sparklineLaps,
      })
    }

    rows.sort((a, b) => a.position - b.position)
    set({ rows })
  },
}))
