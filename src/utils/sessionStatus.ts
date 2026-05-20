export type SessionStatus = 'past' | 'live' | 'upcoming'

const LIVE_BUFFER_MS = 5 * 60 * 1000

// OpenF1 returns timestamps as UTC but often without a timezone suffix.
// `Date.parse` treats no-tz datetimes as LOCAL, which skews ms by the user's offset.
// Append 'Z' when no tz marker is present so we always get UTC ms.
export function parseOpenF1DateMs(iso: string): number {
  const hasTz = iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso)
  return Date.parse(hasTz ? iso : iso + 'Z')
}

// Same normalization, but returns the ISO string OpenF1's date filters expect.
export function toOpenF1Iso(iso: string): string {
  const hasTz = iso.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(iso)
  return hasTz ? iso : iso + 'Z'
}

export function getSessionStatus(
  startIso: string,
  endIso: string,
  nowMs: number = Date.now(),
): SessionStatus {
  const start = parseOpenF1DateMs(startIso)
  const end = parseOpenF1DateMs(endIso)
  if (nowMs < start - LIVE_BUFFER_MS) return 'upcoming'
  if (nowMs > end + LIVE_BUFFER_MS) return 'past'
  return 'live'
}

// Meeting only exposes date_start; treat a GP weekend as ~4 days wide for status.
const MEETING_WEEKEND_MS = 4 * 24 * 60 * 60 * 1000

export function getMeetingStatus(
  startIso: string,
  nowMs: number = Date.now(),
): SessionStatus {
  const start = parseOpenF1DateMs(startIso)
  if (nowMs < start) return 'upcoming'
  if (nowMs > start + MEETING_WEEKEND_MS) return 'past'
  return 'live'
}

export function formatCountdown(targetMs: number, nowMs: number = Date.now()): string {
  const total = Math.max(0, targetMs - nowMs)
  const seconds = Math.floor(total / 1000)
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (days > 0) return `D-${days} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatLocalDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
