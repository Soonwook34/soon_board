import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PlaybackBar } from './PlaybackBar'
import { useTimelineStore } from '../../store/timelineStore'
import { useSessionStore } from '../../store/sessionStore'
import type { OpenF1Client } from '../../api/client'
import type { Poller } from '../../scheduler/poller'
import * as masterRafModule from '../../hooks/useMasterRaf'
import type { MasterRafApi } from '../../hooks/useMasterRaf'

// Stub masterRaf to avoid rAF in jsdom
const stubMasterRaf: MasterRafApi = {
  register: vi.fn(() => () => {}),
  isApplying: { current: false },
  currentFps: () => 60,
  setTargetFps: vi.fn(),
  setTrackLength: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}
vi.spyOn(masterRafModule, 'useMasterRaf').mockReturnValue(stubMasterRaf)

function makeClient(): OpenF1Client {
  return { fetchJson: vi.fn().mockResolvedValue([]) } as unknown as OpenF1Client
}

function makePoller(): Poller {
  return {
    pause: vi.fn(),
    resume: vi.fn(),
    refetchWindow: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(() => true),
  } as unknown as Poller
}

beforeEach(() => {
  useTimelineStore.setState({ mode: 'live', playbackRate: 1 })
  useSessionStore.setState({ meeting: null, session: null })
  masterRafModule._resetMasterRafInstance()
})

describe('PlaybackBar', () => {
  it('shows LiveDot when mode is live', () => {
    useTimelineStore.setState({ mode: 'live' })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.getByLabelText('Live')).toBeInTheDocument()
  })

  it('hides LiveDot when mode is playback', () => {
    useTimelineStore.setState({ mode: 'playback' })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.queryByLabelText('Live')).not.toBeInTheDocument()
  })

  it('shows Scrubber when mode is playback and session is set', () => {
    useTimelineStore.setState({ mode: 'playback' })
    useSessionStore.setState({
      meeting: { meeting_key: 1, year: 2025, circuit_short_name: 'Bahrain', country_name: 'Bahrain', date_start: '2025-03-16', meeting_name: 'Bahrain Grand Prix' },
      session: { session_key: 9001, meeting_key: 1, session_type: 'Race', session_name: 'Race', date_start: '2025-03-16T13:00:00Z', date_end: '2025-03-16T15:00:00Z' },
    })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.getByRole('slider', { name: 'Timeline scrubber' })).toBeInTheDocument()
  })

  it('does not show Scrubber in live mode', () => {
    useTimelineStore.setState({ mode: 'live' })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.queryByRole('slider', { name: 'Timeline scrubber' })).not.toBeInTheDocument()
  })

  it('SpeedToggle is present in playback mode', () => {
    useTimelineStore.setState({ mode: 'playback' })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.getByRole('group', { name: 'Playback speed' })).toBeInTheDocument()
  })

  it('SpeedToggle is hidden in live mode', () => {
    useTimelineStore.setState({ mode: 'live' })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    expect(screen.queryByRole('group', { name: 'Playback speed' })).not.toBeInTheDocument()
  })

  it('clicking 2× speed updates store playbackRate', () => {
    useTimelineStore.setState({ mode: 'playback', playbackRate: 1 })
    render(<PlaybackBar client={makeClient()} poller={makePoller()} />)
    fireEvent.click(screen.getByRole('button', { name: '2× speed' }))
    expect(useTimelineStore.getState().playbackRate).toBe(2)
  })
})
