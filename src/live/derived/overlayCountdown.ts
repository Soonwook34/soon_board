// 라이브 카운트다운 오버레이 — plan main-page-implementation.md §5.
// HH:MM:SS 포맷, 시간은 unbounded (세션이 며칠 후일 수 있음 — 24h 이상도 그대로 누적).
// 음수는 0으로 clamp (lights out 도달 후 부모가 mode 전환하기 직전 한 frame에 한해 노출 가능).
// NaN/Infinity는 placeholder '--:--:--'.

export function formatHmsCountdown(ms: number): string {
  if (!Number.isFinite(ms)) return '--:--:--';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
