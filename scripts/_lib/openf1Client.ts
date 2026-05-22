// OpenF1 fetch wrapper — token-bucket rate limit + exponential backoff + jitter + retry
// 정책 출처:
//  - docs/deployment-architecture.md §3.1 (critic C2 — 25 req/min, exp backoff, max 5 retry, Retry-After 우선)
//  - docs/openf1-api-reference.md §3.1 (무료 한도 30 req/min — 25로 보수 운영)
//  - openf1-api-reference §3.2 (응답은 항상 JSON 배열, 빈 결과는 [])
//
// 본 모듈은 GitHub Actions runner / 로컬 빌드에서만 사용 (브라우저 X). 단일 메인테이너 API라
// 차단 위험이 실제로 존재 — 보수적 스로틀 유지.

const DEFAULT_BASE_URL = 'https://api.openf1.org';
const DEFAULT_RATE_LIMIT_PER_MIN = 25;
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
const JITTER_RATIO = 0.25;

export interface OpenF1ClientOptions {
  baseUrl?: string;
  /** Override rate-limit interval (req/min). Default 25. */
  rateLimitPerMin?: number;
  /** Injected sleep (defaults to setTimeout). For tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected fetch (defaults to global fetch). For tests where msw isn't easy. */
  fetchImpl?: typeof fetch;
  /** Injected random source [0,1). Defaults to Math.random. For deterministic jitter in tests. */
  random?: () => number;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Max retry attempts. Default 5. */
  maxRetries?: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class OpenF1Client {
  private readonly baseUrl: string;
  private readonly intervalMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly fetchImpl: typeof fetch;
  private readonly random: () => number;
  private readonly maxRetries: number;
  private lastRequestAt = 0;

  constructor(opts: OpenF1ClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.OPENF1_BASE_URL ?? DEFAULT_BASE_URL;
    const perMin = opts.rateLimitPerMin ?? DEFAULT_RATE_LIMIT_PER_MIN;
    this.intervalMs = Math.ceil(60_000 / perMin);
    this.sleep = opts.sleep ?? defaultSleep;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.random = opts.random ?? Math.random;
    this.maxRetries = opts.maxRetries ?? MAX_RETRIES;
  }

  /** Counters surfaced in GitHub Actions step summary (deployment-architecture §3.1). */
  public stats = {
    requests_total: 0,
    retries_total: 0,
    rate_429_count: 0,
    server_5xx_count: 0,
  };

  async get<T = unknown>(
    path: string,
    query: Record<string, string | number | boolean | undefined> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path, query);

    let attempt = 0;
    while (true) {
      await this.throttle();
      this.stats.requests_total++;
      let res: Response;
      try {
        res = await this.fetchImpl(url, { signal });
      } catch (err) {
        if (attempt >= this.maxRetries) throw err;
        this.stats.retries_total++;
        await this.sleep(this.computeBackoff(attempt));
        attempt++;
        continue;
      }

      if (res.ok) {
        return (await res.json()) as T;
      }

      const retriable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (res.status === 429) this.stats.rate_429_count++;
      if (res.status >= 500 && res.status < 600) this.stats.server_5xx_count++;

      if (!retriable || attempt >= this.maxRetries) {
        throw new Error(`OpenF1 ${res.status} ${res.statusText}: ${url}`);
      }

      const retryAfter = parseRetryAfter(res.headers.get('Retry-After'));
      const wait = retryAfter ?? this.computeBackoff(attempt);
      this.stats.retries_total++;
      await this.sleep(wait);
      attempt++;
    }
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.lastRequestAt + this.intervalMs - now;
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private computeBackoff(attempt: number): number {
    const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
    const delta = base * JITTER_RATIO;
    const jittered = base + (this.random() * 2 - 1) * delta;
    return Math.max(0, jittered);
  }
}

function buildUrl(
  baseUrl: string,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): string {
  const entries = Object.entries(query).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  );
  if (entries.length === 0) return `${baseUrl}${path}`;

  // OpenF1 쿼리는 키에 비교 연산자(>, <, >=, <=)를 직접 붙이는 형식:
  //   ?position<=3, ?lap_duration>0  (등호는 키의 일부, 값 앞에 별도 `=` 없음)
  // encodeURIComponent는 키의 < > = 를 변환해버려 서버가 인식 못 함. 키는 raw 통과.
  // 연산자로 끝나는 키와 일반 키를 구분해 결합 형식을 분기.
  const qs = entries
    .map(([k, v]) => {
      const value = encodeURIComponent(String(v));
      return /[<>=]$/.test(k) ? `${k}${value}` : `${k}=${value}`;
    })
    .join('&');
  return `${baseUrl}${path}?${qs}`;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

