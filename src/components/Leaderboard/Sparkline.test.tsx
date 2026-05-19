import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Sparkline } from './Sparkline'

const TEN_LAPS = [90000, 91000, 89500, 90200, 90800, 89800, 91200, 90500, 89900, 90100]

describe('Sparkline', () => {
  it('renders polyline with 10 point pairs for 10 laps', () => {
    const { container } = render(<Sparkline laps={TEN_LAPS} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    const points = polyline!.getAttribute('points')!.trim().split(' ')
    expect(points).toHaveLength(10)
  })

  it('renders empty svg with aria-label "No lap data" for empty array', () => {
    const { container } = render(<Sparkline laps={[]} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg!.getAttribute('aria-label')).toBe('No lap data')
    expect(container.querySelector('polyline')).toBeNull()
  })

  it('renders empty svg with aria-label "No lap data" for single lap', () => {
    const { container } = render(<Sparkline laps={[90000]} />)
    const svg = container.querySelector('svg')
    expect(svg!.getAttribute('aria-label')).toBe('No lap data')
  })

  it('renders flat line (no NaN) when all laps are identical', () => {
    const { container } = render(<Sparkline laps={[90000, 90000, 90000, 90000, 90000]} />)
    const polyline = container.querySelector('polyline')
    expect(polyline).not.toBeNull()
    const points = polyline!.getAttribute('points')!
    expect(points).not.toContain('NaN')
  })

  it('matches snapshot for deterministic fixture', () => {
    const { container } = render(<Sparkline laps={TEN_LAPS} />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
