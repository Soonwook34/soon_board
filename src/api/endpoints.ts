import type { OpenF1Client } from './client'
import type {
  Meeting,
  Session,
  Driver,
  LocationRow,
  Interval,
  Lap,
  Stint,
  PitStop,
  RacePosition,
  Weather,
  RaceControl,
} from './types'

export const getMeetings = (c: OpenF1Client, params: { year: number }) =>
  c.fetchJson<Meeting[]>('/meetings', params)

export const getSessions = (
  c: OpenF1Client,
  params: { meeting_key: number } | { year: number },
) => c.fetchJson<Session[]>('/sessions', params as Record<string, string | number>)

export const getDrivers = (c: OpenF1Client, params: { session_key: number }) =>
  c.fetchJson<Driver[]>('/drivers', params)

export const getLocation = (
  c: OpenF1Client,
  params: { session_key: number; date_gte?: string; date_lte?: string },
) => c.fetchJson<LocationRow[]>('/location', flatParams(params))

export const getIntervals = (
  c: OpenF1Client,
  params: { session_key: number; date_gte?: string; date_lte?: string },
) => c.fetchJson<Interval[]>('/intervals', flatParams(params))

export const getLaps = (
  c: OpenF1Client,
  params: { session_key: number; driver_number?: number; lap_number?: number },
) => c.fetchJson<Lap[]>('/laps', flatParams(params))

export const getStints = (c: OpenF1Client, params: { session_key: number }) =>
  c.fetchJson<Stint[]>('/stints', params)

export const getPit = (c: OpenF1Client, params: { session_key: number }) =>
  c.fetchJson<PitStop[]>('/pit', params)

export const getPosition = (
  c: OpenF1Client,
  params: { session_key: number; date_gte?: string; date_lte?: string },
) => c.fetchJson<RacePosition[]>('/position', flatParams(params))

export const getCarData = (
  c: OpenF1Client,
  params: { session_key: number; driver_number?: number; date_gte?: string; date_lte?: string },
) => c.fetchJson<Record<string, unknown>[]>('/car_data', flatParams(params))

export const getWeather = (c: OpenF1Client, params: { session_key: number }) =>
  c.fetchJson<Weather[]>('/weather', params)

export const getRaceControl = (
  c: OpenF1Client,
  params: { session_key: number; date_gte?: string; date_lte?: string },
) => c.fetchJson<RaceControl[]>('/race_control', flatParams(params))

// Helper: remove undefined values from param objects
function flatParams(
  params: Record<string, string | number | undefined>,
): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) out[k] = v
  }
  return out
}
