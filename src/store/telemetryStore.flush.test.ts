import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useTelemetryStore } from './telemetryStore'
import { useSessionStore } from './sessionStore'
import { useCarsPositionStore } from './carsPositionStore'
import { useRaceControlStore } from './raceControlStore'
import type { Lap, LocationRow } from '../api/types'

beforeEach(() => {
  useTelemetryStore.getState().flush()
  useCarsPositionStore.getState().reset()
  useRaceControlStore.getState().reset()
  useSessionStore.setState({
    meeting: null,
    session: null,
    drivers: [],
    decorationAvailable: false,
    affineForDecoration: null,
  })
})

function seedLap(driver_number: number): Lap {
  return {
    session_key: 1,
    driver_number,
    lap_number: 1,
    date_start: '2024-09-01T12:00:00.000Z',
    lap_duration: 90,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    is_pit_out_lap: false,
  }
}

describe('M8 — flush on session change', () => {
  it('clears byDriver when session_key changes', () => {
    useTelemetryStore.getState().appendLap(seedLap(1))
    expect(useTelemetryStore.getState().byDriver.size).toBe(1)

    // Set initial session
    useSessionStore.getState().setSession({
      session_key: 1001,
      meeting_key: 100,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-09-01T12:00:00.000Z',
      date_end: '2024-09-01T14:00:00.000Z',
    })

    // Change to new session key — should flush
    useSessionStore.getState().setSession({
      session_key: 1002,
      meeting_key: 100,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-09-01T15:00:00.000Z',
      date_end: '2024-09-01T17:00:00.000Z',
    })

    expect(useTelemetryStore.getState().byDriver.size).toBe(0)
  })

  it('does not flush when session_key is unchanged', () => {
    const session = {
      session_key: 1001,
      meeting_key: 100,
      session_type: 'Race' as const,
      session_name: 'Race',
      date_start: '2024-09-01T12:00:00.000Z',
      date_end: '2024-09-01T14:00:00.000Z',
    }
    // Set initial session first (null → 1001 triggers flush of empty store, that's fine)
    useSessionStore.getState().setSession(session)

    useTelemetryStore.getState().appendLap(seedLap(1))
    expect(useTelemetryStore.getState().byDriver.size).toBe(1)

    // Set same session again — should NOT flush
    useSessionStore.getState().setSession(session)

    expect(useTelemetryStore.getState().byDriver.size).toBe(1)
  })

  it('also resets carsPositionStore on session_key change', () => {
    const row: LocationRow = {
      session_key: 1,
      driver_number: 1,
      date: '2024-09-01T12:00:00.000Z',
      x: 1,
      y: 2,
      z: 0,
    }
    useCarsPositionStore.getState().apply([row], 1_000_000)
    expect(useCarsPositionStore.getState().byNumber.size).toBe(1)

    useSessionStore.getState().setSession({
      session_key: 3001,
      meeting_key: 300,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-09-01T12:00:00.000Z',
      date_end: '2024-09-01T14:00:00.000Z',
    })
    useSessionStore.getState().setSession({
      session_key: 3002,
      meeting_key: 300,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-09-01T15:00:00.000Z',
      date_end: '2024-09-01T17:00:00.000Z',
    })

    expect(useCarsPositionStore.getState().byNumber.size).toBe(0)
  })

  it('also resets raceControlStore on session_key change', () => {
    useRaceControlStore.getState().appendBatch([
      {
        session_key: 1,
        date: '2024-03-02T13:00:00',
        category: 'Other',
        message: 'SAFETY CAR DEPLOYED',
      },
    ])
    expect(useRaceControlStore.getState().messages).toHaveLength(1)
    expect(useRaceControlStore.getState().safetyCarActive).toBe(true)

    useSessionStore.getState().setSession({
      session_key: 4001,
      meeting_key: 400,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-03-02T12:00:00.000Z',
      date_end: '2024-03-02T14:00:00.000Z',
    })
    useSessionStore.getState().setSession({
      session_key: 4002,
      meeting_key: 400,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-03-09T15:00:00.000Z',
      date_end: '2024-03-09T17:00:00.000Z',
    })

    expect(useRaceControlStore.getState().messages).toHaveLength(0)
    expect(useRaceControlStore.getState().safetyCarActive).toBe(false)
  })

  it('flush is observable via spy', () => {
    // Pre-seed session so the first setSession call below doesn't count as a key change
    useSessionStore.setState({
      meeting: null,
      session: {
        session_key: 2000,
        meeting_key: 200,
        session_type: 'Qualifying',
        session_name: 'Qualifying',
        date_start: '2024-09-01T10:00:00.000Z',
        date_end: '2024-09-01T11:00:00.000Z',
      },
      drivers: [],
      decorationAvailable: false,
      affineForDecoration: null,
    })

    const flushSpy = vi.spyOn(useTelemetryStore.getState(), 'flush')

    // Change to new session key — exactly one flush expected
    useSessionStore.getState().setSession({
      session_key: 2001,
      meeting_key: 200,
      session_type: 'Race',
      session_name: 'Race',
      date_start: '2024-09-01T12:00:00.000Z',
      date_end: '2024-09-01T14:00:00.000Z',
    })

    expect(flushSpy).toHaveBeenCalledTimes(1)
    flushSpy.mockRestore()
  })
})
