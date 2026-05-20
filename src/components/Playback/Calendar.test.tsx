import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { Calendar } from './Calendar'
import type { OpenF1Client } from '../../api/client'
import type { Meeting } from '../../api/types'
import { PRESHIPPED_MEETINGS } from '../../assets/meetings'
import { getAvailableYears } from '../../utils/seasonYears'

function makeClient(extra: Partial<Record<number, Meeting[]>> = {}): OpenF1Client {
  const fetchJson = vi.fn().mockImplementation((_path: string, params: Record<string, unknown>) => {
    const y = params?.year as number
    if (y in extra) return Promise.resolve(extra[y])
    return Promise.resolve([])
  })
  return { fetchJson } as unknown as OpenF1Client
}

describe('Calendar', () => {
  it('renders pre-shipped meeting cards for the initial year without hitting the API', async () => {
    const client = makeClient()
    render(
      <Calendar
        client={client}
        onPick={vi.fn()}
        onClose={vi.fn()}
        currentSessionDateStart="2024-05-26T13:00:00Z"
      />,
    )
    const someMeetingName = PRESHIPPED_MEETINGS[2024][0]?.meeting_name
    expect(someMeetingName).toBeDefined()
    await waitFor(() => {
      expect(screen.getAllByText(someMeetingName!).length).toBeGreaterThan(0)
    })
    expect(client.fetchJson).not.toHaveBeenCalled()
  })

  it('renders a year tab for every year in getAvailableYears()', () => {
    const client = makeClient()
    render(<Calendar client={client} onPick={vi.fn()} onClose={vi.fn()} />)
    for (const y of getAvailableYears()) {
      expect(screen.getByText(String(y))).toBeInTheDocument()
    }
  })

  it('falls back to the API when a year has no pre-shipped data', async () => {
    const liveMeetings: Meeting[] = [
      {
        meeting_key: 999,
        year: 9999,
        circuit_short_name: 'Test',
        country_name: 'Testland',
        date_start: '9999-04-01',
        meeting_name: '9999 Test Grand Prix',
      },
    ]
    const client = makeClient({ 9999: liveMeetings })
    render(
      <Calendar
        client={client}
        onPick={vi.fn()}
        onClose={vi.fn()}
        currentSessionDateStart="9999-04-01T13:00:00Z"
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('9999 Test Grand Prix')).toBeInTheDocument()
    })
    expect(client.fetchJson).toHaveBeenCalledWith(
      '/meetings',
      expect.objectContaining({ year: 9999 }),
    )
  })

  it('falls back to currentYear when no current session is supplied', () => {
    const client = makeClient()
    render(<Calendar client={client} onPick={vi.fn()} onClose={vi.fn()} />)
    const expected = String(new Date().getUTCFullYear())
    const tab = screen.getByText(expected)
    expect(tab).toHaveAttribute('aria-pressed', 'true')
  })

  it('calls onClose when close button clicked', async () => {
    const client = makeClient()
    const onClose = vi.fn()
    render(<Calendar client={client} onPick={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close calendar'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
