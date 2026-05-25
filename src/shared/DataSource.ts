// DataSource SSOT — live-map §3.1 + dashboard §4.2 (critic M1 단일 진실 원천).
// 본 파일은 live-map plan §10 단계 0.5 의 산출물로 **인터페이스만** 정의한다.
// 구현체(LiveDataSource/ReplayDataSource)는 live-map 단계 6 / 12 / 13 에서 작성된다.
// dashboard 패널들은 본 파일에서 직접 import 한다 — interface drift 차단.

import type {
  AggregateName,
  AggregateResults,
  LapRecord,
  OpenF1EndpointName,
  OpenF1EndpointRecords,
  StintRecord,
} from './openf1Types';

// ── 보간 단위 ────────────────────────────────────────────────────────────

/** location 보간 단위 (live-map §3.1) — Date 는 UTC, x/y/z 는 OpenF1 단위(1/10 m). */
export interface LocationSample {
  date: Date;
  x: number;
  y: number;
  z: number;
}

/**
 * 차량별 보간 sample 쌍.
 * - 두 sample 모두 있음 → 일반 보간 가능
 * - s2 가 null → 마지막 sample 만 있음 (가장 최근 위치 freeze)
 * - 전체 null 반환 (외부 별도) → 아직 sample 0건
 */
export type SamplePair =
  | { s1: LocationSample; s2: LocationSample }
  | { s1: LocationSample; s2: null }
  | null;

// ── 스트림 상태 ─────────────────────────────────────────────────────────

/**
 * - `buffering`: 초기 hydration 진행 중 (워밍업)
 * - `live`: 정상. display_time 이 newest_received_date - 30s 로 진행
 * - `lagging`: newest_received_date 가 갱신되지만 cadence 가 느려짐 (≥1 cycle skip)
 * - `stalled`: ≥5s 신규 sample 없음. UI 에 "데이터 끊김" 표시
 *
 * 본 enum 은 LiveDataSource 정상화 의미. ReplayDataSource 는 항상 `live` 또는 `buffering`.
 */
export type StreamState = 'live' | 'lagging' | 'stalled' | 'buffering';

// ── DataSource 인터페이스 ───────────────────────────────────────────────

/**
 * 라이브/리플레이 공용 데이터 어댑터. 본 인터페이스는 두 모드의 시계·버퍼 차이를
 * 렌더러/패널에게서 숨긴다. 모든 메서드의 시간 컷은 **`date ≤ t` (등호 포함)** 기준이며
 * 미래 누설을 절대 발생시키지 않는다 (dashboard §4.5 미래 누설 zero).
 *
 * 구현 책임:
 * - LiveDataSource: live-streaming-strategy §3.1·§8.1 cadence 로 브라우저 REST 폴 → ring buffer
 *   (live-map 단계 12, hydration → cadence 직렬, critic P0-5)
 * - ReplayDataSource: replay-strategy §5·§8.1 60s 윈도우 메모리 캐시 (live-map 단계 13)
 */
export interface DataSource {
  // ── 공통 (live-map §3.1 / live-map 렌더러 사용) ─────────────────────

  /** 현재 표시되어야 할 UTC 시각. 라이브: newest_received_date - 30s. 리플레이: playback_clock. */
  getDisplayTime(): Date;

  /**
   * 차량별 ring/window buffer 에서 `t` 부근의 sample 쌍을 반환.
   * - 두 sample 사이에 있으면 `{s1, s2}` (보간 가능)
   * - 마지막 sample 만 있으면 `{s1, s2: null}` (freeze)
   * - sample 0건 또는 가라지 sentinel 만 있으면 `null` (마커 미표시)
   */
  getSamplePair(driverNumber: number, t: Date): SamplePair;

  /** 스트림 상태. UI 배지/오버레이가 구독. */
  getStreamState(): StreamState;

  /**
   * `display_time` 변경을 구독. RAF/throttle 이전 단계 이벤트.
   * 반환된 함수를 호출하면 구독 해제.
   */
  onDisplayTimeChange(handler: (t: Date) => void): () => void;

  // ── 대시보드 패널용 (dashboard §4.2, critic M1) ───────────────────────

  /**
   * `date ≤ t` 인 가장 최근 record 1건. 없으면 null.
   * filters 는 endpoint 별 추가 술어 (예: `{driver_number: 44}`).
   */
  getLatestBefore<E extends OpenF1EndpointName>(
    endpoint: E,
    t: Date,
    filters?: Partial<OpenF1EndpointRecords[E]>,
  ): OpenF1EndpointRecords[E] | null;

  /**
   * `date ≤ t` 인 모든 records (시간 역순). limit 미지정 시 전부.
   * dashboard §3.4 핏 히스토리, §2.7 이벤트 티커 등.
   */
  getAllBefore<E extends OpenF1EndpointName>(
    endpoint: E,
    t: Date,
    filters?: Partial<OpenF1EndpointRecords[E]>,
    limit?: number,
  ): OpenF1EndpointRecords[E][];

  /**
   * `lap.date_start ≤ t < lap.date_start + lap.lap_duration` (in-progress lap 포함).
   * dashboard §3.2 In Progress 행에서 사용.
   * lap_duration 이 null 인 in-progress lap 도 leader_current_lap 추정으로 매칭.
   */
  getLapAt(driverNum: number, t: Date): LapRecord | null;

  /**
   * `date_start + lap_duration ≤ t` 인 완료된 lap 만 (시간 역순). limit 미지정 시 전부.
   * dashboard §3.3 최근 5랩, §2.5 리더보드 LAST 칼럼에서 사용.
   * lap_duration 이 null 인 lap (in-progress) 은 제외 — 미래 누설 zero (§4.5).
   */
  getCompletedLapsBefore(driverNum: number, t: Date, limit?: number): LapRecord[];

  /**
   * `lap_start ≤ lap ≤ lap_end` 인 stint record. 없으면 null.
   * dashboard §3.5 스틴트 히스토리, §2.6 타이어 전략에서 사용.
   */
  getStintForLap(driverNum: number, lap: number): StintRecord | null;

  /**
   * `t` 까지의 데이터만으로 산출한 누적 통계 (빠른 랩, 보라색 섹터, personal best 등).
   * 시크 발생 시에도 미래 누설 없이 t 까지의 진실만 반영 (dashboard §4.4, §4.5).
   */
  getAggregateBefore<A extends AggregateName>(aggregate: A, t: Date): AggregateResults[A];
}
