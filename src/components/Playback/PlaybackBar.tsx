import { useState } from 'react'
import type { OpenF1Client } from '../../api/client'
import type { Meeting, Session } from '../../api/types'
import type { Poller } from '../../scheduler/poller'
import { useTimelineStore } from '../../store/timelineStore'
import { useSessionStore } from '../../store/sessionStore'
import { useGlobalClock } from '../../hooks/useGlobalClock'
import { LiveDot } from './LiveDot'
import { SpeedToggle } from './SpeedToggle'
import { Scrubber } from './Scrubber'
import { Calendar } from './Calendar'
import { formatClock } from './format'

export interface PlaybackBarProps {
  client: OpenF1Client
  poller: Poller
}

export function PlaybackBar({ client, poller }: PlaybackBarProps) {
  const isLive = useTimelineStore((s) => s.mode === 'live')
  const isPlayback = useTimelineStore((s) => s.mode === 'playback')
  const meeting = useSessionStore((s) => s.meeting)
  const session = useSessionStore((s) => s.session)
  const nowMs = useGlobalClock(1)

  const [calendarOpen, setCalendarOpen] = useState(false)

  function handlePick(m: Meeting, s: Session) {
    useSessionStore.getState().setMeeting(m)
    useSessionStore.getState().setSession(s)
    useTimelineStore.getState().setMode('playback')
    setCalendarOpen(false)
  }

  const sessionLabel =
    meeting && session ? `${meeting.meeting_name} — ${session.session_name}` : 'No session'

  const sessionStartMs = session ? new Date(session.date_start).getTime() : 0
  const sessionEndMs = session ? new Date(session.date_end).getTime() : 0

  return (
    <>
      <div className="flex items-center gap-4 px-4 bg-bg-elev2 h-16 w-full">
        {/* Calendar open button */}
        <button
          onClick={() => setCalendarOpen(true)}
          className="text-soon-muted hover:text-white text-xs font-medium px-2 py-1 rounded bg-bg-elev1 transition-colors"
          aria-label="Open calendar"
        >
          Calendar
        </button>

        {/* Session label */}
        <span className="text-white text-sm font-medium truncate flex-shrink-0">{sessionLabel}</span>

        {/* Live dot */}
        <LiveDot />

        {/* Scrubber (playback only) */}
        {isPlayback && session && (
          <div className="flex-1 min-w-0">
            <Scrubber poller={poller} sessionStartMs={sessionStartMs} sessionEndMs={sessionEndMs} />
          </div>
        )}

        {/* Spacer when live */}
        {isLive && <div className="flex-1" />}

        {/* Clock */}
        <span className="text-soon-muted text-xs tabular-nums font-mono">{formatClock(nowMs)}</span>

        {/* Speed toggle */}
        <SpeedToggle />
      </div>

      {calendarOpen && (
        <Calendar client={client} onPick={handlePick} onClose={() => setCalendarOpen(false)} />
      )}
    </>
  )
}
