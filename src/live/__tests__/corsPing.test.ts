import { afterEach, describe, expect, it, vi } from 'vitest';
import { pingOpenF1 } from '../corsPing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pingOpenF1', () => {
  it('returns true on 200 OK', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', { status: 200 }));
    const ok = await pingOpenF1({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('passes mode: cors in fetch options', async () => {
    let seenInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      seenInit = init;
      return new Response('[]', { status: 200 });
    });
    await pingOpenF1({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(seenInit?.mode).toBe('cors');
    expect(seenInit?.signal).toBeDefined();
  });

  it('returns false on non-2xx response (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    const ok = await pingOpenF1({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(false);
  });

  it('returns false on network/CORS error (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch (CORS)');
    });
    const ok = await pingOpenF1({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(ok).toBe(false);
  });

  it('returns false on timeout via AbortController (no throw)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const ok = await pingOpenF1({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 5,
    });
    expect(ok).toBe(false);
  });

  it('uses custom URL when provided', async () => {
    let seenUrl = '';
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      seenUrl = String(url);
      return new Response('[]', { status: 200 });
    });
    await pingOpenF1({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      url: 'https://example/v1/sessions?session_key=latest&limit=1',
    });
    expect(seenUrl).toBe('https://example/v1/sessions?session_key=latest&limit=1');
  });
});
