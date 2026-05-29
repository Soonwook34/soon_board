// 브라우저 client 의 429/5xx backoff 헬퍼 — Retry-After honor + exponential backoff.

import { describe, expect, it, vi } from 'vitest';
import { rateLimitedFetch } from '../rateLimitedFetch.js';

function makeRes(status: number, headers: Record<string, string> = {}): Response {
  return new Response('{}', { status, headers: { 'content-type': 'application/json', ...headers } });
}

describe('rateLimitedFetch — 2xx/4xx 즉시 반환', () => {
  it('200 → 호출 1회, 그대로 반환', async () => {
    const fetchImpl = vi.fn(async () => makeRes(200));
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('404 → 호출 1회, 그대로 반환 (재시도 안 함)', async () => {
    const fetchImpl = vi.fn(async () => makeRes(404));
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
  });
});

describe('rateLimitedFetch — 429 backoff', () => {
  it('429 then 200 → 1회 재시도 후 200 반환, sleep 1회 호출', async () => {
    const responses = [makeRes(429), makeRes(200)];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', { sleep });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('Retry-After: "5" (초) → 5000ms sleep', async () => {
    const responses = [makeRes(429, { 'retry-after': '5' }), makeRes(200)];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async (_ms: number) => {});
    await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', { sleep });
    expect(sleep).toHaveBeenCalledWith(5000);
  });

  it('Retry-After 없으면 exponential backoff (1s → 2s → 4s)', async () => {
    const fetchImpl = vi.fn(async () => makeRes(429));
    const sleep = vi.fn(async (_ms: number) => {});
    await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', { sleep, maxRetries: 3 });
    // 3 retries: backoff(0)=1000, backoff(1)=2000, backoff(2)=4000
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000, 4000]);
    expect(fetchImpl).toHaveBeenCalledTimes(4); // initial + 3 retries
  });

  it('maxRetries 초과 시 마지막 429 반환 (포기)', async () => {
    const fetchImpl = vi.fn(async () => makeRes(429));
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', {
      sleep,
      maxRetries: 2,
    });
    expect(res.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('backoff 가 backoffMaxMs 로 cap', async () => {
    const fetchImpl = vi.fn(async () => makeRes(429));
    const sleep = vi.fn(async (_ms: number) => {});
    await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', {
      sleep,
      maxRetries: 5,
      backoffBaseMs: 10_000,
      backoffMaxMs: 15_000,
    });
    // exp(0)=10k, exp(1)=20k→cap 15k, exp(2)=40k→15k, exp(3)=80k→15k, exp(4)=160k→15k
    const waits = sleep.mock.calls.map((c) => c[0]);
    expect(waits[0]).toBe(10_000);
    for (let i = 1; i < waits.length; i++) expect(waits[i]).toBe(15_000);
  });
});

describe('rateLimitedFetch — 5xx 동일 backoff', () => {
  it('503 then 200 → 재시도', async () => {
    const responses = [makeRes(503), makeRes(200)];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', { sleep });
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('500 maxRetries 초과 → 마지막 응답', async () => {
    const fetchImpl = vi.fn(async () => makeRes(500));
    const sleep = vi.fn(async (_ms: number) => {});
    const res = await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'x', {
      sleep,
      maxRetries: 1,
    });
    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('rateLimitedFetch — onRetry 콜백', () => {
  it('재시도 시 onRetry 가 status/attempt/waitMs/url 와 함께 호출', async () => {
    const responses = [makeRes(429, { 'retry-after': '2' }), makeRes(200)];
    const fetchImpl = vi.fn(async () => responses.shift()!);
    const sleep = vi.fn(async (_ms: number) => {});
    const onRetry = vi.fn();
    await rateLimitedFetch(fetchImpl as unknown as typeof fetch, 'http://x/y', {
      sleep,
      onRetry,
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith({
      status: 429,
      attempt: 0,
      waitMs: 2000,
      url: 'http://x/y',
    });
  });
});
