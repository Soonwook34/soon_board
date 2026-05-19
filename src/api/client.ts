import { ApiError, type EndpointName } from './types'
import { RateLimiter } from './rateLimiter'

export interface FetchJsonOptions {
  signal?: AbortSignal
  retryOn429?: boolean
}

export interface OpenF1ClientOptions {
  baseUrl?: string
  rateLimiter?: RateLimiter
  onServerDate?: (d: Date, perfNow: number) => void
}

const DEFAULT_BASE_URL = 'https://api.openf1.org/v1'
const MAX_RETRIES = 5
const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

function endpointFromPath(path: string): EndpointName {
  const segment = path.replace(/^\//, '').split('/')[0] as EndpointName
  return segment
}

function buildUrl(baseUrl: string, path: string, params?: Record<string, string | number>): string {
  const url = new URL(`${baseUrl}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v))
      }
    }
  }
  return url.toString()
}

export class OpenF1Client {
  private readonly baseUrl: string
  private readonly rateLimiter: RateLimiter
  private readonly onServerDate?: (d: Date, perfNow: number) => void
  private serverDateSynced = false

  constructor(opts?: OpenF1ClientOptions) {
    this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL
    this.rateLimiter = opts?.rateLimiter ?? new RateLimiter()
    this.onServerDate = opts?.onServerDate
  }

  async fetchJson<T>(
    path: string,
    params?: Record<string, string | number>,
    opts?: FetchJsonOptions,
  ): Promise<T> {
    const retryOn429 = opts?.retryOn429 ?? true
    const signal = opts?.signal
    const endpoint = endpointFromPath(path)
    const url = buildUrl(this.baseUrl, path, params)

    let backoffMs = BASE_BACKOFF_MS
    let attempt = 0

    for (;;) {
      // Acquire rate limiter token before each fetch
      await this.rateLimiter.acquire(signal)

      const res = await fetch(url, { signal })

      // Sync server time on first successful response
      if (res.ok && !this.serverDateSynced && this.onServerDate) {
        const dateHeader = res.headers.get('Date')
        if (dateHeader) {
          const serverDate = new Date(dateHeader)
          if (!isNaN(serverDate.getTime())) {
            this.serverDateSynced = true
            this.onServerDate(serverDate, performance.now())
          }
        }
      }

      if (res.ok) {
        return res.json() as Promise<T>
      }

      if (res.status === 429 && retryOn429 && attempt < MAX_RETRIES) {
        attempt++

        // Honor Retry-After header if present
        const retryAfter = res.headers.get('Retry-After')
        let waitMs = backoffMs
        if (retryAfter) {
          const retryAfterSecs = parseFloat(retryAfter)
          if (!isNaN(retryAfterSecs)) {
            waitMs = retryAfterSecs * 1000
          }
        }

        await sleep(waitMs, signal)
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS)
        continue
      }

      throw new ApiError(
        `OpenF1 API error ${res.status} on ${endpoint} (attempt ${attempt})`,
        res.status,
        endpoint,
        attempt,
      )
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const id = setTimeout(resolve, ms)

    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(id)
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
    }
  })
}
