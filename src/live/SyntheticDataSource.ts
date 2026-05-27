// /test-rig 전용 합성 DataSource — 실 OpenF1 의존 없이 LiveMap 결정론적 마운트용.
// LiveDataSource 인터페이스 + onSample 콜백 호환. 각 driver 는 polyline 따라 등속 운동.
// dashboard 6 메서드는 LiveDataSource 와 동일하게 throw — 본 test-rig 는 라이브 맵 렌더만 검증.

import type {
  AggregateName,
  AggregateResults,
  LapRecord,
  OpenF1EndpointName,
  OpenF1EndpointRecords,
  StintRecord,
} from '../shared/openf1Types.js';
import type {
  DataSource,
  LocationSample,
  SamplePair,
  StreamState,
} from '../shared/DataSource.js';

const DEFAULT_DISPLAY_LAG_MS = 30_000;
const DEFAULT_RING_BUFFER_MS = 60_000;

type Point2D = readonly [number, number];

export interface SyntheticDataSourceOptions {
  driverNumbers: number[];
  /** 1 driver 당 초당 sample 수. 일반적으로 4. */
  samplesPerSecond: number;
  /** 결정론적 운동 경로 (OpenF1 좌표계). 마지막 점이 첫 점에 닫혀 있어야 함. */
  polyline: Point2D[];
  /** polyline 한 바퀴 호 길이 (OpenF1 단위). */
  totalArcLength: number;
  /** 시뮬레이션 시작 시각 (epoch ms). */
  startEpochMs: number;
  /** 평균 차량 속도 (OpenF1 단위/sec). default 30 (적당히 빠른 lap rate). */
  cruiseSpeed?: number;
  /** sample 인입마다 호출. UI bridge (LiveMap) 가 raw → projected 변환. */
  onSample?: (driverNumber: number, sample: LocationSample) => void;
  /** RAF tick 인터벌. default 100ms. test 에서 fake timer 로 step 가능. */
  tickIntervalMs?: number;
  /** 현재 wall-clock. default Date.now. */
  now?: () => number;
  /** setInterval/clearInterval 주입 (테스트용). default globalThis.setInterval. */
  setIntervalImpl?: (cb: () => void, ms: number) => unknown;
  clearIntervalImpl?: (id: unknown) => void;
}

interface InternalSample extends LocationSample {
  dateMs: number;
}

export class SyntheticDataSource implements DataSource {
  private readonly buffer = new Map<number, InternalSample[]>();
  private readonly listeners = new Set<(t: Date) => void>();
  private readonly displayLagMs = DEFAULT_DISPLAY_LAG_MS;
  private readonly ringBufferMs = DEFAULT_RING_BUFFER_MS;
  private readonly cruiseSpeed: number;
  private readonly tickIntervalMs: number;
  private readonly now: () => number;
  private readonly setIntervalImpl: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalImpl: (id: unknown) => void;
  /** 누적 호 길이 테이블 — polyline 점 단위 sample 위치 계산. */
  private readonly arcTable: number[];
  /** 마지막 sample 인입 sample 의 epoch ms (driver 당). 다음 tick 에서 sps 간격 충족 시만 push. */
  private readonly lastEmittedAt = new Map<number, number>();
  private newestMs = 0;
  private intervalId: unknown = null;
  private started = false;

  constructor(private readonly opts: SyntheticDataSourceOptions) {
    if (opts.polyline.length < 2) throw new Error('SyntheticDataSource: polyline ≥ 2 points');
    if (opts.totalArcLength <= 0) throw new Error('SyntheticDataSource: totalArcLength > 0');
    if (opts.samplesPerSecond <= 0) throw new Error('SyntheticDataSource: samplesPerSecond > 0');
    this.cruiseSpeed = opts.cruiseSpeed ?? 30;
    this.tickIntervalMs = opts.tickIntervalMs ?? 100;
    this.now = opts.now ?? (() => Date.now());
    this.setIntervalImpl = opts.setIntervalImpl ?? ((cb, ms) => setInterval(cb, ms));
    this.clearIntervalImpl = opts.clearIntervalImpl ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>));
    this.arcTable = buildArcTable(opts.polyline);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    // 즉시 첫 sample 인입 (warm-up 단축).
    this.tick();
    this.intervalId = this.setIntervalImpl(() => this.tick(), this.tickIntervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) this.clearIntervalImpl(this.intervalId);
    this.intervalId = null;
    this.started = false;
  }

  // ── DataSource impl (live-map 4 메서드) ─────────────────────────────

  getDisplayTime(): Date {
    if (this.newestMs === 0) return new Date(0);
    return new Date(this.newestMs - this.displayLagMs);
  }

  getSamplePair(driverNumber: number, t: Date): SamplePair {
    const arr = this.buffer.get(driverNumber);
    if (!arr || arr.length === 0) return null;
    const tMs = t.valueOf();
    if (arr.length === 1) return { s1: toExternal(arr[0]), s2: null };
    if (tMs < arr[0].dateMs) return { s1: toExternal(arr[0]), s2: null };
    if (tMs >= arr[arr.length - 1].dateMs) {
      return { s1: toExternal(arr[arr.length - 1]), s2: null };
    }
    let lo = 0;
    let hi = arr.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].dateMs <= tMs) lo = mid;
      else hi = mid;
    }
    return { s1: toExternal(arr[lo]), s2: toExternal(arr[lo + 1]) };
  }

  getStreamState(): StreamState {
    return this.started ? 'live' : 'buffering';
  }

  onDisplayTimeChange(handler: (t: Date) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  // ── DataSource impl (dashboard stub, plan §3.1 명시 허용) ────────────

  getLatestBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
  ): OpenF1EndpointRecords[E] | null {
    throw new Error('SyntheticDataSource: getLatestBefore not implemented (test-rig only)');
  }
  getAllBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
    _limit?: number,
  ): OpenF1EndpointRecords[E][] {
    throw new Error('SyntheticDataSource: getAllBefore not implemented (test-rig only)');
  }
  getLapAt(_driverNum: number, _t: Date): LapRecord | null {
    throw new Error('SyntheticDataSource: getLapAt not implemented (test-rig only)');
  }
  getCompletedLapsBefore(_driverNum: number, _t: Date, _limit?: number): LapRecord[] {
    throw new Error('SyntheticDataSource: getCompletedLapsBefore not implemented (test-rig only)');
  }
  getStintForLap(_driverNum: number, _lap: number): StintRecord | null {
    throw new Error('SyntheticDataSource: getStintForLap not implemented (test-rig only)');
  }
  getAggregateBefore<A extends AggregateName>(_aggregate: A, _t: Date): AggregateResults[A] {
    throw new Error('SyntheticDataSource: getAggregateBefore not implemented (test-rig only)');
  }

  // ── internals ───────────────────────────────────────────────────────

  private tick(): void {
    const nowMs = this.now();
    const minIntervalMs = 1000 / this.opts.samplesPerSecond;
    for (let i = 0; i < this.opts.driverNumbers.length; i++) {
      const drv = this.opts.driverNumbers[i];
      const last = this.lastEmittedAt.get(drv) ?? 0;
      if (nowMs - last < minIntervalMs) continue;
      const elapsedSec = (nowMs - this.opts.startEpochMs) / 1000;
      // driver index 별 phase offset — 트랙 둘레의 1/N 만큼 분산.
      const phaseOffset = (i / this.opts.driverNumbers.length) * this.opts.totalArcLength;
      const arcPos =
        (elapsedSec * this.cruiseSpeed + phaseOffset) % this.opts.totalArcLength;
      const [x, y] = sampleAtArc(this.opts.polyline, this.arcTable, arcPos);
      const sample: InternalSample = {
        date: new Date(nowMs),
        dateMs: nowMs,
        x,
        y,
        z: 0,
      };
      this.pushSample(drv, sample);
      this.lastEmittedAt.set(drv, nowMs);
      this.opts.onSample?.(drv, { date: sample.date, x, y, z: 0 });
    }
    if (nowMs > this.newestMs) {
      this.newestMs = nowMs;
      const displayTime = this.getDisplayTime();
      for (const cb of this.listeners) cb(displayTime);
    }
    this.trim();
  }

  private pushSample(drv: number, s: InternalSample): void {
    const arr = this.buffer.get(drv);
    if (!arr) {
      this.buffer.set(drv, [s]);
      return;
    }
    arr.push(s);
  }

  private trim(): void {
    if (this.newestMs === 0) return;
    const cutoff = this.newestMs - this.ringBufferMs;
    for (const arr of this.buffer.values()) {
      if (arr.length <= 1) continue;
      let dropEnd = 0;
      while (dropEnd < arr.length - 1 && arr[dropEnd].dateMs < cutoff) dropEnd++;
      if (dropEnd > 0) arr.splice(0, dropEnd);
    }
  }

  /** 테스트 surface — 외부 단언용 ring buffer 크기. */
  _bufferSize(driverNumber: number): number {
    return this.buffer.get(driverNumber)?.length ?? 0;
  }
}

export function buildArcTable(polyline: ReadonlyArray<Point2D>): number[] {
  const table = [0];
  for (let i = 1; i < polyline.length; i++) {
    const [x0, y0] = polyline[i - 1];
    const [x1, y1] = polyline[i];
    table.push(table[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  return table;
}

function sampleAtArc(polyline: Point2D[], arcTable: number[], s: number): Point2D {
  // binary search: arcTable[idx] ≤ s < arcTable[idx+1]
  let lo = 0;
  let hi = arcTable.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (arcTable[mid] <= s) lo = mid;
    else hi = mid;
  }
  const segLen = arcTable[lo + 1] - arcTable[lo];
  const t = segLen === 0 ? 0 : (s - arcTable[lo]) / segLen;
  const [x0, y0] = polyline[lo];
  const [x1, y1] = polyline[lo + 1];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

function toExternal(s: InternalSample): LocationSample {
  return { date: s.date, x: s.x, y: s.y, z: s.z };
}
