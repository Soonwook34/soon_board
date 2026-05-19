export function formatLapTime(ms: number | null): string {
  if (ms === null) return '—'
  const totalSeconds = ms / 1000
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const secs = seconds.toFixed(3).padStart(6, '0')
  return `${minutes}:${secs}`
}

export function formatGap(ms: number | null | '+1 LAP'): string {
  if (ms === null) return '—'
  if (ms === '+1 LAP') return '+1 LAP'
  const seconds = ms / 1000
  return `+${seconds.toFixed(3)}`
}
