// 카운트다운 포맷 — plan main-page-implementation.md §4.3.
//   > 24h  : "in {d}d {h}h"
//   > 1h   : "in {h}h {m}m"
//   > 1m   : "in {m}m {s}s"
//   < 1m   : "in {s}s"
//   ≤ 0    : "now"

const MS_DAY = 86_400_000;
const MS_HOUR = 3_600_000;
const MS_MINUTE = 60_000;

export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'now';

  if (remainingMs >= MS_DAY) {
    const d = Math.floor(remainingMs / MS_DAY);
    const h = Math.floor((remainingMs % MS_DAY) / MS_HOUR);
    return `in ${d}d ${h}h`;
  }

  if (remainingMs >= MS_HOUR) {
    const h = Math.floor(remainingMs / MS_HOUR);
    const m = Math.floor((remainingMs % MS_HOUR) / MS_MINUTE);
    return `in ${h}h ${m}m`;
  }

  if (remainingMs >= MS_MINUTE) {
    const m = Math.floor(remainingMs / MS_MINUTE);
    const s = Math.floor((remainingMs % MS_MINUTE) / 1000);
    return `in ${m}m ${s}s`;
  }

  const s = Math.ceil(remainingMs / 1000);
  return `in ${s}s`;
}
