import { useLeaderboardStore } from '../../store/leaderboardStore'
import { Row } from './Row'

export function Leaderboard() {
  const rows = useLeaderboardStore((s) => s.rows)

  return (
    <div className="bg-bg-elev1 rounded-md overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-white/10 text-soon-muted text-xs uppercase tracking-wide">
            <th className="px-3 py-2 font-medium">Pos</th>
            <th className="px-3 py-2 font-medium">Driver</th>
            <th className="px-3 py-2 font-medium">Team</th>
            <th className="px-3 py-2 font-medium">Last Lap</th>
            <th className="px-3 py-2 font-medium">Interval</th>
            <th className="px-3 py-2 font-medium">Gap</th>
            <th className="px-3 py-2 font-medium">Tire</th>
            <th className="px-3 py-2 font-medium">Pits</th>
            <th className="px-3 py-2 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Row key={row.driver_number} driverNumber={row.driver_number} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
