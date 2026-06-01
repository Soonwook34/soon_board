// 현재 시즌 런타임 재검증 — plan main-page-implementation.md §3.3 + §12 단계 10 + 인수 12.
// 흐름:
//   1. getSeason(year) 캐시 확인 (없으면 early return — 패치 대상 없음)
//   2. client.fetch({path:'/v1/sessions', params:{year}}) 1회 (AbortController 5s timeout)
//   3. openf1ToSessionMap으로 정규화 → diffSessions으로 변경 list 계산
//   4. 변경 있으면 _patchSessions로 in-memory patch (notify → useSyncExternalStore 리렌더)
//   5. 변경 list 반환 (호출자가 토스트 마운트 결정)
//
// 에러 정책: fetch reject / timeout / CORS / JSON parse 실패는 throw 금지 + console.warn + [] 반환.
// 인수 12는 "≤ 5s 이내 fetch 완료"만 요구. 실패 시 silent — revalidate 자체는 재시도 안 함(영구
// 반영은 후속 일일 CI). client 가 5xx 를 내부 재시도해도 아래 5s timeout abort 가 총 대기를 상한한다.
//
// fetch 디테일은 openF1Client 싱글톤에 위임 (plan openf1-client.md Step 6, AC15). priority='low'
// — 메인페이지 백그라운드 revalidate 라 사용자 가시성 0 (ping 과 동급).

import { _patchSessions, getSeason } from './catalogStore';
import { openf1ToSessionMap } from '../derived/openf1ToSessionMap';
import { diffSessions, type SessionChange } from '../derived/seasonDiff';
import { openF1Client, type OpenF1Client } from '../../shared/openf1Client';

const DEFAULT_TIMEOUT_MS = 5000;

export interface RevalidateOptions {
  /** test seam — 기본은 모듈 싱글톤 openF1Client. */
  client?: OpenF1Client;
  timeoutMs?: number;
}

export async function revalidateCurrentSeason(
  year: number,
  opts: RevalidateOptions = {},
): Promise<SessionChange[]> {
  const cached = getSeason(year);
  if (!cached) return [];

  const client = opts.client ?? openF1Client;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await client.fetch({
      path: '/v1/sessions',
      params: { year },
      priority: 'low',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[revalidateCurrentSeason] HTTP ${res.status} for year ${year}`);
      return [];
    }
    const rows = (await res.json()) as unknown;
    const fresh = openf1ToSessionMap(rows);
    const changes = diffSessions(cached, fresh);
    if (changes.length > 0) _patchSessions(year, fresh);
    return changes;
  } catch (err) {
    console.warn('[revalidateCurrentSeason] background fetch failed', err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
