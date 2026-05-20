import React from 'react'
import { useTimelineStore } from '../store/timelineStore'
import { globalClockNow } from '../store/timelineStore'
import { sampleAt } from '../scheduler/interpolator'

export type MarkerRefRegistration = {
  driverNumber: number
  ref: React.RefObject<SVGGElement>
  getSamples: () => { t: number; x: number; y: number }[]
}

export interface MasterRafApi {
  register(reg: MarkerRefRegistration): () => void
  isApplying: React.MutableRefObject<boolean>
  currentFps: () => 30 | 60
  setTargetFps(fps: 30 | 60): void
  // Track perimeter (sum of segment euclidean distances) in scene units.
  // CircuitMap publishes this once the substrate polyline is built. With
  // trackLength > 0, the interpolator enables snap-on-teleport (segments
  // longer than trackLength/30 snap to later sample) and 2 s extrapolation
  // capping past the newest sample. Default 0 → freeze-at-last behavior.
  setTrackLength(meters: number): void
  start(): void
  stop(): void
}

// Module-level singleton
let instance: MasterRafApi | null = null
let refCount = 0

function createMasterRaf(): MasterRafApi {
  const registrations = new Map<number, MarkerRefRegistration>()
  const isApplying: React.MutableRefObject<boolean> = { current: false }
  let targetFps: 30 | 60 = 60
  let rafId: number | null = null
  let frameCount = 0
  let trackLength = 0

  function tick() {
    rafId = requestAnimationFrame(tick)

    // Frame skip for 30fps: only run every other frame
    frameCount++
    if (targetFps === 30 && frameCount % 2 !== 0) return

    // M2: skip frame writes when applying
    if (isApplying.current) return

    // Read clock once per frame — no subscription, no setState
    const t = globalClockNow(useTimelineStore.getState())

    for (const reg of registrations.values()) {
      const el = reg.ref.current
      if (!el) continue
      const samples = reg.getSamples()
      const pos = sampleAt(samples, t, {
        mode: 'lerp',
        snapDivisor: 30,
        trackLength,
        extrapCapMs: 2000,
      })
      if (pos === null) continue
      el.setAttribute('transform', `translate(${pos.x},${pos.y})`)
    }
  }

  const api: MasterRafApi = {
    register(reg: MarkerRefRegistration): () => void {
      registrations.set(reg.driverNumber, reg)
      return () => {
        registrations.delete(reg.driverNumber)
      }
    },
    isApplying,
    currentFps(): 30 | 60 {
      return targetFps
    },
    setTargetFps(fps: 30 | 60): void {
      targetFps = fps
    },
    setTrackLength(meters: number): void {
      trackLength = meters > 0 ? meters : 0
    },
    start(): void {
      if (rafId !== null) return
      frameCount = 0
      rafId = requestAnimationFrame(tick)
    },
    stop(): void {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    },
  }

  return api
}

export function useMasterRaf(): MasterRafApi {
  // Create singleton on first call
  if (!instance) {
    instance = createMasterRaf()
  }

  const api = instance

  React.useEffect(() => {
    refCount++
    api.start()
    return () => {
      refCount--
      if (refCount <= 0) {
        refCount = 0
        api.stop()
        // Keep instance alive but stopped — reset for next mount
      }
    }
  }, [api])

  return api
}

// Exported for testing
export function _resetMasterRafInstance(): void {
  if (instance) {
    instance.stop()
  }
  instance = null
  refCount = 0
}
