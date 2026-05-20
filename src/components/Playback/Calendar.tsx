import { useState } from 'react'
import type { OpenF1Client } from '../../api/client'
import type { Meeting, Session } from '../../api/types'
import { getMeetings } from '../../api/endpoints'
import { SessionPicker } from './SessionPicker'
import { useGlobalClock } from '../../hooks/useGlobalClock'
import {
  getMeetingStatus,
  formatCountdown,
  formatLocalDate,
  parseOpenF1DateMs,
  type SessionStatus,
} from '../../utils/sessionStatus'

export interface CalendarProps {
  client: OpenF1Client
  onPick: (meeting: Meeting, session: Session) => void
  onClose: () => void
}

const YEARS = [2024, 2025, 2026] as const
type Year = (typeof YEARS)[number]

export function Calendar({ client, onPick, onClose }: CalendarProps) {
  const [activeYear, setActiveYear] = useState<Year>(2025)
  const [cache, setCache] = useState<Partial<Record<Year, Meeting[]>>>({})
  const [loading, setLoading] = useState<Year | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pickerMeeting, setPickerMeeting] = useState<Meeting | null>(null)
  const nowMs = useGlobalClock(1)

  function selectYear(year: Year) {
    setActiveYear(year)
    setError(null)
    if (cache[year]) return
    setLoading(year)
    getMeetings(client, { year })
      .then((rows) => {
        setCache((prev) => ({ ...prev, [year]: rows }))
        setLoading(null)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load meetings')
        setLoading(null)
      })
  }

  // Trigger initial fetch for default year on first render
  const meetings = cache[activeYear]
  if (meetings === undefined && loading !== activeYear && !error) {
    selectYear(activeYear)
  }

  function handlePick(meeting: Meeting, session: Session) {
    onPick(meeting, session)
    onClose()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
        role="dialog"
        aria-modal="true"
        aria-label="Calendar"
      >
        <div className="bg-bg-elev2 rounded-lg shadow-xl p-6 w-[640px] max-h-[80vh] flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-white font-semibold">Select Race</h2>
            <button
              onClick={onClose}
              className="text-soon-muted hover:text-white text-lg leading-none"
              aria-label="Close calendar"
            >
              ×
            </button>
          </div>

          {/* Year tabs */}
          <div className="flex gap-2">
            {YEARS.map((y) => (
              <button
                key={y}
                onClick={() => selectYear(y)}
                className={[
                  'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                  activeYear === y
                    ? 'bg-soon-accent text-white'
                    : 'bg-bg-elev1 text-soon-muted hover:text-white',
                ].join(' ')}
                aria-pressed={activeYear === y}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Content */}
          {error && <p className="text-soon-accent text-xs">{error}</p>}

          {loading === activeYear && !meetings && (
            <p className="text-soon-muted text-xs">Loading meetings…</p>
          )}

          {meetings && (
            <div className="overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...meetings]
                  .sort((a, b) => parseOpenF1DateMs(a.date_start) - parseOpenF1DateMs(b.date_start))
                  .map((m) => {
                    const status = getMeetingStatus(m.date_start, nowMs)
                    return (
                      <button
                        key={m.meeting_key}
                        onClick={() => setPickerMeeting(m)}
                        className="text-left p-3 rounded bg-bg-elev1 hover:bg-soon-accent/20 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-white text-sm font-medium leading-snug truncate">
                            {m.meeting_name}
                          </p>
                          <StatusBadge status={status} />
                        </div>
                        <p className="text-soon-muted text-xs mt-0.5">{m.circuit_short_name}</p>
                        <p className="text-soon-muted text-xs">{formatLocalDate(m.date_start)}</p>
                        {status === 'upcoming' && (
                          <p className="text-soon-accent text-xs font-mono mt-1">
                            {formatCountdown(parseOpenF1DateMs(m.date_start), nowMs)}
                          </p>
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {pickerMeeting && (
        <SessionPicker
          client={client}
          meeting={pickerMeeting}
          onPick={handlePick}
          onClose={() => setPickerMeeting(null)}
        />
      )}
    </>
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
