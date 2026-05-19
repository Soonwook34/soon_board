// OpenF1 API entity types — snake_case matches wire format

export type EndpointName =
  | 'meetings'
  | 'sessions'
  | 'drivers'
  | 'location'
  | 'intervals'
  | 'laps'
  | 'stints'
  | 'pit'
  | 'position'
  | 'car_data'
  | 'weather'
  | 'race_control'

export class ApiError extends Error {
  status: number
  endpoint: EndpointName
  attempt: number

  constructor(message: string, status: number, endpoint: EndpointName, attempt: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.endpoint = endpoint
    this.attempt = attempt
  }
}

export interface Meeting {
  meeting_key: number
  year: number
  circuit_short_name: string
  country_name: string
  date_start: string
  meeting_name: string
}

export interface Session {
  session_key: number
  meeting_key: number
  session_type: 'Practice' | 'Qualifying' | 'Sprint' | 'Race'
  session_name: string
  date_start: string
  date_end: string
}

export interface Driver {
  driver_number: number
  full_name: string
  name_acronym: string
  team_name: string
  team_colour: string
  headshot_url?: string
}

export interface LocationRow {
  session_key: number
  driver_number: number
  date: string
  x: number
  y: number
  z: number
}

export interface Lap {
  session_key: number
  driver_number: number
  lap_number: number
  date_start: string
  lap_duration: number | null
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  is_pit_out_lap: boolean
  st_speed?: number | null
}

export interface Stint {
  session_key: number
  driver_number: number
  stint_number: number
  lap_start: number
  lap_end: number
  compound: 'SOFT' | 'MEDIUM' | 'HARD' | 'INTERMEDIATE' | 'WET' | 'UNKNOWN'
  tyre_age_at_start: number
}

export interface PitStop {
  session_key: number
  driver_number: number
  lap_number: number
  date: string
  pit_duration: number
}

export interface Interval {
  session_key: number
  driver_number: number
  date: string
  gap_to_leader: number | null | '+1 LAP'
  interval: number | null
}

export interface RacePosition {
  session_key: number
  driver_number: number
  date: string
  position: number
}

export interface Weather {
  session_key: number
  date: string
  air_temperature: number
  track_temperature: number
  humidity: number
  pressure: number
  rainfall: 0 | 1
  wind_speed: number
  wind_direction: number
}

export interface RaceControl {
  session_key: number
  date: string
  category: string
  flag?: string
  lap_number?: number
  driver_number?: number
  message: string
}
