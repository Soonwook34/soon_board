import { describe, expect, it, vi } from 'vitest';
import { OpenF1Client } from '../_lib/openf1Client.js';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

describe('OpenF1Client', () => {
  it('builds URL with raw operator keys (encodeURIComponent kills < > =)', async () => {
    const seen: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      seen.push(String(url));
      return jsonResponse([]);
    };
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      sleep: async () => {},
      fetchImpl,
      random: () => 0,
    });
    await client.get('/v1/session_result', { session_key: 9472, 'position<=': 3 });
    expect(seen[0]).toBe('https://x/v1/session_result?session_key=9472&position<=3');
  });

  it('throttles at the configured rate', async () => {
    const sleepCalls: number[] = [];
    const fetchImpl: typeof fetch = async () => jsonResponse([]);
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      rateLimitPerMin: 30, // 2000ms interval
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      fetchImpl,
      random: () => 0,
    });
    await client.get('/v1/meetings', {});
    await client.get('/v1/sessions', {});
    // First call: no throttle wait (lastRequestAt=0). Second call should sleep ≈2000ms.
    expect(sleepCalls.length).toBeGreaterThanOrEqual(1);
    const positive = sleepCalls.filter((m) => m > 0);
    expect(positive.length).toBe(1);
    expect(positive[0]).toBeGreaterThan(1000);
    expect(positive[0]).toBeLessThanOrEqual(2000);
  });

  it('retries with exponential backoff on 429 then succeeds', async () => {
    const calls: number[] = [];
    const sleepCalls: number[] = [];
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts++;
      calls.push(attempts);
      if (attempts < 3) {
        return new Response('', { status: 429 });
      }
      return jsonResponse([{ ok: true }]);
    };
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      fetchImpl,
      random: () => 0.5, // mid-jitter = base value
    });
    const result = await client.get<unknown[]>('/v1/x');
    expect(result).toEqual([{ ok: true }]);
    expect(attempts).toBe(3);
    expect(client.stats.rate_429_count).toBe(2);
    expect(client.stats.retries_total).toBe(2);
    // attempt 0 backoff ≈ 1000ms, attempt 1 ≈ 2000ms (random=0.5 → no jitter)
    expect(sleepCalls).toContain(1000);
    expect(sleepCalls).toContain(2000);
  });

  it('honours Retry-After header (seconds) over backoff calc', async () => {
    const sleepCalls: number[] = [];
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts++;
      if (attempts === 1) {
        return new Response('', { status: 429, headers: { 'Retry-After': '7' } });
      }
      return jsonResponse([]);
    };
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      fetchImpl,
      random: () => 0.5,
    });
    await client.get('/v1/x');
    // 7s Retry-After → 7000ms wait
    expect(sleepCalls).toContain(7000);
  });

  it('retries on 5xx and throws after max retries', async () => {
    const fetchImpl: typeof fetch = async () => new Response('', { status: 502 });
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      sleep: async () => {},
      fetchImpl,
      random: () => 0.5,
      maxRetries: 2,
    });
    await expect(client.get('/v1/x')).rejects.toThrow(/502/);
    expect(client.stats.server_5xx_count).toBe(3); // initial + 2 retries
    expect(client.stats.retries_total).toBe(2);
  });

  it('does not retry on non-retriable 4xx', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = vi.fn(async () => {
      attempts++;
      return new Response('', { status: 404 });
    });
    const client = new OpenF1Client({
      baseUrl: 'https://x',
      sleep: async () => {},
      fetchImpl,
      random: () => 0,
    });
    await expect(client.get('/v1/x')).rejects.toThrow(/404/);
    expect(attempts).toBe(1);
  });
});
