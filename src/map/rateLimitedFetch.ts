// 브라우저 client 용 429 backoff 헬퍼.
// scripts/_lib/openf1Client.ts 와 다른 구현 — 브라우저는 node 의존성 없음 + abort/timer 패턴.
//
// 정책:
//  - 429: Retry-After header (초 또는 HTTP date) 있으면 honor. 없으면 exponential backoff
//    (1s → 2s → 4s, max 30s). 최대 maxRetries 회 (기본 3).
//  - 5xx: 같은 backoff 로 재시도.
//  - 그 외 (4xx, 2xx): 즉시 반환 — caller 가 처리.
//  - network error (fetch throw): 재시도 안 함 (의도된 abort 일 가능성) → 그대로 throw.

export interface RateLimitedFetchOpts {
  /** 최대 재시도 횟수. 기본 3. */
  maxRetries?: number;
  /** Backoff 베이스 (ms). 기본 1000. exponential = base × 2^attempt. */
  backoffBaseMs?: number;
  /** Backoff 최대 (ms). 기본 30000. */
  backoffMaxMs?: number;
  /** sleep injection (테스트). 기본 setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** 429/5xx 발생 시 로그 콜백 (테스트/관찰). 기본 console.warn. */
  onRetry?: (info: { status: number; attempt: number; waitMs: number; url: string }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * fetch 호출을 감싸 429/5xx 응답 시 backoff 후 재시도.
 * 호출 측은 `await rateLimitedFetch(fetchImpl, url, opts)` 만 하면 됨.
 */
export async function rateLimitedFetch(
  fetchImpl: typeof fetch,
  url: string,
  opts: RateLimitedFetchOpts = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseMs = opts.backoffBaseMs ?? 1000;
  const maxMs = opts.backoffMaxMs ?? 30_000;
  const sleep = opts.sleep ?? defaultSleep;
  const onRetry = opts.onRetry ?? defaultOnRetry;

  for (let attempt = 0; ; ) {
    const res = await fetchImpl(url);
    if (res.status !== 429 && (res.status < 500 || res.status >= 600)) return res;
    if (attempt >= maxRetries) return res;
    const waitMs = computeWaitMs(res, attempt, baseMs, maxMs);
    onRetry({ status: res.status, attempt, waitMs, url });
    await sleep(waitMs);
    attempt++;
  }
  // Unreachable — exit is via the `return res` inside the loop.
}

/** Retry-After header 우선, 없으면 exponential backoff. */
function computeWaitMs(res: Response, attempt: number, baseMs: number, maxMs: number): number {
  const ra = res.headers.get('retry-after');
  if (ra) {
    const secs = Number(ra);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, maxMs);
    // HTTP-date 형식 fallback
    const t = Date.parse(ra);
    if (!Number.isNaN(t)) {
      const diff = t - Date.now();
      if (diff > 0) return Math.min(diff, maxMs);
    }
  }
  const exp = baseMs * Math.pow(2, attempt);
  return Math.min(exp, maxMs);
}

function defaultOnRetry(info: { status: number; attempt: number; waitMs: number; url: string }): void {
  console.warn(
    `[rateLimitedFetch] ${info.status} on attempt ${info.attempt + 1} — backing off ${info.waitMs}ms (${info.url})`,
  );
}
