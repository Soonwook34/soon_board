import { useState, useEffect } from 'react'
import type { OpenF1Client } from '../../api/client'
import type { Meeting, Session } from '../../api/types'
import { getSessions } from '../../api/endpoints'
import { useGlobalClock } from '../../hooks/useGlobalClock'
import {
  getSessionStatus,
  formatCountdown,
  formatLocalDateTime,
  parseOpenF1DateMs,
  type SessionStatus,
} from '../../utils/sessionStatus'

export interface SessionPickerProps {
  client: OpenF1Client
  meeting: Meeting
  onPick: (meeting: Meeting, session: Session) => void
  onClose: () => void
}

export function SessionPicker({ client, meeting, onPick, onClose }: SessionPickerProps) {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nowMs = useGlobalClock(1)

  useEffect(() => {
    let cancelled = false
    getSessions(client, { meeting_key: meeting.meeting_key })
      .then((rows) => {
        if (!cancelled) setSessions(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load sessions')
      })
    return () => {
      cancelled = true
    }
  }, [client, meeting.meeting_key])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Session picker"
    >
      <div className="bg-bg-elev2 rounded-lg p-6 w-96 max-h-[80vh] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">{meeting.meeting_name}</h2>
          <button
            onClick={onClose}
            className="text-soon-muted hover:text-white text-lg leading-none"
            aria-label="Close session picker"
          >
            ×
          </button>
        </div>

        {error && <p className="text-soon-accent text-xs">{error}</p>}

        {sessions === null && !error && (
          <p className="text-soon-muted text-xs">Loading sessions…</p>
        )}

        {sessions !== null && (
          <div className="flex flex-col gap-2 overflow-y-auto">
            {[...sessions]
              .sort((a, b) => parseOpenF1DateMs(a.date_start) - parseOpenF1DateMs(b.date_start))
              .map((s) => {
                const status = getSessionStatus(s.date_start, s.date_end, nowMs)
                return (
                  <button
                    key={s.session_key}
                    onClick={() => onPick(meeting, s)}
                    className="text-left px-3 py-2 rounded bg-bg-elev1 hover:bg-soon-accent/20 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-sm">{s.session_name}</span>
                      <StatusBadge status={status} />
                    </div>
                    <p className="text-soon-muted text-xs mt-0.5">
                      {formatLocalDateTime(s.date_start)}
                    </p>
                    {status === 'upcoming' && (
                      <p className="text-soon-accent text-xs font-mono mt-0.5">
                        {formatCountdown(parseOpenF1DateMs(s.date_start), nowMs)}
                      </p>
                    )}
                  </button>
                )
              })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const config = {
    live: { label: 'LIVE', cls: 'bg-soon-accent text-white' },
    upcoming: { label: 'UPCOMING', cls: 'bg-bg-elev2 text-soon-accent border border-soon-accent/50' },
    past: { label: 'PAST', cls: 'bg-bg-elev2 text-soon-muted' },
  }[status]
  return (
    <span
      className={`text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded ${config.cls}`}
    >
      {config.label}
    </span>
  )
}
