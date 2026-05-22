// 현재 시즌 런타임 재검증 — plan main-page-implementation.md §3.3 + §12 단계 10 + 인수 12.
// 흐름:
//   1. getSeason(year) 캐시 확인 (없으면 early return — 패치 대상 없음)
//   2. fetch('https://api.openf1.org/v1/sessions?year=YYYY') 1회 (AbortController 5s timeout)
//   3. openf1ToSessionMap으로 정규화 → diffSessions으로 변경 list 계산
//   4. 변경 있으면 _patchSessions로 in-memory patch (notify → useSyncExternalStore 리렌더)
//   5. 변경 list 반환 (호출자가 토스트 마운트 결정)
//
// 에러 정책: fetch reject / timeout / CORS / JSON parse 실패는 throw 금지 + console.warn + [] 반환.
// 인수 12는 "≤ 5s 이내 fetch 완료"만 요구. 실패 시 silent (재시도 없음 — 후속 일일 CI로 영구 반영).

import { _patchSessions, getSeason } from './catalogStore';
import { openf1ToSessionMap } from '../derived/openf1ToSessionMap';
import { diffSessions, type SessionChange } from '../derived/seasonDiff';

const DEFAULT_OPENF1_URL = (year: number): string =>
  `https://api.openf1.org/v1/sessions?year=${year}`;
const DEFAULT_TIMEOUT_MS = 5000;

export interface RevalidateOptions {
  fetchImpl?: typeof fetch;
  openf1Url?: (year: number) => string;
  timeoutMs?: number;
}

export async function revalidateCurrentSeason(
  year: number,
  opts: RevalidateOptions = {},
): Promise<SessionChange[]> {
  const cached = getSeason(year);
  if (!cached) return [];

  const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchImpl) {
    console.warn('[revalidateCurrentSeason] fetch not available');
    return [];
  }
  const urlFn = opts.openf1Url ?? DEFAULT_OPENF1_URL;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(urlFn(year), { signal: controller.signal });
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
