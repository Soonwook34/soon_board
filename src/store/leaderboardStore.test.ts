import { describe, it, expect, beforeEach } from 'vitest'
import { useLeaderboardStore } from './leaderboardStore'
import { useTelemetryStore } from './telemetryStore'
import type { Interval, RacePosition, Driver } from '../api/types'

beforeEach(() => {
  useTelemetryStore.getState().flush()
  useLeaderboardStore.setState({ rows: [] })
})

const drivers: Driver[] = [
  { driver_number: 1, full_name: 'Max Verstappen', name_acronym: 'VER', team_name: 'Red Bull', team_colour: '#3671C6' },
  { driver_number: 44, full_name: 'Lewis Hamilton', name_acronym: 'HAM', team_name: 'Mercedes', team_colour: '#27F4D2' },
  { driver_number: 16, full_name: 'Charles Leclerc', name_acronym: 'LEC', team_name: 'Ferrari', team_colour: '#E8002D' },
]

const positions: RacePosition[] = [
  { session_key: 1, driver_number: 1, date: '2024-09-01T12:00:00.000Z', position: 1 },
  { session_key: 1, driver_number: 16, date: '2024-09-01T12:00:00.000Z', position: 2 },
  { session_key: 1, driver_number: 44, date: '2024-09-01T12:00:00.000Z', position: 3 },
]

const intervals: Interval[] = [
  { session_key: 1, driver_number: 1, date: '2024-09-01T12:00:00.000Z', gap_to_leader: 0, interval: 0 },
  { session_key: 1, driver_number: 16, date: '2024-09-01T12:00:00.000Z', gap_to_leader: 2.5, interval: 2.5 },
  { session_key: 1, driver_number: 44, date: '2024-09-01T12:00:00.000Z', gap_to_leader: 5.1, interval: 2.6 },
]

describe('leaderboardStore.recompute', () => {
  it('produces rows sorted by position', () => {
    useLeaderboardStore.getState().recompute(
      intervals,
      positions,
      drivers,
      useTelemetryStore.getState().byDriver,
    )
    const rows = useLeaderboardStore.getState().rows
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3])
    expect(rows.map((r) => r.name_acronym)).toEqual(['VER', 'LEC', 'HAM'])
  })

  it('maps gap_to_leader to ms correctly', () => {
    useLeaderboardStore.getState().recompute(
      intervals,
      positions,
      drivers,
      useTelemetryStore.getState().byDriver,
    )
    const rows = useLeaderboardStore.getState().rows
    expect(rows[0].gapToLeaderMs).toBe(0)
    expect(rows[1].gapToLeaderMs).toBe(2500)
    expect(rows[2].gapToLeaderMs).toBe(5100)
  })

  it('maps intervalAheadMs correctly', () => {
    useLeaderboardStore.getState().recompute(
      intervals,
      positions,
      drivers,
      useTelemetryStore.getState().byDriver,
    )
    const rows = useLeaderboardStore.getState().rows
    expect(rows[2].intervalAheadMs).toBe(2600)
  })

  it('pulls sparklineLaps and tireCompound from telemetry', () => {
    useTelemetryStore.getState().appendLap({
      session_key: 1,
      driver_number: 1,
      lap_number: 5,
      date_start: '2024-09-01T12:00:00.000Z',
      lap_duration: 88.5,
      duration_sector_1: null,
      duration_sector_2: null,
      duration_sector_3: null,
      is_pit_out_lap: false,
    })
    useTelemetryStore.getState().appendStint({
      session_key: 1,
      driver_number: 1,
      stint_number: 1,
      lap_start: 1,
      lap_end: 10,
      compound: 'MEDIUM',
      tyre_age_at_start: 0,
    })

    useLeaderboardStore.getState().recompute(
      intervals,
      positions,
      drivers,
      useTelemetryStore.getState().byDriver,
    )

    const ver = useLeaderboardStore.getState().rows.find((r) => r.driver_number === 1)!
    expect(ver.tireCompound).toBe('MEDIUM')
    expect(ver.sparklineLaps).toEqual([88500])
  })

  it('handles +1 LAP gap_to_leader gracefully (leaves gapToLeaderMs=0)', () => {
    const intervalsWithLap: Interval[] = [
      { session_key: 1, driver_number: 1, date: '2024-09-01T12:00:00.000Z', gap_to_leader: 0, interval: 0 },
      { session_key: 1, driver_number: 44, date: '2024-09-01T12:00:00.000Z', gap_to_leader: '+1 LAP', interval: null },
      { session_key: 1, driver_number: 16, date: '2024-09-01T12:00:00.000Z', gap_to_leader: 2.0, interval: 2.0 },
    ]
    useLeaderboardStore.getState().recompute(
      intervalsWithLap,
      positions,
      drivers,
      useTelemetryStore.getState().byDriver,
    )
    const ham = useLeaderboardStore.getState().rows.find((r) => r.driver_number === 44)!
    expect(ham.gapToLeaderMs).toBe(0)
    expect(ham.intervalAheadMs).toBe(0)
  })
})
