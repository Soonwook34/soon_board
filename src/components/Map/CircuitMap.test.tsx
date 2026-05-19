import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CircuitMap } from './CircuitMap'
import type { Session, Driver } from '../../api/types'
import { _resetMasterRafInstance } from '../../hooks/useMasterRaf'

// Mock rAF
let rafCallbacks: ((t: number) => void)[] = []
let rafIdCounter = 0

beforeEach(() => {
  rafCallbacks = []
  rafIdCounter = 0
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    rafCallbacks.push(cb)
    return ++rafIdCounter
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  _resetMasterRafInstance()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _resetMasterRafInstance()
})

const session: Session = {
  session_key: 9161,
  meeting_key: 1219,
  session_type: 'Race',
  session_name: 'Race',
  date_start: '2024-03-02T13:00:00',
  date_end: '2024-03-02T15:00:00',
}

const drivers: Driver[] = [
  { driver_number: 1, full_name: 'Max Verstappen', name_acronym: 'VER', team_name: 'Red Bull Racing', team_colour: '3671C6' },
  { driver_number: 44, full_name: 'Lewis Hamilton', name_acronym: 'HAM', team_name: 'Mercedes', team_colour: '27F4D2' },
  { driver_number: 16, full_name: 'Charles Leclerc', name_acronym: 'LEC', team_name: 'Ferrari', team_colour: 'E8002D' },
]

const substrateSamples = [
  { t: 1000, x: 100, y: 200 },
  { t: 1100, x: 150, y: 210 },
  { t: 1200, x: 200, y: 220 },
  { t: 1300, x: 250, y: 230 },
  { t: 1400, x: 300, y: 220 },
  { t: 1500, x: 350, y: 200 },
]

describe('CircuitMap', () => {
  it('renders an SVG with expected viewBox from substrate bbox', () => {
    const { container } = render(
      <CircuitMap session={session} drivers={drivers} substrateSamples={substrateSamples} />,
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()

    // viewBox should reflect bbox of (100-350, 200-230) + 5% padding
    const viewBox = svg!.getAttribute('viewBox')
    expect(viewBox).toBeTruthy()
    // Parse viewBox values and check they contain our point range
    const [x, y, w, h] = viewBox!.split(' ').map(Number)
    expect(x).toBeLessThan(100)   // padded
    expect(y).toBeLessThan(200)   // padded
    expect(x + w).toBeGreaterThan(350) // covers maxX
    expect(y + h).toBeGreaterThan(230) // covers maxY
  })

  it('renders 3 marker groups, one per driver', () => {
    render(
      <CircuitMap session={session} drivers={drivers} substrateSamples={substrateSamples} />,
    )

    // Aria labels are set on each marker g element
    expect(screen.getByLabelText('Driver VER')).toBeTruthy()
    expect(screen.getByLabelText('Driver HAM')).toBeTruthy()
    expect(screen.getByLabelText('Driver LEC')).toBeTruthy()
  })

  it('renders the substrate path element', () => {
    const { container } = render(
      <CircuitMap session={session} drivers={drivers} substrateSamples={substrateSamples} />,
    )

    // There should be at least one path element (the substrate)
    const paths = container.querySelectorAll('path')
    expect(paths.length).toBeGreaterThan(0)

    // The substrate path should have fill=none
    const substratePath = Array.from(paths).find(
      (p) => p.getAttribute('fill') === 'none',
    )
    expect(substratePath).toBeTruthy()
    expect(substratePath!.getAttribute('stroke')).toBe('#3A3A45')
  })

  it('renders gracefully with empty substrate (no throw)', () => {
    expect(() => {
      render(
        <CircuitMap session={session} drivers={drivers} substrateSamples={[]} />,
      )
    }).not.toThrow()

    // SVG should still be present
    const svg = document.querySelector('svg')
    expect(svg).toBeTruthy()
  })
})
