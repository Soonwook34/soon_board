// dashboard §4.5 — 드라이버 "out"(DNF/DNS/DSQ) 상태를 display_time(t) 기준으로 판정.
// undated session_result 는 시간 컷이 안 되므로(인수18) 컴포넌트가 직접 쓰면 미래 누설(✕ 가 t=0 부터 노출).
// 본 헬퍼가 단일 진입점: undated dnf/dns/dsq + number_of_laps 를 **시간 컷된 완료 랩**과 결합해
// "실제 리타이어 시점 이후"에만 non-null. raw date 비교 없이 getCompletedLapsBefore 만 사용.

import type { DataSource } from '../../shared/DataSource';

export type OutKind = 'dnf' | 'dns' | 'dsq' | null;

/**
 * 드라이버가 t 시점에 out 인지. 아니면 null.
 * - DNS: 미출발 → 세션 시작부터 'dns'(완료 랩과 무관).
 * - DNF/DSQ: 최신 완료 랩 lap_number 가 자기 최종 완료 랩 수(number_of_laps)에 도달한 뒤에만 노출.
 *   (랩 도중 리타이어 → 최대 ~1랩 이른 노출, t=0 노출 대비 압도적 개선.)
 * - 완주(dnf=false) 또는 number_of_laps 불명 → null(보수적 숨김, 미래 누설 zero).
 * 라이브 모드는 getSessionResult 가 항상 null → 항상 null.
 */
export function driverOutAt(ds: DataSource, driverNumber: number, t: Date): OutKind {
  const res = ds.getSessionResult(driverNumber);
  if (!res) return null;
  if (res.dns) return 'dns';
  if ((res.dnf || res.dsq) && res.number_of_laps != null) {
    const lastLapNum = ds.getCompletedLapsBefore(driverNumber, t, 1)[0]?.lap_number ?? 0;
    if (lastLapNum >= res.number_of_laps) return res.dnf ? 'dnf' : 'dsq';
  }
  return null;
}
