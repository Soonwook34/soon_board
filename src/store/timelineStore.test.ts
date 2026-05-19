import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTimelineStore, globalClockNow } from './timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    mode: 'playback',
    anchorWallTime: 0,
    anchorSessionTime: 0,
    playbackRate: 1,
    isPaused: false,
    serverTimeOffsetMs: 0,
    serverSynced: false,
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('globalClockNow - playback mode', () => {
  it('advances monotonically while playing', () => {
    const state = useTimelineStore.getState()
    const t1 = globalClockNow(state)
    vi.advanceTimersByTime(100)
    const t2 = globalClockNow(useTimelineStore.getState())
    expect(t2).toBeGreaterThan(t1)
  })

  it('freezes when paused', () => {
    useTimelineStore.getState().togglePause()
    const state = useTimelineStore.getState()
    const t1 = globalClockNow(state)
    vi.advanceTimersByTime(500)
    const t2 = globalClockNow(useTimelineStore.getState())
    expect(t2).toBe(t1)
  })

  it('re-anchors on mode flip', () => {
    useTimelineStore.setState({ anchorSessionTime: 5000, anchorWallTime: performance.now() - 1000 })
    const before = globalClockNow(useTimelineStore.getState())
    useTimelineStore.getState().setMode('live')
    const after = globalClockNow(useTimelineStore.getState())
    // In live mode it uses wall clock — result should differ from playback snapshot
    expect(after).not.toBe(before)
  })

  it('advances session-time at 2x wall-time when rate=2', () => {
    // Mock performance.now so we control elapsed wall time precisely
    const base = 1000
    let mockNow = base
    vi.spyOn(performance, 'now').mockImplementation(() => mockNow)

    useTimelineStore.setState({
      anchorWallTime: base,
      anchorSessionTime: 0,
      playbackRate: 2,
    })

    // Advance mock wall time by 100ms
    mockNow = base + 100

    const state = useTimelineStore.getState()
    const sessionMs = globalClockNow(state)
    // elapsedWall = 100ms, rate = 2 → sessionMs = 200
    expect(sessionMs).toBeCloseTo(200, 0)

    vi.restoreAllMocks()
  })

  it('setRate re-anchors before changing rate', () => {
    useTimelineStore.setState({
      anchorWallTime: performance.now() - 1000,
      anchorSessionTime: 1000,
      playbackRate: 1,
    })
    // After 1000ms wall at rate 1, session should be ~2000
    const before = globalClockNow(useTimelineStore.getState())
    useTimelineStore.getState().setRate(2)
    // After setRate, anchorSessionTime should equal `before`
    const newState = useTimelineStore.getState()
    expect(newState.anchorSessionTime).toBeCloseTo(before, -1)
  })
})

describe('scrubTo', () => {
  it('sets anchorSessionTime and resets anchorWallTime', () => {
    const before = performance.now()
    useTimelineStore.getState().scrubTo(99000)
    const after = performance.now()
    const state = useTimelineStore.getState()
    expect(state.anchorSessionTime).toBe(99000)
    // anchorWallTime should be between the snapshots taken before and after the call
    expect(state.anchorWallTime).toBeGreaterThanOrEqual(before)
    expect(state.anchorWallTime).toBeLessThanOrEqual(after + 1)
  })
})
