// createMockOpenF1Client factory self-test (plan Step 1.5).

import { describe, expect, it } from 'vitest';
import { createMockOpenF1Client } from './createMockOpenF1Client.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createMockOpenF1Client', () => {
  it('매칭 route 없으면 fallback 으로 기본 200 [] 응답', async () => {
    const { client, fetchMock } = createMockOpenF1Client();
    const res = await client.fetch({ path: '/v1/anything' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pathname 별 route 매칭', async () => {
    const { client } = createMockOpenF1Client({
      '/v1/sessions': () => json([{ session_key: 9 }]),
    });
    const r = await client.fetchJson<Array<{ session_key: number }>>({
      path: '/v1/sessions',
      params: { session_key: 'latest' },
    });
    expect(r[0].session_key).toBe(9);
  });

  it('실제 client 동작(dedup) 통과 — 같은 key 2 호출 → 1 fetch', async () => {
    const { client, fetchMock } = createMockOpenF1Client();
    const [a, b] = await Promise.all([
      client.fetch({ path: '/v1/laps', params: { session_key: 1 } }),
      client.fetch({ path: '/v1/laps', params: { session_key: 1 } }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
