import { Wordmark } from './Wordmark'

export function Header({
  meetingLabel,
  sessionLabel,
}: {
  meetingLabel?: string
  sessionLabel?: string
}) {
  return (
    <header className="h-14 bg-bg-elev2 border-b border-bg-elev1 flex items-center px-4 gap-4">
      <Wordmark />
      <div className="flex-1 text-soon-muted text-sm">
        {meetingLabel && <span>{meetingLabel}</span>}
        {sessionLabel && (
          <>
            {' '}
            <span className="mx-2">·</span> <span>{sessionLabel}</span>
          </>
        )}
      </div>
    </header>
  )
}
