import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TireChip } from './TireChip'
import { TIRE_COLORS, TIRE_SHORT_NAME } from './tireColors'

describe('TireChip', () => {
  it('renders the short label for each compound', () => {
    const compounds: (keyof typeof TIRE_SHORT_NAME)[] = [
      'SOFT',
      'MEDIUM',
      'HARD',
      'INTERMEDIATE',
      'WET',
      'UNKNOWN',
    ]
    for (const c of compounds) {
      const { container, unmount } = render(<TireChip compound={c} ageLaps={3} />)
      expect(container.textContent).toContain(TIRE_SHORT_NAME[c])
      unmount()
    }
  })

  it('renders INTERMEDIATE as the short "INTER" label', () => {
    render(<TireChip compound="INTERMEDIATE" ageLaps={3} />)
    expect(screen.getByLabelText('Tire INTERMEDIATE').textContent).toBe('INTER')
  })

  it('uses the official Pirelli color palette per compound', () => {
    const { container } = render(<TireChip compound="SOFT" ageLaps={5} />)
    const chip = container.querySelector('[aria-label="Tire SOFT"]') as HTMLElement
    expect(chip).not.toBeNull()
    expect(chip.style.backgroundColor).toBeTruthy()
    // The chip background should match the SOFT palette
    // (rgb(218, 41, 28) === #DA291C)
    expect(chip.style.backgroundColor.replace(/\s/g, '')).toBe(
      `rgb(${parseInt(TIRE_COLORS.SOFT.bg.slice(1, 3), 16)},${parseInt(TIRE_COLORS.SOFT.bg.slice(3, 5), 16)},${parseInt(TIRE_COLORS.SOFT.bg.slice(5, 7), 16)})`,
    )
  })

  it('renders the lap age in L{ageLaps} form', () => {
    render(<TireChip compound="MEDIUM" ageLaps={14} />)
    expect(screen.getByText('L14')).toBeInTheDocument()
  })

  it('sets aria-label so the row test can locate the chip by compound', () => {
    // The existing Leaderboard.test.tsx asserts getByLabelText("Tire SOFT") —
    // this test pins that contract on TireChip directly.
    render(<TireChip compound="SOFT" ageLaps={1} />)
    expect(screen.getByLabelText('Tire SOFT')).toBeInTheDocument()
  })
})
