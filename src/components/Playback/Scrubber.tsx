import { useRef, useState, useCallback } from 'react'
import type { Poller } from '../../scheduler/poller'
import { useTimelineStore } from '../../store/timelineStore'
import { useMasterRaf } from '../../hooks/useMasterRaf'
import { formatScrubLabel } from './format'

export interface ScrubberProps {
  poller: Poller
  sessionStartMs: number
  sessionEndMs: number
}

export function Scrubber({ poller, sessionStartMs, sessionEndMs }: ScrubberProps) {
  const masterRaf = useMasterRaf()
  const anchorSessionTime = useTimelineStore((s) => s.anchorSessionTime)
  const [pendingMs, setPendingMs] = useState<number | null>(null)

  const trackRef = useRef<HTMLDivElement>(null)
  const duration = sessionEndMs - sessionStartMs

  const currentMs = pendingMs ?? anchorSessionTime
  const fraction = duration > 0 ? Math.max(0, Math.min(1, (currentMs - sessionStartMs) / duration)) : 0

  const msFromEvent = useCallback(
    (clientX: number): number => {
      const el = trackRef.current
      if (!el) return sessionStartMs
      const rect = el.getBoundingClientRect()
      const f = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return sessionStartMs + f * duration
    },
    [sessionStartMs, duration],
  )

  async function onCommit(sessionMs: number) {
    try {
      masterRaf.isApplying.current = true
      poller.pause()
      await poller.refetchWindow(sessionMs - 30_000, sessionMs)
      useTimelineStore.getState().scrubTo(sessionMs)
      poller.resume()
    } finally {
      masterRaf.isApplying.current = false
    }
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault()
    const startMs = msFromEvent(e.clientX)
    setPendingMs(startMs)

    function onMouseMove(me: MouseEvent) {
      const el = trackRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const f = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
      setPendingMs(sessionStartMs + f * duration)
    }

    function onMouseUp(me: MouseEvent) {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      const el = trackRef.current
      if (!el) {
        setPendingMs(null)
        return
      }
      const rect = el.getBoundingClientRect()
      const f = Math.max(0, Math.min(1, (me.clientX - rect.left) / rect.width))
      const commitMs = sessionStartMs + f * duration
      setPendingMs(null)
      void onCommit(commitMs)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-soon-muted text-xs tabular-nums whitespace-nowrap">
        {formatScrubLabel(sessionStartMs, sessionStartMs)}
      </span>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Timeline scrubber"
        aria-valuemin={sessionStartMs}
        aria-valuemax={sessionEndMs}
        aria-valuenow={currentMs}
        className="relative flex-1 h-1.5 bg-bg-elev1 rounded-full cursor-pointer"
        onMouseDown={handleMouseDown}
      >
        {/* Filled portion */}
        <div
          className="absolute inset-y-0 left-0 bg-soon-accent rounded-full"
          style={{ width: `${fraction * 100}%` }}
        />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full shadow"
          style={{ left: `${fraction * 100}%` }}
        />
      </div>
      <span className="text-soon-muted text-xs tabular-nums whitespace-nowrap">
        {formatScrubLabel(sessionEndMs, sessionStartMs)}
      </span>
    </div>
  )
}
