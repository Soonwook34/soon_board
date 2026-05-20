import { TIRE_COLORS, TIRE_SHORT_NAME, type Compound } from './tireColors'

export function TireChip({
  compound,
  ageLaps,
}: {
  compound: Compound
  ageLaps: number
}) {
  const palette = TIRE_COLORS[compound] ?? TIRE_COLORS.UNKNOWN
  const label = TIRE_SHORT_NAME[compound] ?? 'UNKNOWN'
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-flex items-center justify-center rounded px-1.5 py-0.5 font-bold text-[10px] tabular-nums tracking-wide"
        style={{ backgroundColor: palette.bg, color: palette.fg }}
        aria-label={`Tire ${compound}`}
      >
        {label}
      </span>
      <span className="text-soon-muted text-xs tabular-nums">L{ageLaps}</span>
    </span>
  )
}
