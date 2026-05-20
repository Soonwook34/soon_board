import React from 'react'
import { useLeaderboardStore } from '../../store/leaderboardStore'
import { TireChip } from './TireChip'
import { Sparkline } from './Sparkline'
import { formatLapTime, formatGap } from './format'

export const Row = React.memo(function Row({ driverNumber }: { driverNumber: number }) {
  const row = useLeaderboardStore((s) => s.rows.find((r) => r.driver_number === driverNumber))

  if (!row) return null

  return (
    <tr className="border-b border-white/5 hover:bg-bg-elev2 transition-colors">
      <td className="px-3 py-1.5 tabular-nums text-soon-muted text-sm">{row.position}</td>
      <td className="px-3 py-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full mr-2 align-middle"
          style={{ backgroundColor: `#${row.team_colour}` }}
          aria-hidden="true"
        />
        <span className="font-mono font-bold text-sm">{row.name_acronym}</span>
      </td>
      <td className="px-3 py-1.5 text-soon-muted text-xs">{row.team_name}</td>
      <td className="px-3 py-1.5 tabular-nums text-sm">{formatLapTime(row.lastLapMs || null)}</td>
      <td className="px-3 py-1.5 tabular-nums text-sm text-soon-muted">
        {row.position === 1 ? '—' : formatGap(row.intervalAheadMs)}
      </td>
      <td className="px-3 py-1.5 tabular-nums text-sm text-soon-muted">
        {row.position === 1 ? '—' : formatGap(row.gapToLeaderMs)}
      </td>
      <td className="px-3 py-1.5">
        <TireChip compound={row.tireCompound} ageLaps={row.tireAgeLaps} />
      </td>
      <td className="px-3 py-1.5 tabular-nums text-sm text-soon-muted">{row.pitStops}</td>
      <td className="px-3 py-1.5">
        <Sparkline laps={row.sparklineLaps} />
      </td>
    </tr>
  )
})
