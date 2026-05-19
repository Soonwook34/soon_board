import { create } from 'zustand'
import type { Meeting, Session, Driver } from '../api/types'
import { useTelemetryStore } from './telemetryStore'

export interface Affine {
  a: number
  b: number
  c: number
  d: number
  tx: number
  ty: number
}

interface SessionState {
  meeting: Meeting | null
  session: Session | null
  drivers: Driver[]
  decorationAvailable: boolean
  affineForDecoration: Affine | null
}

interface SessionActions {
  setMeeting(m: Meeting | null): void
  setSession(s: Session | null): void
  setDrivers(d: Driver[]): void
  setDecoration(available: boolean, affine: Affine | null): void
}

export const useSessionStore = create<SessionState & SessionActions>((set, get) => ({
  meeting: null,
  session: null,
  drivers: [],
  decorationAvailable: false,
  affineForDecoration: null,

  setMeeting(m: Meeting | null): void {
    set({ meeting: m })
  },

  setSession(s: Session | null): void {
    const current = get().session
    const keyChanged = s?.session_key !== current?.session_key
    if (keyChanged) {
      useTelemetryStore.getState().flush()
    }
    set({ session: s })
  },

  setDrivers(d: Driver[]): void {
    set({ drivers: d })
  },

  setDecoration(available: boolean, affine: Affine | null): void {
    set({ decorationAvailable: available, affineForDecoration: affine })
  },
}))
