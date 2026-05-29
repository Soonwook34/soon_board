// OpenF1 CORS preflight 헬스 체크 — plan main-page-implementation.md §12 단계 11 + critic P0-4.
// 라이브/리플레이 라우트 진입 시 1회 호출 → 실패면 CorsFailedNotice 표시 + 라이브맵/대시보드 마운트 보류.
//
// fetch options에 mode: 'cors' 명시 → 브라우저가 preflight OPTIONS 요청을 보내고
// Access-Control-Allow-Origin 헤더 확인. OpenF1이 CORS 정책 바꾸면 여기서 false 반환.
// 에러 정책: throw 금지 — 모든 실패는 boolean false + console.warn (Phase 10 revalidate와 동일 패턴).

// NOTE: OpenF1 v1 API는 `limit` 쿼리 파라미터를 인식하지 못하고 404 ("No results found")를 반환한다.
// session_key=latest 단독으로 호출하여 단일 row만 응답받는다.
const DEFAULT_PING_URL = 'https://api.openf1.org/v1/sessions?session_key=latest';
const DEFAULT_TIMEOUT_MS = 5000;

export interface PingOptions {
  fetchImpl?: typeof fetch;
  url?: string;
  timeoutMs?: number;
}

export async function pingOpenF1(opts: PingOptions = {}): Promise<boolean> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    console.warn('[pingOpenF1] fetch not available');
    return false;
  }
  const url = opts.url ?? DEFAULT_PING_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { mode: 'cors', signal: controller.signal });
    if (!res.ok) {
      console.warn(`[pingOpenF1] HTTP ${res.status} ${url}`);
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
