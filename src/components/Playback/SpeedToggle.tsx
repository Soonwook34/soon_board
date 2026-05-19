import { useTimelineStore } from '../../store/timelineStore'

const RATES = [1, 2, 5] as const

export function SpeedToggle() {
  const rate = useTimelineStore((s) => s.playbackRate)
  const isLive = useTimelineStore((s) => s.mode === 'live')

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Playback speed">
      {RATES.map((r) => {
        const disabled = isLive && r !== 1
        const active = rate === r
        return (
          <button
            key={r}
            disabled={disabled}
            onClick={() => {
              if (!disabled) {
                useTimelineStore.getState().setRate(r)
              }
            }}
            className={[
              'px-2 py-1 rounded text-xs font-medium transition-colors',
              active
                ? 'bg-soon-accent text-white'
                : disabled
                  ? 'bg-bg-elev1 text-soon-muted opacity-40 cursor-not-allowed'
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
