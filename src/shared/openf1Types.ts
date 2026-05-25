// OpenF1 v1 응답 타입 — DataSource SSOT 보조 (live-map §3.1, dashboard §4.2).
// 본 파일은 인터페이스 SSOT 와 함께 cross-plan 으로 공유된다.
// 필드 명세는 docs/openf1-api-reference.md 와 https://openf1.org/ 에 기반.
// 본 phase(0.5)는 인터페이스 시그니처가 컴파일 통과할 정도의 최소 record 타입만 정의한다.
// 구현체(LiveDataSource/ReplayDataSource, dashboard 패널)가 phase 6/12/13 에서 필드를 확장한다.

// OpenF1 의 date 필드는 ISO 8601 문자열이지만, DataSource 메서드는 Date 객체를 받고 반환한다.
// 어댑터(LiveDataSource/ReplayDataSource)가 fetch 직후 parseISO 로 Date 인스턴스로 변환해 캐시한다.

export type ISODateString = string;

// ── core endpoint records ──────────────────────────────────────────────

export interface LocationRecord {
  date: Date;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  x: number;
  y: number;
  z: number;
}

export interface CarDataRecord {
  date: Date;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  brake: number;
  drs: number;
  n_gear: number;
  rpm: number;
  speed: number;
  throttle: number;
}

export interface DriverRecord {
  driver_number: number;
  session_key: number;
  meeting_key: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string;
  team_colour: string;
  first_name: string;
  last_name: string;
  headshot_url: string | null;
  country_code: string | null;
}

export interface IntervalRecord {
  date: Date;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  /** 앞 차와의 갭(초). 리더는 null. lapped 시 "+1 LAP" 등 문자열 가능. */
  gap_to_leader: number | string | null;
  /** 앞 차와의 간격(초). lapped 시 문자열. */
  interval: number | string | null;
}

export interface LapRecord {
  date_start: Date | null;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  lap_number: number;
  /** 랩이 끝나기 전엔 null. */
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean;
  segments_sector_1: number[];
  segments_sector_2: number[];
  segments_sector_3: number[];
}

export interface MeetingRecord {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_code: string;
  country_name: string;
  country_key: number;
  circuit_key: number;
  circuit_short_name: string;
  gmt_offset: string;
  date_start: Date;
  year: number;
}

export interface PitRecord {
  date: Date;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  lap_number: number;
  /** 핏 레인 전체 시간(초). */
  pit_duration: number | null;
}

export interface PositionRecord {
  date: Date;
  driver_number: number;
  session_key: number;
  meeting_key: number;
  position: number;
}

export interface RaceControlRecord {
  date: Date;
  session_key: number;
  meeting_key: number;
  category: string;
  flag: string | null;
  scope: string | null;
  sector: number | null;
  driver_number: number | null;
  lap_number: number | null;
  message: string;
}

export interface SessionRecord {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: Date;
  date_end: Date;
  gmt_offset: string;
  country_code: string;
  country_name: string;
  location: string;
  circuit_key: number;
  circuit_short_name: string;
  year: number;
}

export interface SessionResultRecord {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  position: number | null;
  number_of_laps: number | null;
  /** 라이브 중 또는 미완 시 null. */
  duration: number | number[] | null;
  gap_to_leader: number | string | number[] | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}

export interface StintRecord {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number;
  compound: string;
  tyre_age_at_start: number;
}

export interface TeamRadioRecord {
  date: Date;
  session_key: number;
  meeting_key: number;
  driver_number: number;
  recording_url: string;
}

export interface WeatherRecord {
  date: Date;
  session_key: number;
  meeting_key: number;
  air_temperature: number;
  humidity: number;
  pressure: number;
  rainfall: number;
  track_temperature: number;
  wind_direction: number;
  wind_speed: number;
}

// ── endpoint → record 매핑 (DataSource generic 사용) ─────────────────────

export interface OpenF1EndpointRecords {
  car_data: CarDataRecord;
  drivers: DriverRecord;
  intervals: IntervalRecord;
  laps: LapRecord;
  location: LocationRecord;
  meetings: MeetingRecord;
  pit: PitRecord;
  position: PositionRecord;
  race_control: RaceControlRecord;
  sessions: SessionRecord;
  session_result: SessionResultRecord;
  stints: StintRecord;
  team_radio: TeamRadioRecord;
  weather: WeatherRecord;
}

export type OpenF1EndpointName = keyof OpenF1EndpointRecords;

// ── aggregate 결과 매핑 (DataSource.getAggregateBefore) ──────────────────
//
// dashboard §2.8 빠른 랩 배지 / 보라색 섹터 등 누적 통계. live-map 단독으로는 사용하지 않으나
// SSOT 인터페이스가 dashboard 메서드까지 포괄해야 하므로 placeholder 형태로 정의.
// 실제 산출 로직은 dashboard 단계 3 (`derived/personalBests.ts` 등) 에서 확정.

export interface FastestLapAggregate {
  driver_number: number;
  name_acronym: string;
  lap_number: number;
  lap_duration: number;
}

export interface PurpleSectorRow {
  driver_number: number;
  name_acronym: string;
  sector_duration: number;
}

export interface PurpleSectorsAggregate {
  s1: PurpleSectorRow | null;
  s2: PurpleSectorRow | null;
  s3: PurpleSectorRow | null;
}

export interface PersonalBestRow {
  driver_number: number;
  lap_number: number;
  lap_duration: number;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
}

export interface AggregateResults {
  fastest_lap: FastestLapAggregate | null;
  purple_sectors: PurpleSectorsAggregate;
  /** driver_number → PersonalBestRow 매핑. dashboard §3.3 / §2.8 보조. */
  personal_bests: Map<number, PersonalBestRow>;
}

export type AggregateName = keyof AggregateResults;
