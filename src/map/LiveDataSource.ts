// live-map plan §10 단계 12 + §3.1 SSOT — 브라우저 OpenF1 REST 폴러 DataSource.
//
// 정책 출처:
//  - docs/live-streaming-strategy.md §3.1 cadence (26 req/min × 8 endpoint)
//  - §2.1 display_clock = newest_received_date − 30s
//  - §6 워밍업 (hydration burst, token-bucket 3 req/s, 우선순위 location 우선)
//  - §6.5 + critic P0-5: hydration Promise.all resolve 전 cadence setInterval 등록 금지
//  - critic P0-4 (plan §11 위험표): CORS 사전 실패 시 onCorsFailed + cadence 미등록
//  - plan §4.2 인수 6: |x|+|y|+|z| < 50 raw sentinel 은 buffer 적재 금지

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

const DEFAULT_BASE_URL = 'https://api.openf1.org';
const DEFAULT_DISPLAY_LAG_MS = 30_000;
const DEFAULT_RING_BUFFER_MS = 60_000;
const DEFAULT_HYDRATION_TOKEN_INTERVAL_MS = 334; // 3 req/s
const DEFAULT_HYDRATION_WINDOW_MS = 32_000; // 35s pre-now to 3s pre-now
const DEFAULT_HYDRATION_END_LAG_MS = 3_000;
const LAGGING_THRESHOLD_MS = 1_500;
const STALLED_THRESHOLD_MS = 5_000;
const SENTINEL_THRESHOLD = 50; // |x|+|y|+|z| < 임계 (raw OpenF1 좌표)

/**
 * live-streaming-strategy.md §3.1 cadence. 총 26 req/min.
 * 우선순위 = location(맵 핵심) → position(리더보드) → intervals(갭) → race_control(깃발) →
 *           laps(랩 타임) → pit(핏) → stints(타이어) → weather.
 */
export const LIVE_CADENCE: readonly { endpoint: OpenF1EndpointName; intervalMs: number }[] = [
  { endpoint: 'location', intervalMs: 10_000 },
  { endpoint: 'position', intervalMs: 10_000 },
  { endpoint: 'intervals', intervalMs: 15_000 },
  { endpoint: 'race_control', intervalMs: 15_000 },
  { endpoint: 'laps', intervalMs: 30_000 },
  { endpoint: 'pit', intervalMs: 30_000 },
  { endpoint: 'stints', intervalMs: 60_000 },
  { endpoint: 'weather', intervalMs: 60_000 },
];

export interface LiveDataSourceOptions {
  sessionKey: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** false 면 start() 가 cadence 등록 없이 onCorsFailed 콜백 발화 (critic P0-4). */
  corsAvailable?: boolean;
  onCorsFailed?: () => void;
  /** Cadence override (테스트). */
  cadenceMs?: Partial<Record<OpenF1EndpointName, number>>;
  /** Token-bucket interval. 기본 334ms (3 req/s). */
  hydrationTokenIntervalMs?: number;
  /** Display lag (기본 30s, live-streaming §2.1). */
  displayLagMs?: number;
  /** Ring buffer 깊이 (기본 60s = 30s 표시 + 30s margin). */
  ringBufferMs?: number;
  /** Sleep injection (테스트). 기본 setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

interface InternalLocationSample extends LocationSample {
  /** parse 한 ms (date.valueOf()) — binary search 비용 절감. */
  dateMs: number;
}

export class LiveDataSource implements DataSource {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly displayLagMs: number;
  private readonly ringBufferMs: number;
  private readonly hydrationTokenIntervalMs: number;

  /** 차량별 location sample (시간순). */
  private readonly locationBuffer = new Map<number, InternalLocationSample[]>();
  /** 비-location endpoint 들의 raw record cache. dashboard 메서드는 stub 이라 미사용이지만
   *  cursor 진행 + 통계 위해 적재. */
  private readonly records = new Map<OpenF1EndpointName, OpenF1EndpointRecords[OpenF1EndpointName][]>();
  /** 각 endpoint 의 마지막 수신 date — date>=cursor 폴링 위해. */
  private readonly cursors = new Map<OpenF1EndpointName, Date>();

  private newestDate: Date | null = null;
  /** newestDate 가 갱신된 wall-clock 시각. display_time 의 wall-drift 계산 anchor. */
  private anchorWall: Date | null = null;
  /** 마지막 sample 수신 wall-clock — stream state (stalled/lagging) 판정용. */
  private lastSampleWall: Date | null = null;

  private readonly listeners = new Set<(t: Date) => void>();
  private intervalIds: ReturnType<typeof setInterval>[] = [];
  private started = false;

  constructor(private readonly opts: LiveDataSourceOptions) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = opts.now ?? (() => new Date());
    this.sleep = opts.sleep ?? defaultSleep;
    this.displayLagMs = opts.displayLagMs ?? DEFAULT_DISPLAY_LAG_MS;
    this.ringBufferMs = opts.ringBufferMs ?? DEFAULT_RING_BUFFER_MS;
    this.hydrationTokenIntervalMs =
      opts.hydrationTokenIntervalMs ?? DEFAULT_HYDRATION_TOKEN_INTERVAL_MS;
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    // critic P0-4: 사전 CORS 실패 검증 — cadence 등록 금지 + 사용자 알림.
    if (this.opts.corsAvailable === false) {
      this.opts.onCorsFailed?.();
      return;
    }

    // critic P0-5: hydration burst 완료 전까지 cadence setInterval 절대 등록 금지.
    await this.hydrate();
    this.startCadence();
  }

  stop(): void {
    for (const id of this.intervalIds) clearInterval(id);
    this.intervalIds = [];
    this.started = false;
  }

  // ── DataSource impl (live-map 4 메서드) ─────────────────────────────

  getDisplayTime(): Date {
    if (this.newestDate === null || this.anchorWall === null) return new Date(0);
    const anchorDisplayMs = this.newestDate.valueOf() - this.displayLagMs;
    const driftMs = this.now().valueOf() - this.anchorWall.valueOf();
    return new Date(anchorDisplayMs + driftMs);
  }

  getSamplePair(driverNumber: number, t: Date): SamplePair {
    const arr = this.locationBuffer.get(driverNumber);
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
    if (this.lastSampleWall === null) return 'buffering';
    const ageMs = this.now().valueOf() - this.lastSampleWall.valueOf();
    if (ageMs > STALLED_THRESHOLD_MS) return 'stalled';
    if (ageMs > LAGGING_THRESHOLD_MS) return 'lagging';
    return 'live';
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
    throw new Error('LiveDataSource: getLatestBefore not implemented (dashboard phase)');
  }
  getAllBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
    _limit?: number,
  ): OpenF1EndpointRecords[E][] {
    throw new Error('LiveDataSource: getAllBefore not implemented (dashboard phase)');
  }
  getLapAt(_driverNum: number, _t: Date): LapRecord | null {
    throw new Error('LiveDataSource: getLapAt not implemented (dashboard phase)');
  }
  getCompletedLapsBefore(_driverNum: number, _t: Date, _limit?: number): LapRecord[] {
    throw new Error('LiveDataSource: getCompletedLapsBefore not implemented (dashboard phase)');
  }
  getStintForLap(_driverNum: number, _lap: number): StintRecord | null {
    throw new Error('LiveDataSource: getStintForLap not implemented (dashboard phase)');
  }
  getAggregateBefore<A extends AggregateName>(_aggregate: A, _t: Date): AggregateResults[A] {
    throw new Error('LiveDataSource: getAggregateBefore not implemented (dashboard phase)');
  }

  // ── hydration + cadence internals ───────────────────────────────────

  private async hydrate(): Promise<void> {
    const nowMs = this.now().valueOf();
    const dateFrom = new Date(nowMs - DEFAULT_HYDRATION_WINDOW_MS).toISOString();
    const dateTo = new Date(nowMs - DEFAULT_HYDRATION_END_LAG_MS).toISOString();
    const promises: Promise<void>[] = [];
    for (let i = 0; i < LIVE_CADENCE.length; i++) {
      if (i > 0) await this.sleep(this.hydrationTokenIntervalMs);
      const { endpoint } = LIVE_CADENCE[i];
      promises.push(this.fetchHydrationWindow(endpoint, dateFrom, dateTo));
    }
    await Promise.all(promises);
  }

  private startCadence(): void {
    for (const c of LIVE_CADENCE) {
      const intervalMs = this.opts.cadenceMs?.[c.endpoint] ?? c.intervalMs;
      const id = setInterval(() => {
        void this.fetchCadence(c.endpoint);
      }, intervalMs);
      this.intervalIds.push(id);
    }
  }

  private async fetchHydrationWindow(
    endpoint: OpenF1EndpointName,
    dateFrom: string,
    dateTo: string,
  ): Promise<void> {
    // hydration 은 bounded historical 윈도우 (now-35s, now-3s) 라 date<= (closed) 사용.
    // cadence 는 cursor 의 다음 sample 만 원하므로 date> (open) — 경계 record 가 cursor 와 같으면 skip OK.
    const url = this.buildUrl(endpoint, { 'date>=': dateFrom, 'date<=': dateTo });
    await this.runFetch(endpoint, url);
  }

  private async fetchCadence(endpoint: OpenF1EndpointName): Promise<void> {
    const cursor = this.cursors.get(endpoint);
    const query: Record<string, string> = {};
    if (cursor) {
      // 마지막 수신 date 의 직후부터. live-streaming-strategy §4 (커서 폴링).
      query['date>'] = cursor.toISOString();
    }
    await this.runFetch(endpoint, this.buildUrl(endpoint, query));
  }

  private async runFetch(endpoint: OpenF1EndpointName, url: string): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(url);
    } catch (err) {
      console.warn(`[LiveDataSource] ${endpoint} fetch failed`, err);
      return;
    }
    if (!res.ok) {
      console.warn(`[LiveDataSource] ${endpoint} HTTP ${res.status}`);
      return;
    }
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw) || raw.length === 0) return;
    if (endpoint === 'location') {
      this.ingestLocation(raw);
    } else {
      this.ingestGeneric(endpoint, raw);
    }
  }

  private ingestLocation(raw: Array<Record<string, unknown>>): void {
    let maxDate: Date | null = null;
    for (const r of raw) {
      const date = parseDate(r.date);
      if (!date) continue;
      const x = Number(r.x);
      const y = Number(r.y);
      const z = Number(r.z);
      const drv = Number(r.driver_number);
      if (!Number.isFinite(drv)) continue;
      // plan §4.2 raw sentinel — drop silently.
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) < SENTINEL_THRESHOLD) continue;
      const sample: InternalLocationSample = { date, dateMs: date.valueOf(), x, y, z };
      this.insertLocation(drv, sample);
      if (!maxDate || date.valueOf() > maxDate.valueOf()) maxDate = date;
    }
    if (maxDate) {
      this.cursors.set('location', maxDate);
      this.advanceNewest(maxDate);
    }
    this.trimRingBuffer();
  }

  private ingestGeneric(
    endpoint: OpenF1EndpointName,
    raw: Array<Record<string, unknown>>,
  ): void {
    const bucket = this.records.get(endpoint) ?? [];
    let maxDate: Date | null = null;
    for (const r of raw) {
      const date = parseDate(r.date);
      if (date) {
        if (!maxDate || date.valueOf() > maxDate.valueOf()) maxDate = date;
      }
      bucket.push({ ...r, ...(date ? { date } : {}) } as OpenF1EndpointRecords[typeof endpoint]);
    }
    this.records.set(endpoint, bucket);
    if (maxDate) {
      this.cursors.set(endpoint, maxDate);
      this.advanceNewest(maxDate);
    }
  }

  private insertLocation(drv: number, sample: InternalLocationSample): void {
    const arr = this.locationBuffer.get(drv);
    if (!arr) {
      this.locationBuffer.set(drv, [sample]);
      return;
    }
    const last = arr[arr.length - 1];
    if (sample.dateMs >= last.dateMs) {
      arr.push(sample);
      return;
    }
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid].dateMs <= sample.dateMs) lo = mid + 1;
      else hi = mid;
    }
    arr.splice(lo, 0, sample);
  }

  private advanceNewest(date: Date): void {
    if (!this.newestDate || date.valueOf() > this.newestDate.valueOf()) {
      this.newestDate = date;
      this.anchorWall = this.now();
    }
    this.lastSampleWall = this.now();
    const t = this.getDisplayTime();
    for (const cb of this.listeners) cb(t);
  }

  private trimRingBuffer(): void {
    if (!this.newestDate) return;
    const cutoff = this.newestDate.valueOf() - this.ringBufferMs;
    for (const arr of this.locationBuffer.values()) {
      if (arr.length <= 1) continue;
      let dropEnd = 0;
      while (dropEnd < arr.length - 1 && arr[dropEnd].dateMs < cutoff) dropEnd++;
      if (dropEnd > 0) arr.splice(0, dropEnd);
    }
  }

  private buildUrl(endpoint: OpenF1EndpointName, query: Record<string, string>): string {
    const params: string[] = [`session_key=${this.opts.sessionKey}`];
    for (const [k, v] of Object.entries(query)) {
      const value = encodeURIComponent(v);
      // OpenF1 query operator-suffix: date>=, date<=, date> 는 키의 일부.
      params.push(/[<>=]$/.test(k) ? `${k}${value}` : `${k}=${value}`);
    }
    return `${this.baseUrl}/v1/${endpoint}?${params.join('&')}`;
  }
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  if (Number.isNaN(d.valueOf())) return null;
  return d;
}

function toExternal(s: InternalLocationSample): LocationSample {
  return { date: s.date, x: s.x, y: s.y, z: s.z };
}
