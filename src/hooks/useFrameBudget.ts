import { useEffect, useRef, useState } from 'react'
import type { MasterRafApi } from './useMasterRaf'

export function detectInitialFps(): 30 | 60 {
  const params = new URLSearchParams(
    typeof location !== 'undefined' ? location.search : '',
  )
  const override = params.get('fps')
  if (override === '60') return 60
  if (override === '30') return 30
  if (typeof navigator === 'undefined') return 60
  const ua = navigator.userAgent
  const isIpadSafari =
    /iPad|Macintosh/.test(ua) &&
    'ontouchend' in document &&
    /Safari/.test(ua) &&
    !/CriOS|FxiOS|EdgiOS/.test(ua)
  return isIpadSafari ? 30 : 60
}

export interface FrameBudgetMetrics {
  fps: 30 | 60
  droppedFramePct: number
}

const WINDOW_SIZE = 60

export function useFrameBudget(masterRaf: MasterRafApi): FrameBudgetMetrics {
  const initialFps = detectInitialFps()
  const [fps, setFps] = useState<30 | 60>(initialFps)
  const [droppedFramePct, setDroppedFramePct] = useState(0)

  const durations = useRef<number[]>([])
  const lastTime = useRef<number | null>(null)
  const rafId = useRef<number | null>(null)
  const fpsRef = useRef<30 | 60>(initialFps)

  useEffect(() => {
    masterRaf.setTargetFps(initialFps)
    fpsRef.current = initialFps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function tick(now: number) {
      rafId.current = requestAnimationFrame(tick)

      if (lastTime.current !== null) {
        const delta = now - lastTime.current
        durations.current.push(delta)
        if (durations.current.length > WINDOW_SIZE) {
          durations.current.shift()
        }

        if (durations.current.length >= WINDOW_SIZE) {
          const currentFps = fpsRef.current
          const expectedMs = 1000 / currentFps
          const slack = 4
          const dropped = durations.current.filter(
            (d) => d > expectedMs + slack,
          ).length
          const pct = (dropped / durations.current.length) * 100
          setDroppedFramePct(pct)

          if (currentFps === 60 && pct > 10) {
            fpsRef.current = 30
            setFps(30)
            masterRaf.setTargetFps(30)
          } else if (currentFps === 30 && pct < 2) {
            fpsRef.current = 60
            setFps(60)
            masterRaf.setTargetFps(60)
          }
        }
      }

      lastTime.current = now
    }

    rafId.current = requestAnimationFrame(tick)

    return () => {
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current)
        rafId.current = null
      }
    }
  }, [masterRaf])

  return { fps, droppedFramePct }
}
