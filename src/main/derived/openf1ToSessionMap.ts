// OpenF1 /v1/sessions?year=YYYY 응답을 SessionData 부분 패치 Map으로 변환.
// plan main-page-implementation.md §3.3.
// 변환 책임: session_key 기반 lookup용 Map 생성. date_*는 string, is_cancelled는 boolean일 때만 채택.
// 잘못된 row(타입 불일치, session_key 없음)는 silent skip — 외부 boundary 입력이므로 방어.

import type { FreshSessionPatch } from './seasonDiff';

export interface OpenF1SessionRaw {
  session_key: number;
  date_start?: string;
  date_end?: string;
  is_cancelled?: boolean;
}

export function openf1ToSessionMap(rows: unknown): Map<number, FreshSessionPatch> {
  const out = new Map<number, FreshSessionPatch>();
  if (!Array.isArray(rows)) return out;
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.session_key !== 'number') continue;
    const patch: FreshSessionPatch = {};
    if (typeof row.date_start === 'string') patch.date_start = row.date_start;
    if (typeof row.date_end === 'string') patch.date_end = row.date_end;
    if (typeof row.is_cancelled === 'boolean') patch.is_cancelled = row.is_cancelled;
    out.set(row.session_key, patch);
  }
  return out;
}
