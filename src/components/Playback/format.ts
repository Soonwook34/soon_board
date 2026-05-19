/**
 * Format an epoch millisecond timestamp as "HH:MM:SS" in UTC.
 */
export function formatClock(epochMs: number): string {
  const d = new Date(epochMs)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * Format a session-relative timestamp as "+MM:SS" from session start.
 * sessionMs and sessionStartMs are both in epoch milliseconds.
 */
export function formatScrubLabel(sessionMs: number, sessionStartMs: number): string {
  const elapsedMs = Math.max(0, sessionMs - sessionStartMs)
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  return `+${mm}:${ss}`
}
