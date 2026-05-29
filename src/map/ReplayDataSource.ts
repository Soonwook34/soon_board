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
import { LocationBuffer, parseDate } from './LocationBuffer.js';
import { rateLimitedFetch } from './rateLimitedFetch.js';

const DEFAULT_BASE_URL = 'https://api.openf1.org';
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LOOKAHEAD_BASE_MS = 60_000;
// OpenF1 burst limit 회피 — LiveDataSource hydration 과 동일 (3 req/s).
const DEFAULT_REQUEST_SPREAD_MS = 334;

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
  /**
   * playback_clock 자동 증가 주기 (ms). 0 = 비활성 (테스트). 기본 100ms (renderer 의 RAF 와 독립).
   * replay-strategy §4.1: playback_clock += dt × speed. 본 옵션이 그 dt 의 wall-clock 주기.
   */
  clockTickIntervalMs?: number;
  /** burst 분산 간격 (ms). 기본 334 (≈3 req/s, OpenF1 burst limit 회피). 0 = 즉시 모두. */
  requestSpreadMs?: number;
  /** sleep injection (테스트). 기본 setTimeout. backoff/spread 둘 다에 사용. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * UI bridge 가 raw LocationSample → projected DriverSample 변환 후 PerDriverBuffer 에 push 하는 hook.
   * LiveDataSource.onSample 과 동일 시맨틱 — dense location 윈도우 fetch 시 sample 마다 1회 호출.
   * 같은 sample 이 중복 호출되지 않도록 호출 시점은 insertLocation 직후 1회로 한정.
   */
  onSample?: (driverNumber: number, sample: LocationSample) => void;
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
  /** 차량별 location sample (시간순) — LiveDataSource 와 공유 구현 (D1). */
  private readonly locationBuffer = new LocationBuffer();

  private playbackClock: Date;
  private speed = 1;
  private state: StreamState = 'buffering';
  private paused = false;
  private readonly listeners = new Set<(t: Date) => void>();
  /** 자동 clock 증가 timer (start 이후 활성). stop()/pause() 에서 정리. */
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  /** advanceClock 의 wall-clock 기준 — 실 경과 × speed 로 playbackClock 진행. */
  private lastTickWallMs = 0;
  /** lookahead 재발사 throttle — 매 tick 마다 호출하면 cache hit 만 누적되지만 약간 비효율. */
  private lastLookaheadAt = 0;

  constructor(private readonly opts: ReplayDataSourceOptions) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
    this.lookaheadBaseMs = opts.lookaheadBaseMs ?? DEFAULT_LOOKAHEAD_BASE_MS;
    this.sessionStartMs = opts.sessionDateStart.valueOf();
    this.playbackClock = opts.sessionDateStart;
  }

  // ── lifecycle ───────────────────────────────────────────────────────

  /**
   * sparse 6개 + 첫 lookahead 윈도우들 prefetch + playback_clock 자동 증가 시작.
   * 시작 burst 분산 — 모두 동시 발사하면 OpenF1 burst limit (~3-5 req/s) 에서 429.
   * sparse 6개를 requestSpreadMs 간격으로 launch (각자는 병렬 진행) → 평균 3 req/s.
   */
  async start(): Promise<void> {
    const spread = this.opts.requestSpreadMs ?? DEFAULT_REQUEST_SPREAD_MS;
    const sleep = this.opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
    const sparsePromises: Promise<void>[] = [];
    for (let i = 0; i < SPARSE_ENDPOINTS.length; i++) {
      if (i > 0 && spread > 0) await sleep(spread);
      sparsePromises.push(this.fetchSparse(SPARSE_ENDPOINTS[i]));
    }
    await Promise.all(sparsePromises);
    await this.ensureLookahead();
    this.state = 'live';
    this.startClockTick();
  }

  /**
   * LiveMap unmount 시 호출 — tick timer + listener 정리 + state 표시.
   * pull-based fetch 의 in-flight Promise 는 자연 resolve 되므로 별도 abort 불필요.
   */
  stop(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.listeners.clear();
    this.state = 'buffering';
  }

  /**
   * B1: pause — tick timer 중단, playbackClock 동결.
   * 이미 fetch 된 데이터로 마커는 그 자리에 멈춤. API 부하 추가 없음 (lookahead 도 멈춤).
   */
  pause(): void {
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.paused = true;
  }

  /** B1: resume — tick timer 재시작. lastTickWallMs 를 now 로 재초기화해 시간 jump 방지. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.startClockTick();
  }

  /** B1: pause 상태 query (LiveMap toolbar UI 가 토글 표시 결정). */
  isPaused(): boolean {
    return this.paused;
  }

  /** start() 직후 호출 — 100ms 주기로 playback_clock 을 실 경과 × speed 만큼 진행. */
  private startClockTick(): void {
    const intervalMs = this.opts.clockTickIntervalMs ?? 100;
    if (intervalMs <= 0) return;
    this.lastTickWallMs = Date.now();
    this.tickTimer = setInterval(() => this.advanceClock(), intervalMs);
    // node 에서 process exit 을 막지 않도록 unref (browser timer 에는 없음 → optional chain).
    const t = this.tickTimer as unknown as { unref?: () => void };
    t.unref?.();
  }

  /**
   * tick — wall-clock 으로 측정한 실 경과 × speed 만큼 playback_clock 증가.
   * sessionDateEnd 를 넘으면 거기서 멈춤 + state='live' 유지 (재생 끝).
   * window 경계 진입 시 ensureLookahead 호출 (매 tick 마다 호출하면 비효율).
   */
  private advanceClock(): void {
    const now = Date.now();
    const dtWall = now - this.lastTickWallMs;
    this.lastTickWallMs = now;
    if (dtWall <= 0) return;
    const advanced = this.playbackClock.valueOf() + dtWall * this.speed;
    const endMs = this.opts.sessionDateEnd?.valueOf() ?? Number.POSITIVE_INFINITY;
    const clamped = Math.min(advanced, endMs);
    this.playbackClock = new Date(clamped);
    // lookahead: window 절반 주기로 throttle. cache hit 이면 즉시 resolve 라 부담 없음.
    if (now - this.lastLookaheadAt > this.windowMs / 2) {
      this.lastLookaheadAt = now;
      void this.ensureLookahead();
    }
    for (const cb of this.listeners) cb(this.playbackClock);
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
    return this.locationBuffer.getSamplePair(driverNumber, t);
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
      // 429/5xx 시 rateLimitedFetch 가 Retry-After honor + exponential backoff 자동 처리.
      res = await rateLimitedFetch(this.fetchImpl, url, { sleep: this.opts.sleep });
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
      const result = this.locationBuffer.ingestRaw(r);
      if (!result) continue;
      // LiveDataSource 와 동일 시맨틱 — UI bridge 가 PerDriverBuffer 에 push 하도록 알림.
      this.opts.onSample?.(result.driver, result.sample);
    }
  }
}
