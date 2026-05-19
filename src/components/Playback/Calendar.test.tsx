import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Calendar } from './Calendar'
import type { OpenF1Client } from '../../api/client'
import type { Meeting } from '../../api/types'

const meetings2025: Meeting[] = [
  { meeting_key: 1, year: 2025, circuit_short_name: 'Bahrain', country_name: 'Bahrain', date_start: '2025-03-16', meeting_name: 'Bahrain Grand Prix' },
  { meeting_key: 2, year: 2025, circuit_short_name: 'Jeddah', country_name: 'Saudi Arabia', date_start: '2025-03-23', meeting_name: 'Saudi Arabian Grand Prix' },
  { meeting_key: 3, year: 2025, circuit_short_name: 'Melbourne', country_name: 'Australia', date_start: '2025-03-30', meeting_name: 'Australian Grand Prix' },
]

const meetings2024: Meeting[] = [
  { meeting_key: 10, year: 2024, circuit_short_name: 'Bahrain', country_name: 'Bahrain', date_start: '2024-03-02', meeting_name: '2024 Bahrain Grand Prix' },
]

function makeClient(): OpenF1Client {
  const fetchJson = vi.fn().mockImplementation((_path: string, params: Record<string, unknown>) => {
    if (params?.year === 2024) return Promise.resolve(meetings2024)
    if (params?.year === 2025) return Promise.resolve(meetings2025)
    return Promise.resolve([])
  })
  return { fetchJson } as unknown as OpenF1Client
}

describe('Calendar', () => {
  it('renders 3 meeting cards for year 2025 on mount', async () => {
    const client = makeClient()
    render(<Calendar client={client} onPick={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Bahrain Grand Prix')).toBeInTheDocument()
      expect(screen.getByText('Saudi Arabian Grand Prix')).toBeInTheDocument()
      expect(screen.getByText('Australian Grand Prix')).toBeInTheDocument()
    })
  })

  it('fetches year 2024 when 2024 tab is clicked', async () => {
    const client = makeClient()
    render(<Calendar client={client} onPick={vi.fn()} onClose={vi.fn()} />)

    // Wait for 2025 to load first
    await waitFor(() => screen.getByText('Bahrain Grand Prix'))

    // Click 2024 tab
    fireEvent.click(screen.getByText('2024'))

    await waitFor(() => {
      expect(screen.getByText('2024 Bahrain Grand Prix')).toBeInTheDocument()
    })

    // fetchJson called with year=2024
    expect(client.fetchJson).toHaveBeenCalledWith(
      '/meetings',
      expect.objectContaining({ year: 2024 }),
    )
  })

  it('does not refetch when revisiting a cached year', async () => {
    const client = makeClient()
    render(<Calendar client={client} onPick={vi.fn()} onClose={vi.fn()} />)

    await waitFor(() => screen.getByText('Bahrain Grand Prix'))

    const callsBefore = (client.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length

    // Click 2025 again
    fireEvent.click(screen.getByText('2025'))

    // No additional fetch
    expect((client.fetchJson as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('calls onClose when close button clicked', async () => {
    const client = makeClient()
    const onClose = vi.fn()
    render(<Calendar client={client} onPick={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close calendar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
