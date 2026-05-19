import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpeedToggle } from './SpeedToggle'
import { useTimelineStore } from '../../store/timelineStore'

beforeEach(() => {
  // Reset store to live mode, rate 1
  useTimelineStore.setState({ mode: 'live', playbackRate: 1 })
})

describe('SpeedToggle', () => {
  it('renders 1×, 2×, 5× buttons', () => {
    render(<SpeedToggle />)
    expect(screen.getByRole('button', { name: '1× speed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2× speed' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '5× speed' })).toBeInTheDocument()
  })

  it('active rate matches store', () => {
    useTimelineStore.setState({ mode: 'playback', playbackRate: 2 })
    render(<SpeedToggle />)
    expect(screen.getByRole('button', { name: '2× speed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1× speed' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('click 2× calls setRate(2)', () => {
    useTimelineStore.setState({ mode: 'playback', playbackRate: 1 })
    const setRate = vi.spyOn(useTimelineStore.getState(), 'setRate')
    render(<SpeedToggle />)
    fireEvent.click(screen.getByRole('button', { name: '2× speed' }))
    expect(setRate).toHaveBeenCalledWith(2)
  })

  it('live mode: 2× and 5× are disabled', () => {
    useTimelineStore.setState({ mode: 'live', playbackRate: 1 })
    render(<SpeedToggle />)
    expect(screen.getByRole('button', { name: '2× speed' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '5× speed' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '1× speed' })).not.toBeDisabled()
  })
})
