// dashboard — 시간/갭 표시 포맷 SSOT. 리더보드 ⑤·빠른랩 배지 ⑧·디테일 §3.2/§3.3 공용.
// 패널마다 중복 정의되던 lap/sector/gap 포맷을 한 곳에 모은다 (동작 보존).

const NO_VALUE = '—';

/** 91.456 → '1:31.456'. 음수/NaN/null 은 '—'. */
export function formatLapTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return NO_VALUE;
  const min = Math.floor(sec / 60);
  const rem = sec - min * 60;
  return `${min}:${rem.toFixed(3).padStart(6, '0')}`;
}

/** 섹터 시간(초) → 'S.mmm' (소수 3자리). 음수/NaN/null 은 '—'. */
export function formatSector(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return NO_VALUE;
  return sec.toFixed(3);
}

/** interval/gap_to_leader: 숫자 → '+s.mmm', 문자열(lapped '+1 LAP' 등) → 그대로, null → '—'. */
export function formatGap(value: number | string | null | undefined): string {
  if (value == null) return NO_VALUE;
  if (typeof value === 'number') return `+${value.toFixed(3)}`;
  return value;
}
