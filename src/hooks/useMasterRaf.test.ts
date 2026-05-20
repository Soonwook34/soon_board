import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMasterRaf, _resetMasterRafInstance, RENDER_BUFFER_MS } from './useMasterRaf'
import type { MarkerRefRegistration } from './useMasterRaf'
import { useTimelineStore, globalClockNow } from '../store/timelineStore'
import React from 'react'

// We need to mock requestAnimationFrame manually
let rafCallbacks: ((t: number) => void)[] = []
let rafIdCounter = 0

function mockRaf(cb: (t: number) => void): number {
  rafCallbacks.push(cb)
  return ++rafIdCounter
}

function mockCancelRaf(id: number) {
  // no-op in tests; we control the callbacks array
  void id
}

function flushRaf(timestamp = performance.now()) {
  const cbs = rafCallbacks.slice()
  rafCallbacks = []
  for (const cb of cbs) {
    cb(timestamp)
  }
}

beforeEach(() => {
  rafCallbacks = []
  rafIdCounter = 0
  vi.stubGlobal('requestAnimationFrame', mockRaf)
  vi.stubGlobal('cancelAnimationFrame', mockCancelRaf)
  _resetMasterRafInstance()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _resetMasterRafInstance()
})

function makeRef(): React.RefObject<SVGGElement> {
  const el = {
    setAttribute: vi.fn(),
  } as unknown as SVGGElement
  return { current: el } as React.RefObject<SVGGElement>
}

function makeReg(driverNumber: number, samples: { t: number; x: number; y: number }[]): MarkerRefRegistration & { ref: React.RefObject<SVGGElement> } {
  return {
    driverNumber,
    ref: makeRef(),
    getSamples: () => samples,
  }
}

describe('useMasterRaf', () => {
  it('calls setAttribute once per registered marker per tick', () => {
    const { result } = renderHook(() => useMasterRaf())
    const api = result.current

    const now = performance.now()
    const samples1 = [
      { t: now - 100, x: 0, y: 0 },
      { t: now + 100, x: 10, y: 10 },
    ]
    const samples2 = [
      { t: now - 100, x: 20, y: 20 },
      { t: now + 100, x: 30, y: 30 },
    ]

    const reg1 = makeReg(1, samples1)
    const reg2 = makeReg(2, samples2)

    act(() => {
      api.register(reg1)
      api.register(reg2)
    })

    act(() => {
      flushRaf(performance.now())
    })

    expect((reg1.ref.current as unknown as { setAttribute: ReturnType<typeof vi.fn> }).setAttribute).toHaveBeenCalledTimes(1)
    expect((reg2.ref.current as unknown as { setAttribute: ReturnType<typeof vi.fn> }).setAttribute).toHaveBeenCalledTimes(1)
  })

  it('skips setAttribute calls when isApplying is true', () => {
    const { result } = renderHook(() => useMasterRaf())
    const api = result.current

    const now = performance.now()
    const samples = [
      { t: now - 100, x: 0, y: 0 },
      { t: now + 100, x: 10, y: 10 },
    ]
    const reg = makeReg(1, samples)

    act(() => {
      api.register(reg)
    })

    // Set isApplying = true
    act(() => {
      api.isApplying.current = true
    })

    act(() => {
      flushRaf(performance.now())
    })

    const setAttr = (reg.ref.current as unknown as { setAttribute: ReturnType<typeof vi.fn> }).setAttribute
    expect(setAttr).toHaveBeenCalledTimes(0)
  })

  it('updates markers only once per 2 rAF ticks at 30fps', () => {
    const { result } = renderHook(() => useMasterRaf())
    const api = result.current

    const now = performance.now()
    const samples = [
      { t: now - 100, x: 0, y: 0 },
      { t: now + 1000, x: 100, y: 100 },
    ]
    const reg = makeReg(1, samples)

    act(() => {
      api.register(reg)
      api.setTargetFps(30)
    })

    // Flush 2 ticks — at 30fps, only every other frame runs
    act(() => {
      flushRaf(performance.now())
      flushRaf(performance.now())
    })

    const setAttr = (reg.ref.current as unknown as { setAttribute: ReturnType<typeof vi.fn> }).setAttribute
    // frameCount starts at 0, then increments to 1 (odd, skip), 2 (even, run)
    // So after 2 ticks, exactly 1 setAttribute call
    expect(setAttr).toHaveBeenCalledTimes(1)
  })

  it('targets samples behind globalClockNow by RENDER_BUFFER_MS (lerp instead of freeze)', () => {
    const { result } = renderHook(() => useMasterRaf())
    const api = result.current

    // The tick reads globalClockNow once and subtracts RENDER_BUFFER_MS.
    // Place samples that bracket the *buffered* target — both behind wall
    // clock. Without the buffer, both samples sit in the past → freeze at
    // last sample (x=100). With the buffer, target ≈ midpoint → lerp x≈50.
    const clockNow = globalClockNow(useTimelineStore.getState())
    const target = clockNow - RENDER_BUFFER_MS
    const samples = [
      { t: target - 1000, x: 0, y: 0 },
      { t: target + 1000, x: 100, y: 100 },
    ]
    const reg = makeReg(1, samples)

    act(() => {
      api.register(reg)
    })

    act(() => {
      flushRaf(performance.now())
    })

    const setAttr = (reg.ref.current as unknown as { setAttribute: ReturnType<typeof vi.fn> }).setAttribute
    expect(setAttr).toHaveBeenCalledTimes(1)
    const transform = setAttr.mock.calls[0][1] as string
    const match = transform.match(/translate\(([-\d.]+),([-\d.]+)\)/)
    expect(match).not.toBeNull()
    const x = parseFloat(match![1])
    // Lerped x must be strictly between the two sample x values.
    expect(x).toBeGreaterThan(10)
    expect(x).toBeLessThan(90)
  })

  it('exposes setTrackLength on the API', () => {
    const { result } = renderHook(() => useMasterRaf())
    const api = result.current
    expect(typeof api.setTrackLength).toBe('function')
    // Should not throw with valid input
    expect(() => api.setTrackLength(1000)).not.toThrow()
    // Negative values are clamped to 0 internally — should not throw
    expect(() => api.setTrackLength(-5)).not.toThrow()
  })
})
