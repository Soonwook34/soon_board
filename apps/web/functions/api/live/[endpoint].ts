/**
 * Cloudflare Pages Function: /api/live/[endpoint]
 *
 * Thin wrapper around the pure handler in `src/functions/live-handler.ts`.
 * Wiring lives here; logic lives in the handler so we can test it without a Workers runtime.
 *
 * Plan v2.3 §2.2 — Pages Functions replace the legacy `workers/live-proxy/` package.
 * Same-origin endpoint at `/api/live/*` — no CORS, no Wrangler routes file.
 */

import { handleLiveRequest } from '../../../src/functions/live-handler';

interface Env {
  LIVE_FALLBACK?: KVNamespace;
}

// In Cloudflare Workers/Pages Functions runtime, `caches.default` is a Cache provided
// by the platform (not in standard DOM CacheStorage). The augmentation lives in
// @cloudflare/workers-types but is not always picked up by Astro's TS resolver.
declare const caches: CacheStorage & { default: Cache };

// Module-level state survives across requests within the same isolate.
// AC-12d: in-memory dedup map for same-isolate thundering-herd defense.
// AC-12b: throttle map for KV writes (≥120s between writes to the same key).
const IN_FLIGHT = new Map<string, Promise<Response>>();
const LAST_KV_WRITE_AT = new Map<string, number>();

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const endpoint = ctx.params.endpoint;
  if (typeof endpoint !== 'string') {
    return new Response(JSON.stringify({ error: 'invalid_endpoint_param' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return handleLiveRequest(
    {
      request: ctx.request,
      endpoint,
      searchParams: url.searchParams,
    },
    {
      cache: caches.default,
      kv: ctx.env.LIVE_FALLBACK,
      fetchFn: fetch,
      now: () => Date.now(),
      inFlight: IN_FLIGHT,
      lastKvWriteAt: LAST_KV_WRITE_AT,
      waitUntil: (p) => ctx.waitUntil(p),
    },
  );
};
