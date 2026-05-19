import { useEffect, useRef, useState } from 'react'
import { useTimelineStore, globalClockNow } from '../store/timelineStore'

/**
 * Returns globalClockNow() updated at `intervalHz` via setInterval.
 * Use for components that legitimately re-render on clock ticks (NOT marker animations).
 */
export function useGlobalClock(intervalHz = 1): number {
  const storeRef = useRef(useTimelineStore.getState())
  const [now, setNow] = useState(() => globalClockNow(storeRef.current))

  useEffect(() => {
    // Keep ref in sync for reads inside the interval callback
    const unsub = useTimelineStore.subscribe((state) => {
      storeRef.current = state
    })

    const ms = 1000 / intervalHz
    const id = setInterval(() => {
      setNow(globalClockNow(storeRef.current))
    }, ms)

    return () => {
      clearInterval(id)
      unsub()
    }
  }, [intervalHz])

  return now
}

/**
 * Returns globalClockNow() updated on every animation frame.
 * Intended only for special components that need sub-frame precision.
 * Marker components do NOT use this — they read store state inside their own rAF loop.
 */
export function useGlobalClockRaf(): number {
  const storeRef = useRef(useTimelineStore.getState())
  const [now, setNow] = useState(() => globalClockNow(storeRef.current))
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const unsub = useTimelineStore.subscribe((state) => {
      storeRef.current = state
    })

    function tick() {
      setNow(globalClockNow(storeRef.current))
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      unsub()
    }
  }, [])

  return now
}
