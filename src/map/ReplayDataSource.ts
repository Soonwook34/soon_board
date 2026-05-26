// live-map plan §10 단계 13 + §3.1 SSOT — 브라우저 OpenF1 historical 윈도우 폴러.
//
// 정책 출처:
//  - docs/replay-strategy.md §2.2 좌-닫힘/우-열림 [T, T+W)
//  - §3.1 sparse endpoint full-session 1회
//  - §3.2 dense endpoint 60s 윈도우
//  - §3.3 grid snap (session.date_start 기준)
//  - §4.1~§4.4 playback_clock + speed + lookahead = 60s × speed
//  - §5.1 cache key (endpoint, session_key, window_start_iso) + Map
//  - §5.2 in-flight 합치기

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
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LOOKAHEAD_BASE_MS = 60_000;
const SENTINEL_THRESHOLD = 50;

/** replay-strategy.md §3.1 — session_key 만으로 1회 fetch (full session). */
export const SPARSE_ENDPOINTS: readonly OpenF1EndpointName[] = [
  'laps',
  'weather',
  'race_control',
  'pit',
  'stints',
  'session_result',
];

/** replay-strategy.md §3.2 — 60s 윈도우 분할 fetch. */
export const DENSE_ENDPOINTS: readonly OpenF1EndpointName[] = [
  'location',
  'position',
  'intervals',
];

export interface ReplayDataSourceOptions {
  sessionKey: number;
  /** 윈도우 grid snap 기준 시각 (sessions.date_start). */
  sessionDateStart: Date;
  /** 세션 끝 (date_end). speed change/seek 시 윈도우 상한 bound (선택). */
  sessionDateEnd?: Date;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  windowMs?: number;
  lookaheadBaseMs?: number;
}

interface InternalLocationSample extends LocationSample {
  dateMs: number;
}

export class ReplayDataSource implements DataSource {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly windowMs: number;
  private readonly lookaheadBaseMs: number;
  private readonly sessionStartMs: number;

  /** (endpoint, window_start_iso) 키. sparse endpoint 는 window_start_iso = 'session'. */
  private readonly cache = new Map<string, OpenF1EndpointRecords[OpenF1EndpointName][]>();
  /** in-flight dedup. 같은 key 의 동시 호출은 단일 Promise 로 합침 (replay-strategy §5.2). */
  private readonly inflight = new Map<string, Promise<void>>();
  /** 차량별 location sample (시간순) — dense location window 통합. */
  private readonly locationByDriver = new Map<number, InternalLocationSample[]>();

  private playbackClock: Date;
  private speed = 1;
  private state: StreamState = 'buffering';
  private readonly listeners = new Set<(t: Date) => void>();

  constructor(private readonly opts: ReplayDataSourceOptions) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    this.lookaheadBaseMs = opts.lookaheadBaseMs ?? DEFAULT_LOOKAHEAD_BASE_MS;
    this.sessionStartMs = opts.sessionDateStart.valueOf();
    this.playbackClock = opts.sessionDateStart;
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  /** sparse 6개 + 첫 lookahead 윈도우들 prefetch. */
  async start(): Promise<void> {
    await Promise.all(SPARSE_ENDPOINTS.map((e) => this.fetchSparse(e)));
    await this.ensureLookahead();
    this.state = 'live';
  }

  // ── playback control ────────────────────────────────────────────────

  setPlaybackClock(t: Date): void {
    this.playbackClock = t;
    void this.ensureLookahead();
    for (const cb of this.listeners) cb(t);
  }

  setSpeed(speed: number): void {
    if (speed <= 0) throw new Error('ReplayDataSource: speed must be > 0');
    this.speed = speed;
    void this.ensureLookahead();
  }

  getSpeed(): number {
    return this.speed;
  }

  // ── DataSource impl (live-map 4 메서드) ─────────────────────────────

  getDisplayTime(): Date {
    return this.playbackClock;
  }

  getSamplePair(driverNumber: number, t: Date): SamplePair {
    const arr = this.locationByDriver.get(driverNumber);
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
    return this.state;
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
    throw new Error('ReplayDataSource: getLatestBefore not implemented (dashboard phase)');
  }
  getAllBefore<E extends OpenF1EndpointName>(
    _endpoint: E,
    _t: Date,
    _filters?: Partial<OpenF1EndpointRecords[E]>,
    _limit?: number,
  ): OpenF1EndpointRecords[E][] {
    throw new Error('ReplayDataSource: getAllBefore not implemented (dashboard phase)');
  }
  getLapAt(_driverNum: number, _t: Date): LapRecord | null {
    throw new Error('ReplayDataSource: getLapAt not implemented (dashboard phase)');
  }
  getCompletedLapsBefore(_driverNum: number, _t: Date, _limit?: number): LapRecord[] {
    throw new Error('ReplayDataSource: getCompletedLapsBefore not implemented (dashboard phase)');
  }
  getStintForLap(_driverNum: number, _lap: number): StintRecord | null {
    throw new Error('ReplayDataSource: getStintForLap not implemented (dashboard phase)');
  }
  getAggregateBefore<A extends AggregateName>(_aggregate: A, _t: Date): AggregateResults[A] {
    throw new Error('ReplayDataSource: getAggregateBefore not implemented (dashboard phase)');
  }

  // ── grid snap + lookahead internals ─────────────────────────────────

  /** playback_clock 을 포함하는 window_start (session.date_start 기준 grid snap). */
  windowStartFor(t: Date): Date {
    const offset = t.valueOf() - this.sessionStartMs;
    const bucket = Math.floor(offset / this.windowMs);
    return new Date(this.sessionStartMs + bucket * this.windowMs);
  }

  /** 현재 playback_clock + lookahead 범위에 필요한 모든 dense window prefetch. */
  private async ensureLookahead(): Promise<void> {
    const lookaheadMs = this.lookaheadBaseMs * this.speed;
    const startWindow = this.windowStartFor(this.playbackClock);
    const endMs = this.playbackClock.valueOf() + lookaheadMs;
    const windows: Date[] = [];
    for (
      let cursor = startWindow.valueOf();
      cursor < endMs;
      cursor += this.windowMs
    ) {
      windows.push(new Date(cursor));
    }
    const tasks: Promise<void>[] = [];
    for (const ws of windows) {
      for (const ep of DENSE_ENDPOINTS) {
        tasks.push(this.fetchDenseWindow(ep, ws));
      }
    }
    await Promise.all(tasks);
  }

  private async fetchSparse(endpoint: OpenF1EndpointName): Promise<void> {
    const key = `${endpoint}:session`;
    if (this.cache.has(key)) return;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const url = `${this.baseUrl}/v1/${endpoint}?session_key=${this.opts.sessionKey}`;
    const p = this.runFetch(endpoint, key, url);
    this.inflight.set(key, p);
    try {
      await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async fetchDenseWindow(endpoint: OpenF1EndpointName, windowStart: Date): Promise<void> {
    const iso = windowStart.toISOString();
    const key = `${endpoint}:${iso}`;
    if (this.cache.has(key)) return;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const endIso = new Date(windowStart.valueOf() + this.windowMs).toISOString();
    // OpenF1 operator-suffix key 규약 (openf1Client.ts 와 동일). 반-개구간 [T, T+W) — date<= 아닌 date<.
    const url =
      `${this.baseUrl}/v1/${endpoint}` +
      `?session_key=${this.opts.sessionKey}` +
      `&date>=${encodeURIComponent(iso)}` +
      `&date<${encodeURIComponent(endIso)}`;
    const p = this.runFetch(endpoint, key, url);
    this.inflight.set(key, p);
    try {
      await p;
    } finally {
      this.inflight.delete(key);
    }
  }

  private async runFetch(
    endpoint: OpenF1EndpointName,
    cacheKey: string,
    url: string,
  ): Promise<void> {
    let res: Response;
    try {
      res = await this.fetchImpl(url);
    } catch (err) {
      console.warn(`[ReplayDataSource] ${endpoint} fetch failed`, err);
      return;
    }
    if (!res.ok) {
      console.warn(`[ReplayDataSource] ${endpoint} HTTP ${res.status}`);
      return;
    }
    const raw = (await res.json()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw)) return;
    const parsed: OpenF1EndpointRecords[typeof endpoint][] = [];
    for (const r of raw) {
      const date = parseDate(r.date);
      parsed.push({ ...r, ...(date ? { date } : {}) } as OpenF1EndpointRecords[typeof endpoint]);
    }
    this.cache.set(cacheKey, parsed);
    if (endpoint === 'location') this.ingestLocation(raw);
  }

  private ingestLocation(raw: Array<Record<string, unknown>>): void {
    for (const r of raw) {
      const date = parseDate(r.date);
      if (!date) continue;
      const x = Number(r.x);
      const y = Number(r.y);
      const z = Number(r.z);
      const drv = Number(r.driver_number);
      if (!Number.isFinite(drv)) continue;
      // plan §4.2 sentinel.
      if (Math.abs(x) + Math.abs(y) + Math.abs(z) < SENTINEL_THRESHOLD) continue;
      this.insertLocation(drv, { date, dateMs: date.valueOf(), x, y, z });
    }
  }

  private insertLocation(drv: number, sample: InternalLocationSample): void {
    const arr = this.locationByDriver.get(drv);
    if (!arr) {
      this.locationByDriver.set(drv, [sample]);
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
