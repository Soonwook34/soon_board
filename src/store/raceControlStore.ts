import { create } from 'zustand'
import type { RaceControl } from '../api/types'

// Cap on retained messages — ported from old_project's lesson-learned to
// prevent unbounded growth during long sessions.
export const RACE_CONTROL_BUFFER = 50

export interface RaceControlState {
  messages: RaceControl[]
  activeFlag: string | null
  safetyCarActive: boolean
  vscActive: boolean
}

export interface RaceControlActions {
  appendBatch(rows: RaceControl[]): void
  reset(): void
}

export const useRaceControlStore = create<RaceControlState & RaceControlActions>(
  (set, get) => ({
    messages: [],
    activeFlag: null,
    safetyCarActive: false,
    vscActive: false,

    appendBatch(rows) {
      if (rows.length === 0) return
      const next = [...get().messages, ...rows]
      next.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      while (next.length > RACE_CONTROL_BUFFER) next.shift()

      let sc = get().safetyCarActive
      let vsc = get().vscActive
      let flag = get().activeFlag
      for (const m of rows) {
        const msg = (m.message ?? '').toUpperCase()
        if (msg.includes('SAFETY CAR DEPLOYED')) sc = true
        if (msg.includes('SAFETY CAR IN THIS LAP') || msg.includes('CLEAR')) sc = false
        if (msg.includes('VIRTUAL SAFETY CAR DEPLOYED')) vsc = true
        if (msg.includes('VIRTUAL SAFETY CAR ENDING')) vsc = false
        if (m.flag) flag = m.flag
      }
      set({ messages: next, activeFlag: flag, safetyCarActive: sc, vscActive: vsc })
    },

    reset() {
      set({ messages: [], activeFlag: null, safetyCarActive: false, vscActive: false })
    },
  }),
)
