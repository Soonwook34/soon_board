type Compound = 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'

export function TireDot({ compound, ageLaps }: { compound: Compound; ageLaps: number }) {
  const colorClass = {
    SOFT: 'bg-tire-soft',
    MEDIUM: 'bg-tire-medium',
    HARD: 'bg-tire-hard',
    INTERMEDIATE: 'bg-tire-inter',
    WET: 'bg-tire-wet',
    UNKNOWN: 'bg-soon-muted',
  }[compound]
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2.5 h-2.5 rounded-full ${colorClass}`} aria-label={`Tire ${compound}`} />
      <span className="text-soon-muted text-xs tabular-nums">L{ageLaps}</span>
    </span>
  )
}
