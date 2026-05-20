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
      // Dedup against the existing buffer so overlapping polling windows do
      // not push the same row twice. Key intentionally excludes mutable fields
      // like `lap_number` so a late-arriving row with the same logical content
      // collapses onto the original.
      const keyOf = (m: RaceControl) =>
        `${m.date}|${m.category ?? ''}|${m.message ?? ''}|${m.driver_number ?? ''}`
      const existing = get().messages
      const seen = new Set(existing.map(keyOf))
      const fresh: RaceControl[] = []
      for (const r of rows) {
        const k = keyOf(r)
        if (seen.has(k)) continue
        seen.add(k)
        fresh.push(r)
      }
      if (fresh.length === 0) return

      const next = [...existing, ...fresh]
      next.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      while (next.length > RACE_CONTROL_BUFFER) next.shift()

      let sc = get().safetyCarActive
      let vsc = get().vscActive
      let flag = get().activeFlag
      for (const m of fresh) {
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
