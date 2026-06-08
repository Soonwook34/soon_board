// 세션 종류(SessionKind) 해석 SSOT — qualifying-session-dashboard.md §3.1.
// OpenF1 /sessions 의 session_type(Practice/Qualifying/Race) 와 session_name(Practice 1/2/3,
// Qualifying, Sprint Qualifying|Sprint Shootout, Sprint, Race) 을 **함께** 보고 5종으로 정규화한다.
// session_type 단독으로는 Sprint→Race, Sprint Qualifying→Qualifying 로 병합되므로 두 필드가 모두 필요.

export type SessionKind = 'practice' | 'qualifying' | 'sprint_qualifying' | 'sprint' | 'race';

/**
 * (session_type, session_name) → SessionKind. 매핑 불가 시 null.
 * 우선순위: 가장 구체적인 이름(스프린트 계열)부터 판정해야 session_type 의 광역 분류에 가려지지 않는다.
 * - (Race, 'Sprint') → 'sprint' (session_type 만 보면 race 로 오판)
 * - (Qualifying, 'Sprint Qualifying'|'Sprint Shootout') → 'sprint_qualifying' (오판 시 qualifying)
 */
export function resolveSessionKind(sessionType: string, sessionName: string): SessionKind | null {
  const type = sessionType.trim().toLowerCase();
  const name = sessionName.trim().toLowerCase();

  // 1) 스프린트 퀄리(= 2023 Sprint Shootout) — name 기준 (session_type 은 'Qualifying')
  if (name === 'sprint qualifying' || name === 'sprint shootout') return 'sprint_qualifying';
  // 2) 스프린트 레이스 — name 기준 (session_type 은 'Race')
  if (name === 'sprint') return 'sprint';
  // 3) 프랙티스 — 'Practice 1/2/3' 포함
  if (type === 'practice' || name.startsWith('practice')) return 'practice';
  // 4) 퀄리파잉 (스프린트 계열은 위에서 이미 분기됨)
  if (type === 'qualifying' || name === 'qualifying') return 'qualifying';
  // 5) 레이스
  if (type === 'race' || name === 'race') return 'race';
  return null;
}

/** 퀄리파잉 계열(Q1/Q2/Q3 분절을 갖는 세션)인지. */
export function isQualifyingFamily(kind: SessionKind | null): boolean {
  return kind === 'qualifying' || kind === 'sprint_qualifying';
}

/** 세그먼트 라벨 접두사 — Sprint Qualifying 은 'SQ', 그 외 'Q'. (예: Q1/Q2/Q3, SQ1/SQ2/SQ3) */
export function segmentPrefix(kind: SessionKind | null): 'SQ' | 'Q' {
  return kind === 'sprint_qualifying' ? 'SQ' : 'Q';
}

/**
 * 퀄리파잉 세그먼트 제한시간 SSOT (분). Qualifying 과 Sprint Qualifying 은 시간이 **다르다**.
 * 인덱스 0/1/2 = Q1/Q2/Q3 (또는 SQ1/SQ2/SQ3). Sprint Shootout 2023 도 12/10/8 동일.
 * 카운트다운·세그먼트 길이 계산은 본 테이블만 참조 — 분(分) 리터럴 산재 금지(CLAUDE.md §2 SSOT).
 */
export const SEGMENT_DURATIONS_MIN: Readonly<
  Record<'qualifying' | 'sprint_qualifying', readonly [number, number, number]>
> = {
  qualifying: [18, 15, 12],
  sprint_qualifying: [12, 10, 8],
};
