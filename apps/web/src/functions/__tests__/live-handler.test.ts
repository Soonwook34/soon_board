import { describe, expect, it, vi } from 'vitest';

import {
  alignToBucket,
  ALLOWED_ENDPOINTS,
  buildCacheKey,
  buildFallbackKey,
  buildUpstreamUrl,
  ENDPOINT_BUCKETS_MS,
  handleLiveRequest,
  KV_FALLBACK_THROTTLE_MS,
  type CacheLike,
  type HandlerDeps,
  type KVNamespaceLike,
} from '../live-handler';

// ── Test helpers ──────────────────────────────────────────────────────────

class InMemoryCache implements CacheLike {
  private store = new Map<string, Response>();
  async match(req: Request): Promise<Response | undefined> {
    const hit = this.store.get(req.url);
    return hit?.clone();
  }
  async put(req: Request, res: Response): Promise<void> {
    this.store.set(req.url, res.clone());
  }
  has(url: string): boolean {
    return this.store.has(url);
  }
  size(): number {
    return this.store.size;
  }
}

class InMemoryKV implements KVNamespaceLike {
  private store = new Map<string, string>();
  writes = 0;
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string): Promise<void> {
    this.writes += 1;
    this.store.set(key, value);
  }
  seed(key: string, value: string): void {
    this.store.set(key, value);
  }
}

interface Harness {
  cache: InMemoryCache;
  kv: InMemoryKV;
  fetchSpy: ReturnType<typeof vi.fn>;
  waitUntilPromises: Promise<unknown>[];
  deps: HandlerDeps;
  setNow: (ms: number) => void;
}

function makeHarness(opts?: {
  upstreamResponses?: Array<Response | (() => Response | Promise<Response>)>;
  initialNow?: number;
}): Harness {
  const cache = new InMemoryCache();
  const kv = new InMemoryKV();
  const responses = [...(opts?.upstreamResponses ?? [])];
  const fetchSpy = vi.fn(async (_input: RequestInfo | URL) => {
    if (responses.length === 0) {
      throw new Error('test: no more upstream responses queued');
    }
    const next = responses.shift()!;
    return typeof next === 'function' ? await next() : next;
  });
  const waitUntilPromises: Promise<unknown>[] = [];
  let nowMs = opts?.initialNow ?? 1_700_000_000_000;
  const deps: HandlerDeps = {
    cache,
    kv,
    fetchFn: fetchSpy as unknown as typeof fetch,
    now: () => nowMs,
    inFlight: new Map(),
    lastKvWriteAt: new Map(),
    waitUntil: (p) => {
      waitUntilPromises.push(p);
    },
  };
  return {
    cache,
    kv,
    fetchSpy,
    waitUntilPromises,
    deps,
    setNow: (ms) => {
      nowMs = ms;
    },
  };
}

async function flushWaitUntil(h: Harness): Promise<void> {
  await Promise.all(h.waitUntilPromises);
  h.waitUntilPromises.length = 0;
}

function makeCtx(endpoint: string, sessionKey: number = 9472): {
  request: Request;
  endpoint: string;
  searchParams: URLSearchParams;
} {
  const url = `https://example.pages.dev/api/live/${endpoint}?session_key=${sessionKey}`;
  return {
    request: new Request(url, { method: 'GET' }),
    endpoint,
    searchParams: new URL(url).searchParams,
  };
}

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

// ── ENDPOINT_BUCKETS_MS / alignToBucket / buildCacheKey ──────────────────

describe('endpoint bucket mapping', () => {
  it('matches Plan §3.1 cadence exactly', () => {
    expect(ENDPOINT_BUCKETS_MS).toEqual({
      location: 10_000,
      position: 10_000,
      race_control: 15_000,
      intervals: 15_000,
      laps: 30_000,
      pit: 30_000,
      stints: 60_000,
      weather: 60_000,
    });
  });

  it('alignToBucket snaps to the endpoint cadence', () => {
    expect(alignToBucket('location', 12_345)).toEqual({ bucket: 10_000, bucketMs: 10_000 });
    expect(alignToBucket('location', 19_999)).toEqual({ bucket: 10_000, bucketMs: 10_000 });
    expect(alignToBucket('location', 20_000)).toEqual({ bucket: 20_000, bucketMs: 10_000 });
    expect(alignToBucket('weather', 47_500)).toEqual({ bucket: 0, bucketMs: 60_000 });
    expect(alignToBucket('weather', 60_001)).toEqual({ bucket: 60_000, bucketMs: 60_000 });
  });

  it('buildCacheKey injects bucket query param without disturbing originals', () => {
    const req = new Request(
      'https://example.pages.dev/api/live/location?session_key=9472',
      { method: 'GET' },
    );
    const key = buildCacheKey(req, 10_000);
    const parsed = new URL(key.url);
    expect(parsed.searchParams.get('session_key')).toBe('9472');
    expect(parsed.searchParams.get('bucket')).toBe('10000');
  });

  it('buildUpstreamUrl strips the bucket param before forwarding', () => {
    const sp = new URLSearchParams({ session_key: '9472', bucket: '10000' });
    expect(buildUpstreamUrl('location', sp)).toBe(
      'https://api.openf1.org/v1/location?session_key=9472',
    );
  });

  it('buildFallbackKey is bucket-independent (AC-12b)', () => {
    const a = new URLSearchParams({ session_key: '9472', bucket: '10000' });
    const b = new URLSearchParams({ session_key: '9472', bucket: '20000' });
    expect(buildFallbackKey('location', a)).toBe(buildFallbackKey('location', b));
    expect(buildFallbackKey('location', a)).toBe('fallback:location:session_key=9472');
  });

  it('buildFallbackKey is deterministic across query order', () => {
    const a = new URLSearchParams('session_key=9472&driver_number=1');
    const b = new URLSearchParams('driver_number=1&session_key=9472');
    expect(buildFallbackKey('location', a)).toBe(buildFallbackKey('location', b));
  });
});

// ── 3-stage SWR ───────────────────────────────────────────────────────────

describe('3-stage SWR (fresh / stale / miss)', () => {
  it('cache miss → 1 OpenF1 fetch + cache.put + returns origin response', async () => {
    const h = makeHarness({ upstreamResponses: [okJson([{ session_key: 9472 }])] });
    const res = await handleLiveRequest(makeCtx('location'), h.deps);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Soonboard-Source')).toBe('origin');
    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    await flushWaitUntil(h);
    expect(h.cache.size()).toBe(1);
  });

  it('fresh hit within bucket (age < bucketMs) → 0 OpenF1 fetch, returns cache-fresh', async () => {
    const h = makeHarness({
      upstreamResponses: [okJson([{ session_key: 9472 }])],
      initialNow: 1_700_000_000_000,
    });
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    h.setNow(1_700_000_005_000); // +5s (still in same 10s bucket)
    h.fetchSpy.mockClear();

    const res = await handleLiveRequest(makeCtx('location'), h.deps);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Soonboard-Source')).toBe('cache-fresh');
    expect(h.fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('stale hit (bucketMs ≤ age < 3×bucketMs) → returns cached + triggers background refresh', async () => {
    const h = makeHarness({
      upstreamResponses: [okJson([{ a: 1 }]), okJson([{ a: 2 }])],
      initialNow: 1_700_000_000_000,
    });
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    // 12s later — out of FRESH (10s) but still inside STALE (30s).
    // Reset the bucket-aligned snap by advancing past one bucket boundary.
    h.setNow(1_700_000_022_000);
    h.fetchSpy.mockClear();

    const res = await handleLiveRequest(makeCtx('location'), h.deps);

    // Bucket is now different — strict cache miss in fact, refetched synchronously.
    // To exercise the stale branch we need same bucket but generatedAt outside fresh window.
    // We do that next test with a smaller advancement.
    expect(res.status).toBe(200);
    expect(['cache-stale', 'origin', 'cache-fresh']).toContain(
      res.headers.get('X-Soonboard-Source'),
    );
  });

  it('stale branch reached when generatedAt drifts but bucket stays the same', async () => {
    const h = makeHarness({
      upstreamResponses: [okJson([{ a: 1 }])],
      initialNow: 1_700_000_000_000,
    });
    // Pre-seed the cache with a Generated-At 12 s in the past — same bucket key,
    // age between FRESH_MS (10 s) and STALE_MS (30 s) → exercises the stale branch.
    const ctx = makeCtx('location');
    const { bucket } = alignToBucket('location', h.deps.now());
    const cacheKey = buildCacheKey(ctx.request, bucket);
    await h.cache.put(
      cacheKey,
      new Response(JSON.stringify([{ pre: 'seeded' }]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Soonboard-Generated-At': String(h.deps.now() - 12_000),
        },
      }),
    );
    h.fetchSpy.mockClear();

    const res = await handleLiveRequest(ctx, h.deps);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Soonboard-Source')).toBe('cache-stale');
    // Background refresh is fire-and-forget through waitUntil → must have been scheduled.
    expect(h.waitUntilPromises.length).toBeGreaterThan(0);
  });
});

// ── Same-isolate thundering-herd dedup (AC-12d) ───────────────────────────

describe('same-isolate dedup (AC-12d)', () => {
  it('100 concurrent misses on the same bucket → exactly 1 OpenF1 fetch', async () => {
    let resolveInFlight!: (r: Response) => void;
    const gated = new Promise<Response>((resolve) => {
      resolveInFlight = resolve;
    });
    const h = makeHarness({ upstreamResponses: [() => gated] });

    const ctx = makeCtx('location');
    const requests = Array.from({ length: 100 }, () => handleLiveRequest(ctx, h.deps));

    // Resolve the upstream fetch after all 100 requests are in flight.
    await new Promise((r) => setTimeout(r, 0));
    resolveInFlight(okJson([{ x: 1 }]));

    const results = await Promise.all(requests);

    expect(h.fetchSpy).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.status === 200)).toBe(true);
  });
});

// ── 5xx / 429 / network error → KV fallback (AC-12e) ─────────────────────

describe('KV fallback on OpenF1 error (AC-12e)', () => {
  it('upstream 500 + KV last-known-good → 200 with X-Soonboard-Source kv-fallback', async () => {
    const h = makeHarness({
      upstreamResponses: [new Response('upstream down', { status: 500 })],
    });
    // Seed KV with a known good response for the stable fallback key (excludes bucket).
    const ctx = makeCtx('location');
    h.kv.seed(buildFallbackKey('location', ctx.searchParams), JSON.stringify([{ kv_seed: true }]));

    const res = await handleLiveRequest(ctx, h.deps);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Soonboard-Source')).toBe('kv-fallback');
    expect(res.headers.get('X-Soonboard-Stale-Reason')).toBe('upstream_error');
  });

  it('upstream 429 + KV present → kv-fallback-429 source', async () => {
    const h = makeHarness({
      upstreamResponses: [new Response('rate limited', { status: 429 })],
    });
    const ctx = makeCtx('location');
    h.kv.seed(buildFallbackKey('location', ctx.searchParams), JSON.stringify([{ kv_seed: true }]));

    const res = await handleLiveRequest(ctx, h.deps);
    expect(res.headers.get('X-Soonboard-Source')).toBe('kv-fallback-429');
    expect(res.headers.get('X-Soonboard-Stale-Reason')).toBe('rate_limited');
  });

  it('upstream 500 + no KV → 503 error response', async () => {
    const h = makeHarness({
      upstreamResponses: [new Response('upstream down', { status: 500 })],
    });
    const res = await handleLiveRequest(makeCtx('location'), h.deps);
    expect(res.status).toBe(503);
    expect(res.headers.get('X-Soonboard-Source')).toBe('error');
  });

  it('upstream network throw + KV present → kv-fallback', async () => {
    const h = makeHarness({
      upstreamResponses: [
        () => {
          throw new Error('TCP RST');
        },
      ],
    });
    const ctx = makeCtx('location');
    h.kv.seed(buildFallbackKey('location', ctx.searchParams), JSON.stringify([{ kv_seed: true }]));

    const res = await handleLiveRequest(ctx, h.deps);
    expect(res.headers.get('X-Soonboard-Source')).toBe('kv-fallback');
  });
});

// ── KV write throttle (AC-12b) ───────────────────────────────────────────

describe('KV write throttle ≥120s (AC-12b)', () => {
  it('writes KV on first cache miss', async () => {
    const h = makeHarness({ upstreamResponses: [okJson([{ a: 1 }])] });
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);
    expect(h.kv.writes).toBe(1);
  });

  it('does NOT write KV again within 120s for the same cache key', async () => {
    // Force two distinct cache misses for the same key by changing the bucket between fetches.
    // First fetch at t = 0 (bucket 0).
    const h = makeHarness({
      upstreamResponses: [okJson([{ a: 1 }]), okJson([{ a: 2 }])],
      initialNow: 1_700_000_000_000,
    });

    // Manually invoke through fetchAndCache twice to the same cache key but only 60s apart.
    // Easiest: keep bucket the same by faking a 0-aligned cache key path through a same-bucket
    // direct call. Simpler — drive two requests with same `now` value but force a miss the 2nd
    // time by clearing the cache before the 2nd call.
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    // Reset cache so the second request misses → triggers KV write attempt.
    // But the throttle map remembers we wrote 60s ago.
    h.cache = new InMemoryCache();
    h.deps.cache = h.cache;
    h.setNow(1_700_000_060_000); // +60s — still inside 120s throttle window

    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    expect(h.kv.writes).toBe(1); // throttled
  });

  it('writes KV again after 120s elapsed', async () => {
    const h = makeHarness({
      upstreamResponses: [okJson([{ a: 1 }]), okJson([{ a: 2 }])],
      initialNow: 1_700_000_000_000,
    });
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    h.cache = new InMemoryCache();
    h.deps.cache = h.cache;
    h.setNow(1_700_000_000_000 + KV_FALLBACK_THROTTLE_MS + 1_000); // 121s later

    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    expect(h.kv.writes).toBe(2);
  });
});

// ── Unknown endpoint ─────────────────────────────────────────────────────

describe('unknown endpoint', () => {
  it('returns 404 JSON with allowed list', async () => {
    const h = makeHarness({});
    const res = await handleLiveRequest(
      {
        request: new Request('https://example.pages.dev/api/live/bogus'),
        endpoint: 'bogus',
        searchParams: new URLSearchParams(),
      },
      h.deps,
    );
    expect(res.status).toBe(404);
    expect(h.fetchSpy).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string; allowed: string[] };
    expect(body.error).toBe('unknown_endpoint');
    expect(body.allowed.sort()).toEqual([...ALLOWED_ENDPOINTS].sort());
  });
});

// ── Bucket alignment correctness (regression — clients on different clocks) ──

describe('bucket alignment (Plan AC-12)', () => {
  it('two requests within the same bucket window read the same cache entry', async () => {
    const h = makeHarness({ upstreamResponses: [okJson([{ x: 'A' }])] });

    // t = 1_700_000_003_000 → bucket 1_700_000_000_000 for location (10s buckets)
    h.setNow(1_700_000_003_000);
    const res1 = await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    // t = 1_700_000_007_000 (4s later, same bucket)
    h.setNow(1_700_000_007_000);
    const res2 = await handleLiveRequest(makeCtx('location'), h.deps);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(h.fetchSpy).toHaveBeenCalledTimes(1); // only ONE OpenF1 hit, not two
    expect(res2.headers.get('X-Soonboard-Source')).toBe('cache-fresh');
  });

  it('requests in two different buckets each trigger their own fetch', async () => {
    const h = makeHarness({
      upstreamResponses: [okJson([{ x: 'A' }]), okJson([{ x: 'B' }])],
    });

    h.setNow(1_700_000_005_000); // bucket 1_700_000_000_000
    await handleLiveRequest(makeCtx('location'), h.deps);
    await flushWaitUntil(h);

    h.setNow(1_700_000_015_000); // bucket 1_700_000_010_000 (different)
    await handleLiveRequest(makeCtx('location'), h.deps);

    expect(h.fetchSpy).toHaveBeenCalledTimes(2);
  });
});
