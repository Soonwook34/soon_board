// 모든 OpenF1 호출자 테스트가 공유하는 mock client factory (plan Step 1.5).
//
// 각 테스트가 fetchImpl 을 직접 주입하던 패턴을 1곳으로 통일한다 (AC17). 실제
// OpenF1Client 를 mock fetch 로 감싸 반환하므로 dedup/priority/abort 등 client
// 동작은 진짜이고, 네트워크/타이머만 가짜다. *.test.ts 가 아니므로 vitest 가
// 테스트로 수집하지 않는다 (SyntheticDataSource.ts 와 동일 위치/규약).

import { vi } from 'vitest';
import { OpenF1Client, type OpenF1ClientOptions } from '../openf1Client.js';

/** pathname(예: '/v1/sessions') → 응답 핸들러. init.signal 은 client 내부 abort 신호. */
export type MockRoute = (url: string, init: { signal: AbortSignal }) => Response | Promise<Response>;

export interface MockOpenF1ClientResult {
  /** 실제 OpenF1Client — mock fetch + 즉시 sleep + rate gating 없음. */
  client: OpenF1Client;
  /** 내부 fetch spy — 호출 횟수/인자 assertion 용. */
  fetchMock: ReturnType<typeof vi.fn>;
}

function jsonOk(body: unknown = []): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * routes 에 pathname 별 핸들러를 주면 해당 응답, 없으면 fallback(기본 200 []).
 * opts 로 fallback 및 임의의 OpenF1ClientOptions(capacity/sleep 등) override 가능.
 */
export function createMockOpenF1Client(
  routes: Record<string, MockRoute> = {},
  opts: { fallback?: MockRoute } & Partial<OpenF1ClientOptions> = {},
): MockOpenF1ClientResult {
  const { fallback = () => jsonOk(), ...clientOpts } = opts;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = new URL(url).pathname;
    const handler = routes[path] ?? fallback;
    return handler(url, { signal: init?.signal as AbortSignal });
  });
  const client = new OpenF1Client({
    fetchImpl: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    ratePerSecond: 1000,
    bucketCapacity: 1000,
    ...clientOpts,
  });
  return { client, fetchMock };
}
