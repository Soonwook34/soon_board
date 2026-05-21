/**
 * Live Pages Function handler — pure logic.
 *
 * Wrapped by `apps/web/functions/api/live/[endpoint].ts`.
 * All dependencies (cache, KV, fetch, now, in-flight map) are injected so the
 * handler is fully testable without a Workers runtime.
 *
 * Plan v2.3 contracts implemented:
 *   AC-12   bucket-aligned cache key, 3-stage SWR (fresh / stale / miss)
 *   AC-12b  KV fallback throttled to ≥120s per (endpoint × bucket)
 *   AC-12d  same-isolate thundering-herd dedup via in-memory Map<key, Promise>
 *   AC-12e  OpenF1 429/5xx → KV last-known-good fallback
 */

export const ENDPOINT_BUCKETS_MS: Record<string, number> = {
  location: 10_000,
  position: 10_000,
  race_control: 15_000,
  intervals: 15_000,
  laps: 30_000,
  pit: 30_000,
  stints: 60_000,
  weather: 60_000,
};

export const KV_FALLBACK_THROTTLE_MS = 120_000;
export const KV_FALLBACK_EXPIRATION_S = 3600;
export const OPENF1_USER_AGENT = 'SOON-BOARD/fan-project +https://soon-board.pages.dev';
export const OPENF1_BASE = 'https://api.openf1.org/v1';

export const ALLOWED_ENDPOINTS = new Set(Object.keys(ENDPOINT_BUCKETS_MS));

export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
}

export interface CacheLike {
  match(req: Request): Promise<Response | undefined>;
  put(req: Request, res: Response): Promise<void>;
}

export interface HandlerDeps {
  cache: CacheLike;
  kv?: KVNamespaceLike;
  fetchFn: typeof fetch;
  now: () => number;
  inFlight: Map<string, Promise<Response>>;
  lastKvWriteAt: Map<string, number>;
  /** Receives ctx.waitUntil promises — tests can await these directly. */
  waitUntil: (p: Promise<unknown>) => void;
}

export interface HandlerContext {
  request: Request;
  endpoint: string;
  searchParams: URLSearchParams;
}

const HEADER_GENERATED_AT = 'X-Soonboard-Generated-At';
const HEADER_SOURCE = 'X-Soonboard-Source';
const HEADER_STALE_REASON = 'X-Soonboard-Stale-Reason';

/** Inject the bucket query param so the cache key snaps to the endpoint's cadence. */
export function alignToBucket(endpoint: string, now: number): { bucket: number; bucketMs: number } {
  const bucketMs = ENDPOINT_BUCKETS_MS[endpoint] ?? 10_000;
  return {
    bucket: Math.floor(now / bucketMs) * bucketMs,
    bucketMs,
  };
}

export function buildCacheKey(req: Request, bucket: number): Request {
  const url = new URL(req.url);
  url.searchParams.set('bucket', String(bucket));
  // Cloudflare's caches.default keys off Request URL + Vary headers; URL alone is sufficient here.
  return new Request(url.toString(), { method: 'GET', headers: req.headers });
}

/**
 * Stable key for KV fallback storage. Excludes the bucket param so that subsequent
 * buckets overwrite the same KV entry (last-known-good semantics) and the 120s
 * throttle is applied per (endpoint × session_key), not per (endpoint × bucket).
 * Plan AC-12b.
 */
export function buildFallbackKey(endpoint: string, searchParams: URLSearchParams): string {
  const stable = new URLSearchParams(searchParams);
  stable.delete('bucket');
  // Sort keys for determinism across clients that order query params differently.
  const sorted = [...stable.entries()].sort(([a], [b]) => a.localeCompare(b));
  const qs = sorted.map(([k, v]) => `${k}=${v}`).join('&');
  return `fallback:${endpoint}:${qs}`;
}

export function buildUpstreamUrl(endpoint: string, searchParams: URLSearchParams): string {
  // Drop bucket + any cache-busting tokens before forwarding upstream.
  const forwarded = new URLSearchParams(searchParams);
  forwarded.delete('bucket');
  return `${OPENF1_BASE}/${endpoint}?${forwarded.toString()}`;
}

function withHeader(res: Response, name: string, value: string): Response {
  const headers = new Headers(res.headers);
  headers.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function setSource(res: Response, source: string): Response {
  return withHeader(res, HEADER_SOURCE, source);
}

async function readKvFallback(
  kv: KVNamespaceLike | undefined,
  fallbackKey: string,
): Promise<Response | null> {
  if (!kv) return null;
  const body = await kv.get(fallbackKey);
  if (!body) return null;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      [HEADER_SOURCE]: 'kv-fallback',
    },
  });
}

function shouldWriteKv(lastMap: Map<string, number>, key: string, now: number): boolean {
  const last = lastMap.get(key) ?? 0;
  return now - last >= KV_FALLBACK_THROTTLE_MS;
}

/** Fetch OpenF1, cache the response, optionally update KV last-known-good. */
async function fetchAndCache(
  ctx: HandlerContext,
  deps: HandlerDeps,
  cacheKey: Request,
): Promise<Response> {
  const fallbackKey = buildFallbackKey(ctx.endpoint, ctx.searchParams);
  const upstreamUrl = buildUpstreamUrl(ctx.endpoint, ctx.searchParams);
  let upstream: Response;
  try {
    upstream = await deps.fetchFn(upstreamUrl, {
      method: 'GET',
      headers: {
        'User-Agent': OPENF1_USER_AGENT,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    return fallbackOrError(ctx, deps, fallbackKey, {
      stale_reason: 'upstream_network_error',
      cause: err instanceof Error ? err.message : String(err),
    });
  }

  if (upstream.status === 429 || upstream.status >= 500) {
    return fallbackOrError(ctx, deps, fallbackKey, {
      stale_reason: upstream.status === 429 ? 'rate_limited' : 'upstream_error',
      status: upstream.status,
    });
  }

  if (!upstream.ok) {
    // Pass through 4xx as-is — likely a client error (bad session_key etc.).
    return setSource(upstream, 'origin-4xx');
  }

  const body = await upstream.text();
  const now = deps.now();
  const response = new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=10',
      [HEADER_GENERATED_AT]: String(now),
      [HEADER_SOURCE]: 'origin',
    },
  });

  deps.waitUntil(deps.cache.put(cacheKey, response.clone()));

  // AC-12b: throttle KV writes to ≥120s per (endpoint × session_key), bucket-independent.
  if (deps.kv && shouldWriteKv(deps.lastKvWriteAt, fallbackKey, now)) {
    deps.lastKvWriteAt.set(fallbackKey, now);
    deps.waitUntil(
      deps.kv.put(fallbackKey, body, { expirationTtl: KV_FALLBACK_EXPIRATION_S }),
    );
  }

  return response;
}

async function fallbackOrError(
  _ctx: HandlerContext,
  deps: HandlerDeps,
  fallbackKey: string,
  reason: { stale_reason: string; status?: number; cause?: string },
): Promise<Response> {
  const fallback = await readKvFallback(deps.kv, fallbackKey);
  if (fallback) {
    const tagged = withHeader(fallback, HEADER_STALE_REASON, reason.stale_reason);
    const source = reason.stale_reason === 'rate_limited' ? 'kv-fallback-429' : 'kv-fallback';
    return setSource(tagged, source);
  }
  return new Response(
    JSON.stringify({
      error: 'upstream_unavailable',
      detail: reason,
    }),
    {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        [HEADER_SOURCE]: 'error',
        [HEADER_STALE_REASON]: reason.stale_reason,
      },
    },
  );
}

/** Same-isolate thundering-herd dedup: every concurrent miss shares one fetch. */
async function dedupedFetch(
  ctx: HandlerContext,
  deps: HandlerDeps,
  cacheKey: Request,
): Promise<Response> {
  const key = cacheKey.url;
  const existing = deps.inFlight.get(key);
  if (existing) {
    const shared = await existing;
    // Each caller needs its own readable Body (Response bodies are single-use).
    return shared.clone();
  }
  const promise = fetchAndCache(ctx, deps, cacheKey).finally(() => {
    deps.inFlight.delete(key);
  });
  deps.inFlight.set(key, promise);
  const result = await promise;
  return result.clone();
}

/** Main entry. Returns a Response in all paths (200, 4xx pass-through, 503 KV-miss fallback). */
export async function handleLiveRequest(
  ctx: HandlerContext,
  deps: HandlerDeps,
): Promise<Response> {
  if (!ALLOWED_ENDPOINTS.has(ctx.endpoint)) {
    return new Response(
      JSON.stringify({
        error: 'unknown_endpoint',
        endpoint: ctx.endpoint,
        allowed: [...ALLOWED_ENDPOINTS],
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const now = deps.now();
  const { bucket, bucketMs } = alignToBucket(ctx.endpoint, now);
  const cacheKey = buildCacheKey(ctx.request, bucket);

  const cached = await deps.cache.match(cacheKey);

  if (cached) {
    const generatedAt = Number(cached.headers.get(HEADER_GENERATED_AT) ?? '0');
    const age = now - generatedAt;
    const freshMs = bucketMs;
    const staleMs = bucketMs * 3;

    if (age < freshMs) {
      return setSource(cached, 'cache-fresh');
    }
    if (age < staleMs) {
      // Stale hit: serve immediately and refresh in background.
      deps.waitUntil(dedupedFetch(ctx, deps, cacheKey).catch(() => undefined));
      return setSource(cached, 'cache-stale');
    }
    // Too stale — fall through to a fresh fetch.
  }

  return await dedupedFetch(ctx, deps, cacheKey);
}
