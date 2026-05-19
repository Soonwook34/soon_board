import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TireDot } from './TireDot'

describe('TireDot', () => {
  it('renders SOFT with bg-tire-soft class', () => {
    const { container } = render(<TireDot compound="SOFT" ageLaps={5} />)
    const dot = container.querySelector('[aria-label="Tire SOFT"]')
    expect(dot).not.toBeNull()
    expect(dot!.className).toContain('bg-tire-soft')
  })

  it('renders MEDIUM with bg-tire-medium class', () => {
    const { container } = render(<TireDot compound="MEDIUM" ageLaps={3} />)
    const dot = container.querySelector('[aria-label="Tire MEDIUM"]')
    expect(dot!.className).toContain('bg-tire-medium')
  })

  it('renders HARD with bg-tire-hard class', () => {
    const { container } = render(<TireDot compound="HARD" ageLaps={10} />)
    const dot = container.querySelector('[aria-label="Tire HARD"]')
    expect(dot!.className).toContain('bg-tire-hard')
  })

  it('renders INTERMEDIATE with bg-tire-inter class', () => {
    const { container } = render(<TireDot compound="INTERMEDIATE" ageLaps={2} />)
    const dot = container.querySelector('[aria-label="Tire INTERMEDIATE"]')
    expect(dot!.className).toContain('bg-tire-inter')
  })

  it('renders WET with bg-tire-wet class', () => {
    const { container } = render(<TireDot compound="WET" ageLaps={1} />)
    const dot = container.querySelector('[aria-label="Tire WET"]')
    expect(dot!.className).toContain('bg-tire-wet')
  })

  it('renders UNKNOWN with bg-soon-muted class', () => {
    const { container } = render(<TireDot compound="UNKNOWN" ageLaps={0} />)
    const dot = container.querySelector('[aria-label="Tire UNKNOWN"]')
    expect(dot!.className).toContain('bg-soon-muted')
  })

  it('aria-label includes compound name', () => {
    render(<TireDot compound="SOFT" ageLaps={5} />)
    expect(screen.getByLabelText('Tire SOFT')).toBeDefined()
  })

  it('displays lap age', () => {
    render(<TireDot compound="MEDIUM" ageLaps={7} />)
    expect(screen.getByText('L7')).toBeDefined()
  })
})
