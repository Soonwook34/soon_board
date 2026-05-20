import { describe, it, expect, beforeEach } from 'vitest'
import {
  useRaceControlStore,
  RACE_CONTROL_BUFFER,
} from './raceControlStore'
import type { RaceControl } from '../api/types'

function msg(date: string, message: string, extra: Partial<RaceControl> = {}): RaceControl {
  return {
    session_key: 9161,
    date,
    category: 'Other',
    message,
    ...extra,
  }
}

beforeEach(() => {
  useRaceControlStore.getState().reset()
})

describe('raceControlStore', () => {
  it('starts empty with no flag and no SC/VSC active', () => {
    const s = useRaceControlStore.getState()
    expect(s.messages).toHaveLength(0)
    expect(s.activeFlag).toBeNull()
    expect(s.safetyCarActive).toBe(false)
    expect(s.vscActive).toBe(false)
  })

  it('appendBatch appends messages in date order', () => {
    const rows: RaceControl[] = [
      msg('2024-03-02T13:05:00', 'second'),
      msg('2024-03-02T13:00:00', 'first'),
    ]
    useRaceControlStore.getState().appendBatch(rows)
    const messages = useRaceControlStore.getState().messages
    expect(messages.map((m) => m.message)).toEqual(['first', 'second'])
  })

  it('enforces RACE_CONTROL_BUFFER cap, evicting oldest first', () => {
    const overflow: RaceControl[] = Array.from({ length: RACE_CONTROL_BUFFER + 25 }, (_, i) =>
      msg(`2024-03-02T13:${String(i % 60).padStart(2, '0')}:00`, `m${i}`),
    )
    useRaceControlStore.getState().appendBatch(overflow)
    expect(useRaceControlStore.getState().messages).toHaveLength(RACE_CONTROL_BUFFER)
  })

  it('sets safetyCarActive on SAFETY CAR DEPLOYED and clears on IN THIS LAP', () => {
    useRaceControlStore.getState().appendBatch([msg('2024-03-02T13:00:00', 'SAFETY CAR DEPLOYED')])
    expect(useRaceControlStore.getState().safetyCarActive).toBe(true)
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:05:00', 'SAFETY CAR IN THIS LAP')])
    expect(useRaceControlStore.getState().safetyCarActive).toBe(false)
  })

  it('sets vscActive on VIRTUAL SAFETY CAR DEPLOYED and clears on ENDING', () => {
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:00:00', 'VIRTUAL SAFETY CAR DEPLOYED')])
    expect(useRaceControlStore.getState().vscActive).toBe(true)
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:05:00', 'VIRTUAL SAFETY CAR ENDING')])
    expect(useRaceControlStore.getState().vscActive).toBe(false)
  })

  it('records the most recent flag from messages that carry one', () => {
    useRaceControlStore
      .getState()
      .appendBatch([
        msg('2024-03-02T13:00:00', 'Yellow Sector 3', { flag: 'YELLOW' }),
        msg('2024-03-02T13:05:00', 'Track cleared', { flag: 'GREEN' }),
      ])
    expect(useRaceControlStore.getState().activeFlag).toBe('GREEN')
  })

  it('reset clears messages and derived flags', () => {
    useRaceControlStore
      .getState()
      .appendBatch([msg('2024-03-02T13:00:00', 'SAFETY CAR DEPLOYED', { flag: 'YELLOW' })])
    useRaceControlStore.getState().reset()
    const s = useRaceControlStore.getState()
    expect(s.messages).toHaveLength(0)
    expect(s.activeFlag).toBeNull()
    expect(s.safetyCarActive).toBe(false)
    expect(s.vscActive).toBe(false)
  })

  it('appendBatch with empty array is a no-op', () => {
    useRaceControlStore.getState().appendBatch([])
    const s = useRaceControlStore.getState()
    expect(s.messages).toHaveLength(0)
    expect(s.activeFlag).toBeNull()
  })
})
