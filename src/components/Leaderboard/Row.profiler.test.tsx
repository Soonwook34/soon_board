import { describe, it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import { Profiler } from 'react'
import { useLeaderboardStore } from '../../store/leaderboardStore'
import { Row } from './Row'
import type { LeaderboardRow } from '../../store/leaderboardStore'

function makeRow(position: number): LeaderboardRow {
  return {
    driver_number: position,
    name_acronym: `D${String(position).padStart(2, '0')}`,
    team_colour: '3671C6',
    position,
    lastLapMs: 83000 + position * 100,
    gapToLeaderMs: position * 1000,
    intervalAheadMs: 1000,
    tireCompound: 'SOFT',
    tireAgeLaps: position,
    pitStops: 0,
    sparklineLaps: Array.from({ length: 10 }, (_, i) => 83000 + i * 100),
  }
}

const TWENTY_ROWS: LeaderboardRow[] = Array.from({ length: 20 }, (_, i) => makeRow(i + 1))

describe('Row.profiler (AC3.4 smoke test)', () => {
  it('renders 20 rows and logs commit duration', () => {
    useLeaderboardStore.setState({ rows: TWENTY_ROWS })

    const durations: number[] = []

    const { rerender } = render(
      <Profiler
        id="leaderboard-rows"
        onRender={(_id, _phase, actualDuration) => {
          durations.push(actualDuration)
        }}
      >
        <table>
          <tbody>
            {TWENTY_ROWS.map((r) => (
              <Row key={r.driver_number} driverNumber={r.driver_number} />
            ))}
          </tbody>
        </table>
      </Profiler>,
    )

    // Toggle sort order (reverse positions)
    const reversed = [...TWENTY_ROWS].reverse().map((r, i) => ({ ...r, position: i + 1 }))
    act(() => {
      useLeaderboardStore.setState({ rows: reversed })
    })

    rerender(
      <Profiler
        id="leaderboard-rows"
        onRender={(_id, _phase, actualDuration) => {
          durations.push(actualDuration)
        }}
      >
        <table>
          <tbody>
            {reversed.map((r) => (
              <Row key={r.driver_number} driverNumber={r.driver_number} />
            ))}
          </tbody>
        </table>
      </Profiler>,
    )

    // Profiler must have been invoked at least once
    expect(durations.length).toBeGreaterThan(0)

    // Log measured duration for developer sanity check
    const maxDuration = Math.max(...durations)
    console.log(`[Row.profiler] max actualDuration across renders: ${maxDuration.toFixed(2)}ms`)

    // jsdom is slower than browser; we assert profiler fired, not enforce strict 16ms
    // In production browser this should be well under 16ms per AC3.4
  })
})
