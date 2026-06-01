// 브라우저 측 모든 OpenF1 호출의 단일 진입점 (.omc/plans/openf1-client.md Step 1).
//
// 책임: token bucket (rate limit) + 3등급 priority queue + in-flight dedup
//      + 429/5xx backoff (rateLimitedFetch 시맨틱 이식) + abort + metrics + events.
//
// scripts/_lib/openf1Client.ts (node CLI) 와는 별개 — 환경/의존성이 다르다 (plan §9).
// DataSource 인터페이스는 무변경. 본 client 는 그 아래 fetch 레이어.

export type RequestPriority = 'high' | 'normal' | 'low';

export interface OpenF1Params {
  [key: string]: string | number | boolean;
}

export interface FetchOptions {
  /** e.g. '/v1/laps' */
  path: string;
  /** e.g. { session_key: 12345 }. operator-suffix key (date>=) 는 키의 일부. */
  params?: OpenF1Params;
  /** default 'normal' */
  priority?: RequestPriority;
  /** caller abort */
  signal?: AbortSignal;
  /** auto-canonical key override */
  dedupeKey?: string;
}

export interface OpenF1ClientMetrics {
  totalRequests: number;
  in429: number;
  in5xx: number;
  retries: number;
  queueDepth: number;
  inflight: number;
}

export type RequestEvent =
  | { kind: 'send'; url: string; priority: RequestPriority }
  | { kind: 'retry'; url: string; status: number; attempt: number; waitMs: number }
  | { kind: 'ok'; url: string; status: number; ms: number }
  | { kind: 'fail'; url: string; status?: number; error?: string };

export interface OpenF1ClientOptions {
  /** default 'https://api.openf1.org' */
  baseUrl?: string;
  /** test seam — default global fetch */
  fetchImpl?: typeof fetch;
  /** refill rate. default 3 */
  ratePerSecond?: number;
  /** burst limit (max tokens held). default 1 — strict ~334ms spacing */
  bucketCapacity?: number;
  /** in-flight cap. default 6 */
  maxConcurrent?: number;
  /** default 3 */
  maxRetries?: number;
  /** default 1000 */
  backoffBaseMs?: number;
  /** default 30000 */
  backoffMaxMs?: number;
  /** test seam — AbortSignal-aware. default setTimeout-based */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** test seam — bucket refill timer. fake-timer 호환. default setTimeout. 반환값은 cancel. */
  schedule?: (cb: () => void, ms: number) => () => void;
}

const DEFAULT_BASE_URL = 'https://api.openf1.org';

const PRIORITY_RANK: Record<RequestPriority, number> = { high: 3, normal: 2, low: 1 };
const PRIORITY_ORDER: RequestPriority[] = ['high', 'normal', 'low'];

function makeAbortError(): Error {
  // DOMException 가용성이 환경마다 달라 name='AbortError' 인 Error 로 통일.
  const e = new Error('The operation was aborted.');
  e.name = 'AbortError';
  return e;
}

const defaultSchedule = (cb: () => void, ms: number): (() => void) => {
  const id = setTimeout(cb, ms);
  return () => clearTimeout(id);
};

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(makeAbortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(id);
      signal?.removeEventListener('abort', onAbort);
      reject(makeAbortError());
    };
    const id = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort);
  });

/** params 를 정렬해 [key, stringValue] 쌍으로. number/boolean canonicalize. */
function sortedParamEntries(params?: OpenF1Params): Array<[string, string]> {
  if (!params) return [];
  return Object.keys(params)
    .sort()
    .map((k): [string, string] => {
      const raw = params[k];
      const v = typeof raw === 'boolean' ? (raw ? 'true' : 'false') : String(raw);
      return [k, v];
    });
}

/** OpenF1 operator-suffix 규약 (LiveDataSource.buildUrl 과 동일): date>= 류는 '=' 없이 붙임. */
function joinParam(key: string, value: string): string {
  return /[<>=]$/.test(key) ? `${key}${value}` : `${key}=${value}`;
}

function canonicalKey(path: string, entries: Array<[string, string]>): string {
  if (entries.length === 0) return path;
  return `${path}?${entries.map(([k, v]) => joinParam(k, v)).join('&')}`;
}

function buildUrl(baseUrl: string, path: string, entries: Array<[string, string]>): string {
  if (entries.length === 0) return `${baseUrl}${path}`;
  const query = entries.map(([k, v]) => joinParam(k, encodeURIComponent(v))).join('&');
  return `${baseUrl}${path}?${query}`;
}

/** Retry-After (numeric/HTTP-date) 우선, 없으면 exponential backoff (rateLimitedFetch 이식). */
function computeWaitMs(res: Response, attempt: number, baseMs: number, maxMs: number): number {
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, maxMs);
    const t = Date.parse(ra);
    if (!Number.isNaN(t)) {
      const diff = t - Date.now();
      if (diff > 0) return Math.min(diff, maxMs);
    }
  }
  return Math.min(baseMs * Math.pow(2, attempt), maxMs);
}

interface Subscriber {
  resolve: (res: Response) => void;
  reject: (err: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface QueueEntry {
  key: string;
  url: string;
  priority: RequestPriority;
  subscribers: Subscriber[];
  /** in-flight 단계 진입 후의 내부 abort controller. queue 단계에서는 null. */
  controller: AbortController | null;
}

/**
 * 토큰 버킷 — refill 은 self-rescheduling setTimeout(=schedule seam) 으로만 구동.
 * now() 의존이 없어 fake timer 와 완전 호환. capacity=1 이면 take 후 refillMs 마다 1토큰.
 */
class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillMs: number;
  private readonly schedule: (cb: () => void, ms: number) => () => void;
  private readonly onRefill: () => void;
  private cancelTimer: (() => void) | null = null;

  constructor(
    ratePerSecond: number,
    capacity: number,
    schedule: (cb: () => void, ms: number) => () => void,
    onRefill: () => void,
  ) {
    this.capacity = capacity;
    this.tokens = capacity;
    // 올림 — 명목 rate 아래로 spacing 이 내려가지 않도록 보수적으로 (AC1: 간격 >= 334ms).
    this.refillMs = Math.ceil(1000 / ratePerSecond);
    this.schedule = schedule;
    this.onRefill = onRefill;
  }

  /** 토큰 1개 소비 시도. 성공 시 true. 소비하면 refill 타이머 가동. */
  tryTake(): boolean {
    if (this.tokens >= 1) {
      this.tokens -= 1;
      this.ensureTimer();
      return true;
    }
    return false;
  }

  private ensureTimer(): void {
    if (this.cancelTimer) return;
    if (this.tokens >= this.capacity) return; // 가득 차면 refill 불필요
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      this.tokens = Math.min(this.capacity, this.tokens + 1);
      this.onRefill();
      this.ensureTimer();
    }, this.refillMs);
  }

  reset(): void {
    this.cancelTimer?.();
    this.cancelTimer = null;
    this.tokens = this.capacity;
  }
}

export class OpenF1Client {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxConcurrent: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  private readonly bucket: TokenBucket;
  private readonly queues: Record<RequestPriority, QueueEntry[]> = { high: [], normal: [], low: [] };
  private readonly pendingByKey = new Map<string, QueueEntry>();
  private readonly inflightByKey = new Map<string, QueueEntry>();
  private readonly listeners = new Set<(e: RequestEvent) => void>();

  private metrics = { totalRequests: 0, in429: 0, in5xx: 0, retries: 0 };
  private pumpScheduled = false;

  constructor(opts: OpenF1ClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    // 래퍼 필수: `this.fetchImpl = fetch` 로 두면 `this.fetchImpl(...)` 호출 시
    // this 가 client 인스턴스가 되어 브라우저 native fetch 가 Illegal invocation 으로 throw.
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.maxConcurrent = opts.maxConcurrent ?? 6;
    this.maxRetries = opts.maxRetries ?? 3;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1000;
    this.backoffMaxMs = opts.backoffMaxMs ?? 30_000;
    this.sleep = opts.sleep ?? defaultSleep;
    this.bucket = new TokenBucket(
      opts.ratePerSecond ?? 3,
      opts.bucketCapacity ?? 1,
      opts.schedule ?? defaultSchedule,
      () => this.schedulePump(),
    );
  }

  fetch(opts: FetchOptions): Promise<Response> {
    const { path, params, priority = 'normal', signal, dedupeKey } = opts;
    if (signal?.aborted) return Promise.reject(makeAbortError());

    const entries = sortedParamEntries(params);
    const key = dedupeKey ?? canonicalKey(path, entries);
    const url = buildUrl(this.baseUrl, path, entries);

    return new Promise<Response>((resolve, reject) => {
      const sub: Subscriber = { resolve, reject, signal };

      const inflight = this.inflightByKey.get(key);
      if (inflight) {
        // in-flight 단계 dedup — 우선순위 변경 불가, 결과만 share.
        this.addSubscriber(inflight, sub);
        return;
      }

      const queued = this.pendingByKey.get(key);
      if (queued) {
        // queue 단계 dedup — 더 높은 priority 면 promote (AC7a).
        this.addSubscriber(queued, sub);
        if (PRIORITY_RANK[priority] > PRIORITY_RANK[queued.priority]) {
          this.promote(queued, priority);
        }
        return;
      }

      const entry: QueueEntry = { key, url, priority, subscribers: [], controller: null };
      this.addSubscriber(entry, sub);
      this.pendingByKey.set(key, entry);
      this.queues[priority].push(entry);
      this.schedulePump();
    });
  }

  async fetchJson<T>(opts: FetchOptions): Promise<T> {
    const res = await this.fetch(opts);
    if (!res.ok) throw new Error(`OpenF1 ${res.status} for ${opts.path}`);
    return (await res.json()) as T;
  }

  getMetrics(): OpenF1ClientMetrics {
    return {
      ...this.metrics,
      queueDepth: this.queues.high.length + this.queues.normal.length + this.queues.low.length,
      inflight: this.inflightByKey.size,
    };
  }

  onRequestEvent(cb: (e: RequestEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** test only — 큐/in-flight/metrics/타이머 초기화. listener 는 유지하지 않음. */
  _resetForTest(): void {
    this.bucket.reset();
    for (const p of PRIORITY_ORDER) this.queues[p].length = 0;
    this.pendingByKey.clear();
    for (const entry of this.inflightByKey.values()) entry.controller?.abort();
    this.inflightByKey.clear();
    this.listeners.clear();
    this.metrics = { totalRequests: 0, in429: 0, in5xx: 0, retries: 0 };
    this.pumpScheduled = false;
  }

  // ── 내부 ────────────────────────────────────────────────────────────────

  private addSubscriber(entry: QueueEntry, sub: Subscriber): void {
    entry.subscribers.push(sub);
    if (sub.signal) {
      const onAbort = (): void => this.handleSubscriberAbort(entry, sub);
      sub.onAbort = onAbort;
      sub.signal.addEventListener('abort', onAbort);
    }
  }

  private removeSubscriberListener(sub: Subscriber): void {
    if (sub.signal && sub.onAbort) sub.signal.removeEventListener('abort', sub.onAbort);
  }

  private handleSubscriberAbort(entry: QueueEntry, sub: Subscriber): void {
    const idx = entry.subscribers.indexOf(sub);
    if (idx === -1) return; // 이미 정리됨
    entry.subscribers.splice(idx, 1);
    this.removeSubscriberListener(sub);
    sub.reject(makeAbortError());

    if (entry.subscribers.length > 0) return; // 다른 caller 가 남아있으면 fetch 유지

    if (entry.controller) {
      // in-flight — 마지막 caller 가 떠남 → 실제 fetch/sleep cancel.
      entry.controller.abort();
    } else {
      // queued — 미발사 → 큐에서 제거.
      this.removeFromQueue(entry);
      this.pendingByKey.delete(entry.key);
    }
  }

  private removeFromQueue(entry: QueueEntry): void {
    const arr = this.queues[entry.priority];
    const idx = arr.indexOf(entry);
    if (idx !== -1) arr.splice(idx, 1);
  }

  private promote(entry: QueueEntry, priority: RequestPriority): void {
    this.removeFromQueue(entry);
    entry.priority = priority;
    this.queues[priority].push(entry);
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    // 동기 burst 의 모든 enqueue 가 끝난 뒤 한 번에 pump → priority 정렬 정확.
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pump();
    });
  }

  private dequeueHighest(): QueueEntry | null {
    for (const p of PRIORITY_ORDER) {
      const arr = this.queues[p];
      if (arr.length > 0) return arr[0];
    }
    return null;
  }

  private pump(): void {
    while (this.inflightByKey.size < this.maxConcurrent) {
      const entry = this.dequeueHighest();
      if (!entry) break;
      if (!this.bucket.tryTake()) break; // 토큰 없음 — refill 타이머가 재호출.
      this.removeFromQueue(entry);
      this.pendingByKey.delete(entry.key);
      this.inflightByKey.set(entry.key, entry);
      void this.dispatch(entry);
    }
  }

  private emit(e: RequestEvent): void {
    for (const cb of this.listeners) cb(e);
  }

  private async dispatch(entry: QueueEntry): Promise<void> {
    const controller = new AbortController();
    entry.controller = controller;
    const { url } = entry;

    try {
      for (let attempt = 0; ; attempt++) {
        this.metrics.totalRequests += 1;
        this.emit({ kind: 'send', url, priority: entry.priority });
        const startedAt = Date.now();
        const res = await this.fetchImpl(url, { signal: controller.signal });

        const isRetryable = res.status === 429 || (res.status >= 500 && res.status < 600);
        if (!isRetryable || attempt >= this.maxRetries) {
          this.emit({ kind: 'ok', url, status: res.status, ms: Date.now() - startedAt });
          this.resolveAll(entry, res);
          return;
        }

        if (res.status === 429) this.metrics.in429 += 1;
        else this.metrics.in5xx += 1;
        this.metrics.retries += 1;
        const waitMs = computeWaitMs(res, attempt, this.backoffBaseMs, this.backoffMaxMs);
        this.emit({ kind: 'retry', url, status: res.status, attempt, waitMs });
        if (import.meta.env.DEV) {
          console.warn(
            `[openF1Client] ${res.status} ${url} attempt=${attempt + 1} wait=${waitMs}ms`,
          );
        }
        await this.sleep(waitMs, controller.signal);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.emit({ kind: 'fail', url, error });
      this.rejectAll(entry, err);
    } finally {
      this.inflightByKey.delete(entry.key);
      entry.controller = null;
      this.schedulePump();
    }
  }

  private resolveAll(entry: QueueEntry, res: Response): void {
    // dedup share — 각 subscriber 가 body 를 독립적으로 읽도록 clone.
    for (const sub of entry.subscribers) {
      this.removeSubscriberListener(sub);
      sub.resolve(res.clone());
    }
    entry.subscribers.length = 0;
  }

  private rejectAll(entry: QueueEntry, err: unknown): void {
    for (const sub of entry.subscribers) {
      this.removeSubscriberListener(sub);
      sub.reject(err);
    }
    entry.subscribers.length = 0;
  }
}

/** 모듈-스코프 싱글톤 (production). 테스트는 new OpenF1Client(...) 직접 사용. */
export const openF1Client = new OpenF1Client();
