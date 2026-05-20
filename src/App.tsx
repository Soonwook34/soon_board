import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/Shell/AppShell'
import { Header } from './components/Shell/Header'
import { Calendar } from './components/Playback/Calendar'
import { PlaybackBar } from './components/Playback/PlaybackBar'
import { CircuitMap } from './components/Map/CircuitMap'
import { Leaderboard } from './components/Leaderboard/Leaderboard'
import { OpenF1Client } from './api/client'
import { Poller } from './scheduler/poller'
import { RENDER_BUFFER_MS } from './hooks/useMasterRaf'
import { useTimelineStore, globalClockNow } from './store/timelineStore'
import { useSessionStore } from './store/sessionStore'
import { useTelemetryStore } from './store/telemetryStore'
import { useCarsPositionStore } from './store/carsPositionStore'
import { useLeaderboardStore, computeLeaderLap } from './store/leaderboardStore'
import { useRaceControlStore } from './store/raceControlStore'
import { RaceInfoPanel } from './components/Panels/RaceInfoPanel'
import { getDrivers, getLocation } from './api/endpoints'
import { getSessionStatus, parseOpenF1DateMs, toOpenF1Iso } from './utils/sessionStatus'
import type { Interval, Meeting, RacePosition, Session } from './api/types'

const SUBSTRATE_WINDOW_MS = 10 * 60 * 1000
const BOOTSTRAP_WINDOW_MS = 60 * 1000

export default function App() {
  const [calendarOpen, setCalendarOpen] = useState(true)

  const client = useMemo(
    () =>
      new OpenF1Client({
        onServerDate: (d, perfNow) => useTimelineStore.getState().syncServerTime(d, perfNow),
      }),
    [],
  )

  const meeting = useSessionStore((s) => s.meeting)
  const session = useSessionStore((s) => s.session)
  const drivers = useSessionStore((s) => s.drivers)

  const [substrateSamples, setSubstrateSamples] = useState<
    { t: number; x: number; y: number }[]
  >([])

  const [poller, setPoller] = useState<Poller | null>(null)

  useEffect(() => {
    if (!session) return

    const sessionStartIso = toOpenF1Iso(session.date_start)
    const sessionStartMs = parseOpenF1DateMs(session.date_start)
    const substrateEndIso = new Date(sessionStartMs + SUBSTRATE_WINDOW_MS).toISOString()

    setSubstrateSamples([])

    const latestIntervals: { current: Interval[] } = { current: [] }
    const latestPositions: { current: RacePosition[] } = { current: [] }

    const recompute = () => {
      const telemetry = useTelemetryStore.getState().byDriver
      useLeaderboardStore
        .getState()
        .recompute(
          latestIntervals.current,
          latestPositions.current,
          useSessionStore.getState().drivers,
          telemetry,
          computeLeaderLap(telemetry),
        )
    }

    const pickLatestPerDriver = <T extends { driver_number: number; date: string }>(
      rows: T[],
    ): T[] => {
      const map = new Map<number, T>()
      for (const r of rows) {
        const prev = map.get(r.driver_number)
        if (!prev || parseOpenF1DateMs(r.date) > parseOpenF1DateMs(prev.date)) {
          map.set(r.driver_number, r)
        }
      }
      return Array.from(map.values())
    }

    const p = new Poller({
      client,
      sessionKey: session.session_key,
      // Playback head (or wall clock in live). Poller clips time-filterable
      // fetches to [until - 2*interval, until] so we naturally get new slices
      // as the global clock advances, and scrubbing past a buffered range
      // triggers a fresh fetch on the next tick.
      until: () => globalClockNow(useTimelineStore.getState()),
      handlers: {
        onLocation: (rows) => {
          useCarsPositionStore
            .getState()
            .apply(rows, globalClockNow(useTimelineStore.getState()))
        },
        onIntervals: (rows) => {
          latestIntervals.current = pickLatestPerDriver(rows)
          recompute()
        },
        onRaceControl: (rows) => useRaceControlStore.getState().appendBatch(rows),
        onPosition: (rows) => {
          latestPositions.current = pickLatestPerDriver(rows)
          recompute()
        },
        onLaps: (rows) => {
          rows.forEach((l) => useTelemetryStore.getState().appendLap(l))
          recompute()
        },
        onPit: (rows) => {
          rows.forEach((pit) => useTelemetryStore.getState().appendPit(pit))
          recompute()
        },
        onStints: (rows) => {
          rows.forEach((s) => useTelemetryStore.getState().appendStint(s))
          recompute()
        },
        onWeather: () => {},
        onError: (ep, err) => console.error('[poller]', ep, err),
      },
    })

    getDrivers(client, { session_key: session.session_key })
      .then((drvs) => {
        useSessionStore.getState().setDrivers(drvs)
        recompute()
      })
      .catch((err) => console.error('[drivers]', err))

    // Substrate (track polyline outline) — small one-shot window from session start
    getLocation(client, {
      session_key: session.session_key,
      date_gte: sessionStartIso,
      date_lte: substrateEndIso,
    })
      .then((locs) => {
        const firstDriver = locs[0]?.driver_number
        if (!firstDriver) return
        const lap = locs
          .filter((l) => l.driver_number === firstDriver)
          .slice(0, 500)
          .map((l) => ({ t: parseOpenF1DateMs(l.date), x: l.x, y: l.y }))
        setSubstrateSamples(lap)
      })
      .catch((err) => console.error('[substrate]', err))

    // Bootstrap: seed a window around the playback anchor so the user sees
    // data immediately. Start RENDER_BUFFER_MS behind the anchor so the marker
    // render target (anchor - RENDER_BUFFER_MS) lands inside the seeded buffer
    // rather than at the empty left edge.
    const anchorMs = globalClockNow(useTimelineStore.getState())
    p.refetchWindow(anchorMs - RENDER_BUFFER_MS, anchorMs + BOOTSTRAP_WINDOW_MS).catch((err) =>
      console.error('[bootstrap]', err),
    )

    p.start()
    setPoller(p)

    return () => p.stop()
  }, [session, client])

  function pickSession(m: Meeting, s: Session) {
    useSessionStore.getState().setMeeting(m)
    useSessionStore.getState().setSession(s)
    const status = getSessionStatus(s.date_start, s.date_end)
    if (status === 'live') {
      useTimelineStore.getState().setMode('live')
    } else {
      useTimelineStore.getState().setMode('playback')
      useTimelineStore.getState().scrubTo(parseOpenF1DateMs(s.date_start))
    }
    setCalendarOpen(false)
  }

  return (
    <AppShell
      header={<Header meetingLabel={meeting?.meeting_name} sessionLabel={session?.session_name} />}
      map={
        session && substrateSamples.length > 0 ? (
          <CircuitMap
            session={session}
            drivers={drivers}
            substrateSamples={substrateSamples}
            circuitShortName={meeting?.circuit_short_name}
          />
        ) : (
          <EmptyMap />
        )
      }
      leaderboard={
        <div className="flex flex-col h-full min-h-0">
          <RaceInfoPanel />
          <Leaderboard />
        </div>
      }
      footer={poller ? <PlaybackBar client={client} poller={poller} /> : null}
      overlay={
        calendarOpen ? (
          <Calendar
            client={client}
            onPick={pickSession}
            onClose={() => setCalendarOpen(false)}
            currentSessionDateStart={session?.date_start}
          />
        ) : null
      }
    />
  )
}

function EmptyMap() {
  return (
    <div className="flex items-center justify-center h-full text-soon-muted">
      세션을 선택해 주세요
    </div>
  )
}
