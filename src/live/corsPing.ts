// OpenF1 CORS/연결 헬스 체크 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// 라이브/리플레이 라우트 진입 시 1회 호출 → 실패면 CorsFailedNotice 표시 + 라이브맵/대시보드 마운트 보류.
//
// fetch 디테일은 openF1Client 싱글톤에 위임한다 (plan openf1-client.md Step 2, AC11).
// 브라우저가 cross-origin 으로 api.openf1.org 에 요청 → 성공하면 CORS 허용으로 간주.
// 에러 정책: throw 금지 — 모든 실패는 boolean false + console.warn (Phase 10 revalidate와 동일 패턴).

import { openF1Client, type OpenF1Client } from '../shared/openf1Client.js';

const DEFAULT_TIMEOUT_MS = 5000;

export interface PingOptions {
  /** test seam — 기본은 모듈 싱글톤 openF1Client. */
  client?: OpenF1Client;
  timeoutMs?: number;
}

export async function pingOpenF1(opts: PingOptions = {}): Promise<boolean> {
  const client = opts.client ?? openF1Client;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // mode:'cors' 를 명시하지 않아도 cross-origin GET 은 브라우저에서 기본 'cors' →
    // 기존 직접 fetch 의 CORS 헬스 체크 동작과 동일. client 가 fetch 디테일 소유.
    const res = await client.fetch({
      path: '/v1/sessions',
      params: { session_key: 'latest' },
      priority: 'low',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[pingOpenF1] HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[pingOpenF1] CORS/network failure', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
