import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { SessionPicker } from './SessionPicker'
import type { OpenF1Client } from '../../api/client'
import type { Meeting, Session } from '../../api/types'

const mockMeeting: Meeting = {
  meeting_key: 1219,
  year: 2024,
  circuit_short_name: 'Monaco',
  country_name: 'Monaco',
  date_start: '2024-05-23T00:00:00',
  meeting_name: 'Monaco Grand Prix',
}

const mockSessions: Session[] = [
  { session_key: 9001, meeting_key: 1219, session_type: 'Practice', session_name: 'Practice 1', date_start: '2024-05-23T11:30:00', date_end: '2024-05-23T12:30:00' },
  { session_key: 9002, meeting_key: 1219, session_type: 'Practice', session_name: 'Practice 2', date_start: '2024-05-23T15:00:00', date_end: '2024-05-23T16:00:00' },
  { session_key: 9003, meeting_key: 1219, session_type: 'Practice', session_name: 'Practice 3', date_start: '2024-05-25T10:30:00', date_end: '2024-05-25T11:30:00' },
  { session_key: 9004, meeting_key: 1219, session_type: 'Qualifying', session_name: 'Qualifying', date_start: '2024-05-25T14:00:00', date_end: '2024-05-25T15:00:00' },
  { session_key: 9005, meeting_key: 1219, session_type: 'Sprint', session_name: 'Sprint', date_start: '2024-05-26T11:00:00', date_end: '2024-05-26T12:00:00' },
  { session_key: 9006, meeting_key: 1219, session_type: 'Race', session_name: 'Race', date_start: '2024-05-26T14:00:00', date_end: '2024-05-26T16:00:00' },
]

function makeClient(sessions: Session[] = mockSessions): OpenF1Client {
  return {
    fetchJson: vi.fn().mockResolvedValue(sessions),
  } as unknown as OpenF1Client
}

describe('SessionPicker', () => {
  it('renders 6 session buttons after fetch', async () => {
    const client = makeClient()
    const onPick = vi.fn()
    const onClose = vi.fn()

    render(
      <SessionPicker client={client} meeting={mockMeeting} onPick={onPick} onClose={onClose} />,
    )

    await waitFor(() => {
      expect(screen.getAllByRole('button').filter(b => !b.getAttribute('aria-label')?.includes('Close'))).toHaveLength(6)
    })

    for (const s of mockSessions) {
      expect(screen.getByText(s.session_name)).toBeInTheDocument()
    }
  })

  it('calls onPick with meeting and session when a session is clicked', async () => {
    const client = makeClient()
    const onPick = vi.fn()
    const onClose = vi.fn()

    render(
      <SessionPicker client={client} meeting={mockMeeting} onPick={onPick} onClose={onClose} />,
    )

    await waitFor(() => screen.getByText('Race'))
    fireEvent.click(screen.getByText('Race'))

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(mockMeeting, mockSessions[5])
  })

  it('calls onClose when close button is clicked', async () => {
    const client = makeClient()
    const onClose = vi.fn()

    render(
      <SessionPicker client={client} meeting={mockMeeting} onPick={vi.fn()} onClose={onClose} />,
    )

    fireEvent.click(screen.getByLabelText('Close session picker'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
