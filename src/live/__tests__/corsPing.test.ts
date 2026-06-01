import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingOpenF1 } from '../corsPing';
import {
  createMockOpenF1Client,
  type MockRoute,
} from '../../shared/__tests__/createMockOpenF1Client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pingOpenF1 (via openF1Client)', () => {
  it('returns true on 200 OK', async () => {
    const { client, fetchMock } = createMockOpenF1Client();
    const ok = await pingOpenF1({ client });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('calls client with /v1/sessions session_key=latest at low priority', async () => {
    const { client } = createMockOpenF1Client();
    const sends: Array<{ url: string; priority: string }> = [];
    client.onRequestEvent((e) => {
      if (e.kind === 'send') sends.push({ url: e.url, priority: e.priority });
    });
    await pingOpenF1({ client });
    expect(sends).toHaveLength(1);
    expect(sends[0].url).toContain('/v1/sessions');
    expect(sends[0].url).toContain('session_key=latest');
    expect(sends[0].priority).toBe('low');
  });

  it('returns false on non-2xx response (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { client } = createMockOpenF1Client({
      '/v1/sessions': () => new Response('', { status: 404 }),
    });
    const ok = await pingOpenF1({ client });
    expect(ok).toBe(false);
  });

  it('returns false on network/CORS error (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const route: MockRoute = () => {
      throw new TypeError('Failed to fetch (CORS)');
    };
    const { client } = createMockOpenF1Client({ '/v1/sessions': route });
    const ok = await pingOpenF1({ client });
    expect(ok).toBe(false);
  });

  it('returns false on timeout via AbortController (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 핸들러가 응답하지 않고 abort 신호만 honor → corsPing 의 5ms timeout 이 abort 발화.
    const route: MockRoute = (_url, init) =>
      new Promise<Response>((_, reject) => {
        init.signal.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    const { client } = createMockOpenF1Client({ '/v1/sessions': route });
    const ok = await pingOpenF1({ client, timeoutMs: 5 });
    expect(ok).toBe(false);
  });
});
