// 결과 미리보기 포맷팅 헬퍼 — plan main-page-implementation.md §8.2.
// formatLapDuration: OpenF1의 lap_duration (초 단위 number) → "M:SS.mmm" 표시 문자열.
// 음수/NaN/Infinity 같은 비정상 입력은 '—'로 fallback (Phase 1 빌드 스크립트가 항상
// 양수만 저장하지만 런타임 안전망).

export function formatLapDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const totalMs = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMs / 60_000);
  const remainderMs = totalMs - minutes * 60_000;
  const secs = Math.floor(remainderMs / 1000);
  const ms = remainderMs - secs * 1000;
  return `${minutes}:${String(secs).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}
