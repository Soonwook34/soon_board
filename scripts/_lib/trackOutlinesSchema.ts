// public/trackOutlines/{key}-{year}.json schema — Phase 1 (트랙 polyline) +
// Phase 2 (OpenF1 affine) 가 공유. 두 entry script (fetch-circuit-maps,
// extract-openf1-transform) 의 정의 중복을 제거하기 위해 단일 모듈로 분리.
//
// Phase 2 산출 필드 (openf1_transform / confidence / meta) 는 optional —
// Phase 1 단독 산출물도 본 schema 로 표현 가능.

export interface OpenF1AffineJson {
  /** uniform scale (OpenF1 단위 → viewBox 단위). 양수. */
  scale: number;
  /** 회전 (도, [-180, 180]). */
  rotation_deg: number;
  /** viewBox 단위 평행 이동. */
  translate: [number, number];
  /** Y-반사 적용 여부. SVG screen-coord 대응. 미지정 시 false. */
  reflection?: boolean;
}

export interface OpenF1TransformMeta {
  /** 변환된 OpenF1 polyline 의 SVG polyline 까지 평균 거리 (viewBox 단위). */
  rmse: number;
  /** Procrustes 입력 재샘플링 점 개수. */
  sample_count: number;
  source_session_key: number;
  source_session_type: string;
  source_driver_number: number;
  source_lap_number: number;
  source_lap_duration: number;
  extracted_at: string;
  /** 진단용: 최적 cyclic shift index (시작점 정합). */
  shift_index?: number;
  /** 진단용: OpenF1 polyline 역순으로 뒤집어 정합했는지 (CW/CCW 불일치 시 true). */
  reversed?: boolean;
}

/**
 * Phase 8 — public/trackOutlines/pitlane_{key}-{year}.json (browser-facing 필드만).
 * scripts/trace-pitlane.ts 가 산출하고 src/map/pitLane.ts 가 fetch 한다.
 */
export interface PitlaneJsonBase {
  circuit_key: number;
  year: number;
  source: string;
  license: string;
  polyline: readonly (readonly [number, number])[];
  arc_length_table: readonly number[];
  total_length: number;
  generated_at: string;
}

/** scripts/trace-pitlane.ts 가 추가로 기록하는 진단 메타 (browser 는 무시). */
export interface PitlaneJson extends PitlaneJsonBase {
  meta: {
    source_session_key: number;
    source_session_type: string;
    pit_stop_count: number;
    raw_sample_count: number;
    filtered_sample_count: number;
    bucket_width: number;
    extracted_at: string;
  };
}

export interface TrackOutlineJson {
  circuit_key: number;
  year: number;
  circuit_short_name: string;
  country_name: string;
  source: string;
  source_file: string;
  license: string;
  viewBox: readonly [number, number, number, number];
  polyline: readonly (readonly [number, number])[];
  arc_length_table: readonly number[];
  total_length: number;
  start_finish_index: number;
  direction: 'clockwise' | 'counter-clockwise';
  generated_at: string;
  // Phase 2 — optional, set by extract-openf1-transform.ts
  openf1_transform?: OpenF1AffineJson;
  openf1_transform_confidence?: number;
  openf1_transform_meta?: OpenF1TransformMeta;
}
