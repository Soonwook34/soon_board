import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useLeaderboardStore } from '../../store/leaderboardStore'
import { Leaderboard } from './Leaderboard'
import type { LeaderboardRow } from '../../store/leaderboardStore'

const fixtureRows: LeaderboardRow[] = [
  {
    driver_number: 1,
    name_acronym: 'VER',
    team_name: 'Red Bull Racing',
    team_colour: '3671C6',
    position: 1,
    lastLapMs: 83456,
    gapToLeaderMs: 0,
    intervalAheadMs: 0,
    tireCompound: 'SOFT',
    tireAgeLaps: 5,
    pitStops: 1,
    sparklineLaps: [83456, 83500, 83400],
  },
  {
    driver_number: 44,
    name_acronym: 'HAM',
    team_name: 'Mercedes',
    team_colour: '27F4D2',
    position: 2,
    lastLapMs: 83900,
    gapToLeaderMs: 2500,
    intervalAheadMs: 2500,
    tireCompound: 'MEDIUM',
    tireAgeLaps: 8,
    pitStops: 1,
    sparklineLaps: [83900, 84000, 83800],
  },
  {
    driver_number: 16,
    name_acronym: 'LEC',
    team_name: 'Ferrari',
    team_colour: 'E8002D',
    position: 3,
    lastLapMs: 84200,
    gapToLeaderMs: 5100,
    intervalAheadMs: 2600,
    tireCompound: 'HARD',
    tireAgeLaps: 12,
    pitStops: 0,
    sparklineLaps: [84200, 84100, 84300],
  },
]

beforeEach(() => {
  useLeaderboardStore.setState({ rows: fixtureRows })
})

describe('Leaderboard', () => {
  it('renders all 3 fixture rows', () => {
    render(<Leaderboard />)
    expect(screen.getAllByRole('row')).toHaveLength(4) // 3 data rows + 1 header
  })

  it('renders rows in position order', () => {
    render(<Leaderboard />)
    const rows = screen.getAllByRole('row')
    // rows[0] is header; rows[1..3] are data rows in order
    expect(rows[1]).toHaveTextContent('VER')
    expect(rows[2]).toHaveTextContent('HAM')
    expect(rows[3]).toHaveTextContent('LEC')
  })

  it('renders position numbers', () => {
    render(<Leaderboard />)
    const rows = screen.getAllByRole('row') as HTMLTableRowElement[]
    // Position numbers appear in first cell of each data row
    expect(rows[1].cells[0]).toHaveTextContent('1')
    expect(rows[2].cells[0]).toHaveTextContent('2')
    expect(rows[3].cells[0]).toHaveTextContent('3')
  })

  it('renders driver abbreviations', () => {
    render(<Leaderboard />)
    expect(screen.getAllByText('VER').length).toBeGreaterThan(0)
    expect(screen.getAllByText('HAM').length).toBeGreaterThan(0)
    expect(screen.getAllByText('LEC').length).toBeGreaterThan(0)
  })

  it('renders tire compound dots', () => {
    render(<Leaderboard />)
    expect(screen.getByLabelText('Tire SOFT')).toBeDefined()
    expect(screen.getByLabelText('Tire MEDIUM')).toBeDefined()
    expect(screen.getByLabelText('Tire HARD')).toBeDefined()
  })

  it('renders gap for non-leader rows', () => {
    render(<Leaderboard />)
    expect(screen.getAllByText('+2.500').length).toBeGreaterThan(0)
    expect(screen.getByText('+5.100')).toBeDefined()
  })
})
