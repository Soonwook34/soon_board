import { useTimelineStore } from '../../store/timelineStore'

const RATES = [1, 2, 5] as const

export function SpeedToggle() {
  const rate = useTimelineStore((s) => s.playbackRate)
  const isLive = useTimelineStore((s) => s.mode === 'live')

  if (isLive) return null

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
      {RATES.map((r) => {
        const active = rate === r
        return (
          <button
            key={r}
            onClick={() => useTimelineStore.getState().setRate(r)}
            className={[
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              active
                ? 'bg-soon-accent text-white'
                : 'bg-bg-elev1 text-soon-muted hover:text-white',
            ].join(' ')}
            aria-pressed={active}
            aria-label={`${r}× speed`}
          >
            {r}×
          </button>
        )
      })}
    </div>
  )
}
