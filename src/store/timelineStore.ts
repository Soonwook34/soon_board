import { create } from 'zustand'

export interface TimelineState {
  mode: 'live' | 'playback'
  anchorWallTime: number
  anchorSessionTime: number
  playbackRate: 1 | 2 | 5
  isPaused: boolean
  serverTimeOffsetMs: number
  serverSynced: boolean
}

interface TimelineActions {
  syncServerTime(serverDate: Date, clientPerfNowMs: number): void
  setMode(mode: 'live' | 'playback'): void
  setRate(r: 1 | 2 | 5): void
  scrubTo(sessionMs: number): void
  togglePause(): void
}

export type TimelineStore = TimelineState & TimelineActions

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  mode: 'live',
  anchorWallTime: performance.now(),
  anchorSessionTime: 0,
  playbackRate: 1,
  isPaused: false,
  serverTimeOffsetMs: 0,
  serverSynced: false,

  syncServerTime(serverDate: Date, clientPerfNowMs: number): void {
    if (get().serverSynced) return
    const serverTimeOffsetMs =
      serverDate.getTime() - (performance.timeOrigin + clientPerfNowMs) - 3000
    set({ serverTimeOffsetMs, serverSynced: true })
  },

  setMode(mode: 'live' | 'playback'): void {
    set({
      mode,
      anchorWallTime: performance.now(),
      anchorSessionTime: globalClockNow(get()),
    })
  },

  setRate(r: 1 | 2 | 5): void {
    set({
      playbackRate: r,
      anchorWallTime: performance.now(),
      anchorSessionTime: globalClockNow(get()),
    })
  },

  scrubTo(sessionMs: number): void {
    set({
      anchorSessionTime: sessionMs,
      anchorWallTime: performance.now(),
    })
  },

  togglePause(): void {
    const state = get()
    if (!state.isPaused) {
      // Freezing: capture current session time
      set({ isPaused: true, anchorSessionTime: globalClockNow(state) })
    } else {
      // Resuming: re-anchor wall time
      set({ isPaused: false, anchorWallTime: performance.now() })
    }
  },
}))

export function globalClockNow(state: TimelineState): number {
  if (state.mode === 'live') {
    return performance.timeOrigin + performance.now() + state.serverTimeOffsetMs
  }
  if (state.isPaused) return state.anchorSessionTime
  const elapsedWall = performance.now() - state.anchorWallTime
  return state.anchorSessionTime + elapsedWall * state.playbackRate
}

export function selectGlobalClockNow(state: TimelineStore): number {
  return globalClockNow(state)
}
