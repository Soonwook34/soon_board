import { describe, it, expect, beforeEach } from 'vitest'
import { useTimelineStore, globalClockNow } from './timelineStore'

beforeEach(() => {
  useTimelineStore.setState({
    mode: 'live',
    anchorWallTime: performance.now(),
    anchorSessionTime: 0,
    playbackRate: 1,
    isPaused: false,
    serverTimeOffsetMs: 0,
    serverSynced: false,
  })
})

describe('M7 — syncServerTime', () => {
  it('aligns globalClockNow to server time within ±50ms in live mode', () => {
    const serverDate = new Date('2024-09-01T12:00:00.000Z')
    const perfNow = performance.now()

    useTimelineStore.getState().syncServerTime(serverDate, perfNow)

    const state = useTimelineStore.getState()
    const clockMs = globalClockNow(state)

    // Expected: serverDate.getTime() - 3000 (the 3s offset baked in)
    const expected = serverDate.getTime() - 3000
    expect(Math.abs(clockMs - expected)).toBeLessThan(50)
  })

  it('is idempotent — second call is a no-op', () => {
    const serverDate1 = new Date('2024-09-01T12:00:00.000Z')
    const serverDate2 = new Date('2024-09-01T13:00:00.000Z')
    const perfNow = performance.now()

    useTimelineStore.getState().syncServerTime(serverDate1, perfNow)
    const offsetAfterFirst = useTimelineStore.getState().serverTimeOffsetMs

    useTimelineStore.getState().syncServerTime(serverDate2, perfNow)
    const offsetAfterSecond = useTimelineStore.getState().serverTimeOffsetMs

    expect(offsetAfterSecond).toBe(offsetAfterFirst)
    expect(useTimelineStore.getState().serverSynced).toBe(true)
  })

  it('sets serverSynced=true after first call', () => {
    expect(useTimelineStore.getState().serverSynced).toBe(false)
    useTimelineStore.getState().syncServerTime(new Date(), performance.now())
    expect(useTimelineStore.getState().serverSynced).toBe(true)
  })
})
