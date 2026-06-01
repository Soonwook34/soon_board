// OpenF1Client 단위 테스트 — .omc/plans/openf1-client.md Step 1.
// AC1-AC10 + AC5a-d (abort) + AC7a-b (priority promotion / FIFO) 커버.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OpenF1Client,
  openF1Client,
  type OpenF1ClientOptions,
  type RequestEvent,
} from '../openf1Client.js';

// ── 헬퍼 ─────────────────────────────────────────────────────────────────

function res(status: number, body = '{}', headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } });
}

/** name='AbortError' 인 Error — 실제 fetch abort 시뮬레이션용. */
function abortErr(): Error {
  const e = new Error('aborted');
  e.name = 'AbortError';
  return e;
}

/** rate gating 없는 기본 client (behavior 격리용). 개별 테스트가 옵션 override 가능. */
function makeClient(opts: Partial<OpenF1ClientOptions>): OpenF1Client {
  return new OpenF1Client({ ratePerSecond: 1000, bucketCapacity: 1000, sleep: async () => {}, ...opts });
}

/** real-timer 테스트용 macrotask flush — 모든 pending microtask 를 비운다. */
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const asFetch = (fn: unknown): typeof fetch => fn as unknown as typeof fetch;

/** mock.calls 인자 타입이 [number, AbortSignal?] 로 추론되도록 명시 시그니처 부여. */
const recordSleep = () => vi.fn(async (_ms: number, _signal?: AbortSignal) => {});

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ── US-001: API surface + URL 빌드 ────────────────────────────────────────

describe('OpenF1Client — API surface (US-001)', () => {
  it('싱글톤은 인스턴스이고 초기 metrics shape 가 완전하다', () => {
    expect(openF1Client).toBeInstanceOf(OpenF1Client);
    const m = openF1Client.getMetrics();
    expect(Object.keys(m).sort()).toEqual([
      'in429',
      'in5xx',
      'inflight',
      'queueDepth',
      'retries',
      'totalRequests',
    ]);
  });

  it('URL: params alphabetical sort + operator-suffix(date>=) + encodeURIComponent', async () => {
    const fetchImpl = vi.fn(async () => res(200));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const sendUrls: string[] = [];
    client.onRequestEvent((e) => {
      if (e.kind === 'send') sendUrls.push(e.url);
    });
    await client.fetch({
      path: '/v1/laps',
      params: { session_key: 123, 'date>=': '2023-01-01T00:00:00', active: true },
    });
    expect(sendUrls[0]).toBe(
      'https://api.openf1.org/v1/laps?active=true&date>=2023-01-01T00%3A00%3A00&session_key=123',
    );
  });
});

// ── US-002: 토큰 버킷 (AC1) ───────────────────────────────────────────────

describe('OpenF1Client — token bucket (AC1)', () => {
  it('capacity=1 → 동시 호출이 >= 334ms 간격으로 순차 발사', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => res(200));
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 1,
      sleep: async () => {},
    });
    for (let i = 0; i < 4; i++) void client.fetch({ path: '/v1/laps', params: { driver_number: i } });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // t=0 첫 발사
    await vi.advanceTimersByTimeAsync(333);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 334 미만 — 아직
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // t=334 두 번째
    await vi.advanceTimersByTimeAsync(334);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // t=668
    await vi.advanceTimersByTimeAsync(334);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // t=1002
  });

  it('capacity=3 → 첫 3개 burst 후 334ms 간격', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => res(200));
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 3,
      sleep: async () => {},
    });
    for (let i = 0; i < 5; i++) void client.fetch({ path: '/v1/laps', params: { n: i } });

    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // burst
    await vi.advanceTimersByTimeAsync(334);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(334);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});

// ── US-003: dedup + priority promotion (AC2, AC7a) ────────────────────────

describe('OpenF1Client — in-flight dedup + promotion (AC2, AC7a)', () => {
  it('AC2: 동일 (path,params) 10 동시 호출 → 1 fetch, 각자 독립 body read', async () => {
    const fetchImpl = vi.fn(async () => res(200, JSON.stringify({ ok: true })));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const ps = Array.from({ length: 10 }, () =>
      client.fetchJson<{ ok: boolean }>({ path: '/v1/laps', params: { session_key: 123 } }),
    );
    const results = await Promise.all(ps);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    for (const r of results) expect(r.ok).toBe(true);
  });

  it('in-flight dedup: 발사 후 같은 key caller 는 결과만 share', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolveFetch = r)));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const p1 = client.fetch({ path: '/x', params: { k: 1 } });
    await flush(); // p1 dispatched (in-flight, pending)
    const p2 = client.fetch({ path: '/x', params: { k: 1 } });
    resolveFetch(res(200));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('AC7a: queued low 가 같은 key high join 시 promote → normal 보다 먼저', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      order.push(new URL(url).pathname);
      return res(200);
    });
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 1,
      sleep: async () => {},
    });
    void client.fetch({ path: '/shared', params: { k: 1 }, priority: 'low' });
    void client.fetch({ path: '/other', params: { k: 2 }, priority: 'normal' });
    void client.fetch({ path: '/shared', params: { k: 1 }, priority: 'high' }); // promote

    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['/shared']); // promote 된 high 가 먼저
    await vi.advanceTimersByTimeAsync(334);
    expect(order).toEqual(['/shared', '/other']);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // shared 는 dedup → 1
  });
});

// ── US-004: priority queue 순서 (AC6, AC7, AC7b) ──────────────────────────

describe('OpenF1Client — priority queue (AC6, AC7b)', () => {
  it('AC6/AC7: high > normal > low 순으로 발사 (enqueue 역순이어도)', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      order.push(new URL(url).pathname);
      return res(200);
    });
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 1,
      sleep: async () => {},
    });
    void client.fetch({ path: '/low', priority: 'low' });
    void client.fetch({ path: '/normal', priority: 'normal' });
    void client.fetch({ path: '/high', priority: 'high' });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(334);
    await vi.advanceTimersByTimeAsync(334);
    expect(order).toEqual(['/high', '/normal', '/low']);
  });

  it('AC7b: 같은 priority 내 enqueue 순서(FIFO) 보존', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      order.push(new URL(url).pathname);
      return res(200);
    });
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 1,
      sleep: async () => {},
    });
    void client.fetch({ path: '/a', priority: 'normal' });
    void client.fetch({ path: '/b', priority: 'normal' });
    void client.fetch({ path: '/c', priority: 'normal' });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(334);
    await vi.advanceTimersByTimeAsync(334);
    expect(order).toEqual(['/a', '/b', '/c']);
  });
});

// ── US-005: backoff (AC3, AC4) ────────────────────────────────────────────

describe('OpenF1Client — backoff (AC3, AC4)', () => {
  it('AC3: 429 then 200 → 1회 재시도 후 200, sleep 1회', async () => {
    const queue = [res(429), res(200)];
    const fetchImpl = vi.fn(async () => queue.shift()!);
    const sleep = vi.fn(async () => {});
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    const r = await client.fetch({ path: '/x' });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('AC3: Retry-After 숫자 → 해당 ms sleep', async () => {
    const queue = [res(429, '{}', { 'retry-after': '5' }), res(200)];
    const fetchImpl = vi.fn(async () => queue.shift()!);
    const sleep = vi.fn(async () => {});
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    await client.fetch({ path: '/x' });
    expect(sleep).toHaveBeenCalledWith(5000, expect.anything());
  });

  it('AC3: Retry-After HTTP-date → 미래 diff 만큼 sleep', async () => {
    const future = new Date(Date.now() + 5000).toUTCString();
    const queue = [res(429, '{}', { 'retry-after': future }), res(200)];
    const fetchImpl = vi.fn(async () => queue.shift()!);
    const sleep = recordSleep();
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    await client.fetch({ path: '/x' });
    const waited = sleep.mock.calls[0][0];
    expect(waited).toBeGreaterThan(3000);
    expect(waited).toBeLessThanOrEqual(5000);
  });

  it('AC3: Retry-After 없으면 exponential 1s→2s→4s, 최종 429 resolve', async () => {
    const fetchImpl = vi.fn(async () => res(429));
    const sleep = recordSleep();
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    const r = await client.fetch({ path: '/x' });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
    expect(r.status).toBe(429); // rateLimitedFetch 시맨틱: 마지막 응답 resolve
  });

  it('AC3: backoff 가 backoffMaxMs 로 cap', async () => {
    const fetchImpl = vi.fn(async () => res(429));
    const sleep = recordSleep();
    const client = makeClient({
      fetchImpl: asFetch(fetchImpl),
      sleep,
      maxRetries: 5,
      backoffBaseMs: 10_000,
      backoffMaxMs: 15_000,
    });
    await client.fetch({ path: '/x' });
    const waits = sleep.mock.calls.map((c) => c[0]);
    expect(waits[0]).toBe(10_000);
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBe(15_000);
  });

  it('AC4: 5xx(503) then 200 → 동일 backoff 로 재시도', async () => {
    const queue = [res(503), res(200)];
    const fetchImpl = vi.fn(async () => queue.shift()!);
    const sleep = vi.fn(async () => {});
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    const r = await client.fetch({ path: '/x' });
    expect(r.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('AC4: 4xx(404) → 즉시 반환, 재시도 없음; fetchJson 은 throw', async () => {
    const fetchImpl = vi.fn(async () => res(404));
    const sleep = vi.fn(async () => {});
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    const r = await client.fetch({ path: '/x' });
    expect(r.status).toBe(404);
    expect(sleep).not.toHaveBeenCalled();
    await expect(client.fetchJson({ path: '/x' })).rejects.toThrow(/404/);
  });
});

// ── US-006: abort (AC5a-d) ────────────────────────────────────────────────

describe('OpenF1Client — abort (AC5a-d)', () => {
  it('이미 aborted signal → 즉시 reject, fetch 미발사', async () => {
    const fetchImpl = vi.fn(async () => res(200));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(client.fetch({ path: '/x', signal: ctrl.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('AC5a: solo queued abort → queue 에서 제거, reject, fetch 미발사', async () => {
    // schedule no-op → 토큰 refill 안 함 → blocker 가 유일 토큰을 영구 점유.
    const fetchImpl = vi.fn(() => new Promise<Response>(() => {}));
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 3,
      bucketCapacity: 1,
      schedule: () => () => {},
      sleep: async () => {},
    });
    void client.fetch({ path: '/blocker' });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const ctrl = new AbortController();
    const target = client.fetch({ path: '/target', signal: ctrl.signal });
    await flush();
    expect(client.getMetrics().queueDepth).toBe(1);

    ctrl.abort();
    await expect(target).rejects.toMatchObject({ name: 'AbortError' });
    expect(client.getMetrics().queueDepth).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // target 은 발사 안 됨
  });

  it('AC5b: 3 caller dedup 중 1명 abort → 나머지 2명 정상 수신, fetch 유지', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolveFetch = r)));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const c1 = new AbortController();
    const p1 = client.fetch({ path: '/x', params: { k: 1 }, signal: c1.signal });
    const p2 = client.fetch({ path: '/x', params: { k: 1 } });
    const p3 = client.fetch({ path: '/x', params: { k: 1 } });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    c1.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });

    resolveFetch(res(200));
    const [r2, r3] = await Promise.all([p2, p3]);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // in-flight 계속, 재발사 없음
  });

  it('AC5c: 모든 share caller abort → in-flight fetch cancel, inflight=0', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(abortErr()));
        }),
    );
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const c1 = new AbortController();
    const c2 = new AbortController();
    const p1 = client.fetch({ path: '/x', params: { k: 1 }, signal: c1.signal });
    const p2 = client.fetch({ path: '/x', params: { k: 1 }, signal: c2.signal });
    await flush();
    expect(client.getMetrics().inflight).toBe(1);

    c1.abort();
    c2.abort();
    await expect(p1).rejects.toMatchObject({ name: 'AbortError' });
    await expect(p2).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(client.getMetrics().inflight).toBe(0);
  });

  it('AC5d: 429 backoff sleep 중 abort → 즉시 깨움, 재시도 없음', async () => {
    const fetchImpl = vi.fn(async () => res(429));
    const sleep = vi.fn(
      (_ms: number, signal?: AbortSignal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(abortErr()));
        }),
    );
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep });
    const ctrl = new AbortController();
    const p = client.fetch({ path: '/x', signal: ctrl.signal });
    await flush(); // dispatched → 429 → sleep 진입
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(1);

    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1); // 재시도 없음
  });
});

// ── US-007: observability (AC8, AC9, AC10) + maxConcurrent ────────────────

describe('OpenF1Client — observability (AC8, AC9, AC10)', () => {
  it('AC8: getMetrics 카운터 정확', async () => {
    const aQ = [res(429), res(200)];
    const cQ = [res(503), res(200)];
    const fetchImpl = vi.fn(async (url: string) => {
      // 주의: '//api' 때문에 url.includes('/a') 는 모든 URL 에 매치 → pathname 정확 비교.
      const p = new URL(url).pathname;
      if (p === '/a') return aQ.shift()!;
      if (p === '/c') return cQ.shift()!;
      return res(200);
    });
    const client = makeClient({ fetchImpl: asFetch(fetchImpl), sleep: async () => {} });
    await client.fetch({ path: '/a' });
    await client.fetch({ path: '/b' });
    await client.fetch({ path: '/c' });
    expect(client.getMetrics()).toEqual({
      totalRequests: 5, // a:2 + b:1 + c:2
      in429: 1,
      in5xx: 1,
      retries: 2,
      queueDepth: 0,
      inflight: 0,
    });
  });

  it('AC9: send/ok 이벤트 발화 + unsubscribe 후 leak 없음', async () => {
    const fetchImpl = vi.fn(async () => res(200));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const events: RequestEvent[] = [];
    const off = client.onRequestEvent((e) => events.push(e));
    await client.fetch({ path: '/x' });
    expect(events.map((e) => e.kind)).toEqual(['send', 'ok']);

    off();
    events.length = 0;
    await client.fetch({ path: '/y' });
    expect(events).toHaveLength(0);
  });

  it('AC9: retry 이벤트(429) + fail 이벤트(network error)', async () => {
    const q = [res(429), res(200)];
    const retryClient = makeClient({ fetchImpl: asFetch(vi.fn(async () => q.shift()!)), sleep: async () => {} });
    const ev: RequestEvent[] = [];
    retryClient.onRequestEvent((e) => ev.push(e));
    await retryClient.fetch({ path: '/x' });
    expect(ev.map((e) => e.kind)).toEqual(['send', 'retry', 'send', 'ok']);

    const failClient = makeClient({
      fetchImpl: asFetch(
        vi.fn(async () => {
          throw new Error('boom');
        }),
      ),
    });
    const fev: RequestEvent[] = [];
    failClient.onRequestEvent((e) => fev.push(e));
    await expect(failClient.fetch({ path: '/z' })).rejects.toThrow('boom');
    expect(fev.some((e) => e.kind === 'fail')).toBe(true);
  });

  it('AC10: 429 시 dev 환경에서 console.warn', async () => {
    const q = [res(429), res(200)];
    const client = makeClient({ fetchImpl: asFetch(vi.fn(async () => q.shift()!)), sleep: async () => {} });
    await client.fetch({ path: '/x' });
    expect(warnSpy).toHaveBeenCalled(); // import.meta.env.DEV === true in vitest
  });

  it('AC10: prod(DEV=false) 에서는 429 여도 console.warn 안 함 (noise 방지)', async () => {
    vi.stubEnv('DEV', false);
    const q = [res(429), res(200)];
    const client = makeClient({ fetchImpl: asFetch(vi.fn(async () => q.shift()!)), sleep: async () => {} });
    await client.fetch({ path: '/x' });
    expect(warnSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('dedupeKey override: 다른 params 라도 같은 dedupeKey 면 1 fetch 공유', async () => {
    let resolveFetch!: (r: Response) => void;
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => (resolveFetch = r)));
    const client = makeClient({ fetchImpl: asFetch(fetchImpl) });
    const p1 = client.fetch({ path: '/x', params: { a: 1 }, dedupeKey: 'SHARED' });
    await flush(); // p1 in-flight
    const p2 = client.fetch({ path: '/y', params: { b: 2 }, dedupeKey: 'SHARED' });
    resolveFetch(res(200));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maxConcurrent: 동시 in-flight 상한 (safety net)', async () => {
    const pendings: Array<(r: Response) => void> = [];
    const fetchImpl = vi.fn(() => new Promise<Response>((r) => pendings.push(r)));
    const client = new OpenF1Client({
      fetchImpl: asFetch(fetchImpl),
      ratePerSecond: 1000,
      bucketCapacity: 1000,
      maxConcurrent: 2,
      sleep: async () => {},
    });
    for (let i = 0; i < 5; i++) void client.fetch({ path: '/x', params: { n: i } });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 2개로 cap
    expect(client.getMetrics().inflight).toBe(2);

    pendings[0](res(200));
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 슬롯 1개 해제 → 다음 발사

    for (const r of pendings) r(res(200)); // cleanup
    await flush();
  });
});
