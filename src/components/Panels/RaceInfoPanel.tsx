import { useRaceControlStore } from '../../store/raceControlStore'
import { formatClock } from '../Playback/format'

export function RaceInfoPanel() {
  const messages = useRaceControlStore((s) => s.messages)
  const flag = useRaceControlStore((s) => s.activeFlag)
  const sc = useRaceControlStore((s) => s.safetyCarActive)
  const vsc = useRaceControlStore((s) => s.vscActive)

  return (
    <div
      data-testid="race-info-panel"
      className="shrink-0 max-h-40 overflow-auto border-b border-white/10 p-2 text-xs"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-soon-muted uppercase tracking-wide">Race Control</span>
        <span
          data-testid="rc-flag"
          className="px-1.5 py-0.5 rounded bg-bg-elev2 font-bold tracking-wide"
        >
          {flag ?? 'GREEN'}
        </span>
        {sc && (
          <span
            data-testid="rc-sc"
            className="px-1.5 py-0.5 rounded font-bold tracking-wide"
            style={{ backgroundColor: '#FFD93D', color: '#0A0A0B' }}
          >
            SC
          </span>
        )}
        {vsc && (
          <span
            data-testid="rc-vsc"
            className="px-1.5 py-0.5 rounded font-bold tracking-wide"
            style={{ backgroundColor: '#FFD93D', color: '#0A0A0B' }}
          >
            VSC
          </span>
        )}
      </div>
      <ol data-testid="rc-list" className="space-y-0.5 m-0 p-0 list-none">
        {messages.length === 0 ? (
          <li data-testid="rc-empty" className="text-soon-muted">
            No messages yet.
          </li>
        ) : (
          messages.map((m, i) => (
            <li key={`${m.date}-${i}`} className="font-mono">
              <span className="text-soon-muted tabular-nums mr-2">
                {formatClock(Date.parse(m.date))}
              </span>
              {m.message}
            </li>
          ))
        )}
      </ol>
    </div>
  )
}
