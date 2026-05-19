import { useTimelineStore } from '../../store/timelineStore'

export function LiveDot() {
  const mode = useTimelineStore((s) => s.mode)
  if (mode !== 'live') return null
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-soon-accent animate-pulse"
      aria-label="Live"
    />
  )
}
