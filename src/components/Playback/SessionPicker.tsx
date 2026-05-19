import { useState, useEffect } from 'react'
import type { OpenF1Client } from '../../api/client'
import type { Meeting, Session } from '../../api/types'
import { getSessions } from '../../api/endpoints'

export interface SessionPickerProps {
  client: OpenF1Client
  meeting: Meeting
  onPick: (meeting: Meeting, session: Session) => void
  onClose: () => void
}

export function SessionPicker({ client, meeting, onPick, onClose }: SessionPickerProps) {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      <div className="bg-bg-elev2 rounded-lg shadow-xl p-6 w-80 max-h-[80vh] flex flex-col gap-4">
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
            {sessions.map((s) => (
              <button
                key={s.session_key}
                onClick={() => onPick(meeting, s)}
                className="text-left px-3 py-2 rounded bg-bg-elev1 hover:bg-soon-accent/20 text-white text-sm transition-colors"
              >
                {s.session_name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
