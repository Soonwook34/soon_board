import { useEffect, useMemo, useState } from 'react'
import { AppShell } from './components/Shell/AppShell'
import { Header } from './components/Shell/Header'
import { Calendar } from './components/Playback/Calendar'
import { PlaybackBar } from './components/Playback/PlaybackBar'
import { CircuitMap } from './components/Map/CircuitMap'
import { Leaderboard } from './components/Leaderboard/Leaderboard'
import { OpenF1Client } from './api/client'
import { Poller } from './scheduler/poller'
import { useTimelineStore } from './store/timelineStore'
import { useSessionStore } from './store/sessionStore'
import { useTelemetryStore } from './store/telemetryStore'
import { getDrivers, getLocation } from './api/endpoints'
import type { Meeting, Session } from './api/types'

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

    const p = new Poller({
      client,
      sessionKey: session.session_key,
      handlers: {
        onLocation: (rows) => useTelemetryStore.getState().appendLocationBatch(rows),
        onIntervals: () => {},
        onRaceControl: () => {},
        onPosition: () => {},
        onLaps: (rows) => rows.forEach((l) => useTelemetryStore.getState().appendLap(l)),
        onPit: (rows) => rows.forEach((pit) => useTelemetryStore.getState().appendPit(pit)),
        onStints: (rows) => rows.forEach((s) => useTelemetryStore.getState().appendStint(s)),
        onWeather: () => {},
        onError: (ep, err) => console.error('[poller]', ep, err),
      },
    })
    p.start()
    setPoller(p)

    Promise.all([
      getDrivers(client, { session_key: session.session_key }),
      getLocation(client, { session_key: session.session_key }),
    ])
      .then(([drvs, locs]) => {
        useSessionStore.getState().setDrivers(drvs)
        const firstDriver = drvs[0]?.driver_number
        if (firstDriver) {
          const oneLap = locs
            .filter((l) => l.driver_number === firstDriver)
            .slice(0, 333)
            .map((l) => ({ t: Date.parse(l.date), x: l.x, y: l.y }))
          setSubstrateSamples(oneLap)
        }
      })
      .catch((err) => console.error('[bootstrap]', err))

    return () => p.stop()
  }, [session, client])

  function pickSession(m: Meeting, s: Session) {
    useSessionStore.getState().setMeeting(m)
    useSessionStore.getState().setSession(s)
    useTimelineStore.getState().setMode('live')
    setCalendarOpen(false)
  }

  return (
    <AppShell
      header={<Header meetingLabel={meeting?.meeting_name} sessionLabel={session?.session_name} />}
      map={
        session && substrateSamples.length > 0 ? (
          <CircuitMap session={session} drivers={drivers} substrateSamples={substrateSamples} />
        ) : (
          <EmptyMap />
        )
      }
      leaderboard={<Leaderboard />}
      footer={poller ? <PlaybackBar client={client} poller={poller} /> : null}
      overlay={
        calendarOpen ? (
          <Calendar
            client={client}
            onPick={pickSession}
            onClose={() => setCalendarOpen(false)}
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
