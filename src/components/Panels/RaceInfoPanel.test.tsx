import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RaceInfoPanel } from './RaceInfoPanel'
import { useRaceControlStore } from '../../store/raceControlStore'
import type { RaceControl } from '../../api/types'

function msg(date: string, message: string, extra: Partial<RaceControl> = {}): RaceControl {
  return {
    session_key: 9161,
    date,
    category: 'Other',
    message,
    ...extra,
  }
}

beforeEach(() => {
  useRaceControlStore.getState().reset()
})

describe('RaceInfoPanel', () => {
  it('shows the empty-state placeholder when there are no messages', () => {
    render(<RaceInfoPanel />)
    expect(screen.getByTestId('rc-empty')).toBeInTheDocument()
  })

  it('defaults the flag chip to GREEN when no flag has been seen', () => {
    render(<RaceInfoPanel />)
    expect(screen.getByTestId('rc-flag').textContent).toBe('GREEN')
  })

  it('renders the latest flag from store-derived state', () => {
    useRaceControlStore.getState().appendBatch([
      msg('2024-03-02T13:00:00', 'Yellow Sector 3', { flag: 'YELLOW' }),
    ])
    render(<RaceInfoPanel />)
    expect(screen.getByTestId('rc-flag').textContent).toBe('YELLOW')
  })

  it('shows the SC badge when safetyCarActive is true', () => {
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:00:00', 'SAFETY CAR DEPLOYED')])
    render(<RaceInfoPanel />)
    expect(screen.getByTestId('rc-sc')).toBeInTheDocument()
  })

  it('shows the VSC badge when vscActive is true', () => {
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:00:00', 'VIRTUAL SAFETY CAR DEPLOYED')])
    render(<RaceInfoPanel />)
    expect(screen.getByTestId('rc-vsc')).toBeInTheDocument()
  })

  it('renders each message with a 24h HH:MM:SS timestamp prefix', () => {
    useRaceControlStore.getState().appendBatch([
      msg('2024-03-02T14:30:00Z', 'Pit lane closed'),
    ])
    render(<RaceInfoPanel />)
    const list = screen.getByTestId('rc-list')
    expect(list.textContent).toContain('14:30:00')
    expect(list.textContent).toContain('Pit lane closed')
  })
})
