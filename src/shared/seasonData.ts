// 런타임에서 fetch('/seasons/{year}.json')로 받는 카탈로그 JSON의 타입.
// Phase 1 (scripts/_lib/seasonCatalog.ts)의 산출 schema와 동기.
// plan main-page-implementation.md §2.2 그대로.

export interface ResultPreviewDriverRow {
  position: number;
  driver_number: number;
  name_acronym: string;
  team_colour: string;
}

export interface ResultPreview {
  podium: ResultPreviewDriverRow[];
  fastest_lap: {
    driver_number: number;
    name_acronym: string;
    lap_duration: number;
  } | null;
  rainfall_any: boolean;
}

export interface SessionData {
  session_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  is_cancelled?: boolean;
  result_preview?: ResultPreview;
}

export interface MeetingData {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name?: string;
  location?: string;
  country_code?: string;
  country_name?: string;
  country_flag?: string;
  circuit_key?: number;
  circuit_short_name?: string;
  circuit_type?: string;
  circuit_image?: string;
  gmt_offset?: string;
  date_start?: string;
  date_end?: string;
  is_cancelled?: boolean;
  sessions: SessionData[];
}

export interface SeasonData {
  year: number;
  generated_at: string;
  source: string;
  meetings: MeetingData[];
}

export interface SeasonIndexEntry {
  year: number;
  generated_at: string;
  source: string;
}

export interface SeasonsIndex {
  generated_at: string;
  seasons: SeasonIndexEntry[];
}
