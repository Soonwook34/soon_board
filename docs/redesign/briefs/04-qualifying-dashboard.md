# 디자인 브리프 — 퀄리파잉 대시보드(Q1/Q2/Q3)

> 한 줄 요약: Qualifying / Sprint Qualifying 세션에서만 활성화되는 세그먼트 분절형 예선 타워 — 세그먼트별 탈락(drop zone), 카운트다운, 각 세그먼트 베스트 랩을 한 화면에 통합.
> 라우트: `/live/:sessionKey` · `/replay/:sessionKey` (세션이 qualifying 계열일 때)
> 데이터: DataSource

---

## 1. 목적 / 컨텍스트

이 화면은 `isQualifyingFamily(kind) === true`, 즉 `resolveSessionKind`가 `'qualifying'` 또는 `'sprint_qualifying'`을 반환하는 세션에서만 나타난다. 레이스 대시보드와의 핵심 차이는 다음 세 가지다.

| 항목 | 레이스 대시보드 | 퀄리파잉 대시보드 |
|---|---|---|
| 순위 기준 | `position` (인터벌 기반 갭) | 현재 세그먼트 베스트 랩 타임 |
| 시간 구조 | 단일 연속 세션 | Q1 → Q2 → Q3 (또는 SQ1 → SQ2 → SQ3) 세 구간으로 분절 |
| 탈락 개념 | 없음 | 각 세그먼트 종료 시 하위 드라이버 탈락(drop zone) |
| 타이어 전략 패널 | 주요 패널 | 강등/대체 (예선에선 정보 가치 낮음) |
| 세션 진행 표시 | 전체 랩 카운트 / 세션 시계 | 세그먼트(Q1/Q2/Q3) 진행 바 + 세그먼트별 카운트다운 |

Sprint Qualifying(`session_name = 'Sprint Qualifying'` 또는 2023 `'Sprint Shootout'`)은 동일한 세그먼트 구조를 공유하되 라벨은 SQ1/SQ2/SQ3(`segmentPrefix(kind) === 'SQ'`)이고 제한시간이 더 짧다(`SEGMENT_DURATIONS_MIN.sprint_qualifying = [12, 10, 8]`분).

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

### 2.1 레이아웃 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: 세션명 · 서킷 · 날씨 · 스트림 상태 배지                         │
├───────────────────────────┬────────────────────┬────────────────────┤
│                           │  SEGMENT PROGRESS  │                    │
│                           │  [Q1●]  [Q2 ]  [Q3]│  SEGMENT BEST     │
│   QUALIFYING TOWER        │  ▓▓▓▓▓▓▓░░░░ 07:42 │  BOARD            │
│   (메인 리더보드 변형)         ├────────────────────┤                    │
│                           │                    │  Q1   Q2   Q3     │
│   P  DRV  SEG BEST  GAP   │   FLAG / MESSAGE   │  ─────────────    │
│   ─────────────────────   │   BANNER           │  VER  –    –      │
│   1  VER  1:27.341  –     │                    │  NOR  –    –      │
│   2  NOR  1:27.502 +0.161 ├────────────────────┤  LEC  –    –      │
│   3  LEC  1:27.689 +0.348 │                    │  HAM  –    –      │
│   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │   LIVE MAP         │  ...              │
│   (컷라인 구분선 + 드롭존 음영)│   (미니섹터 색칠)    │                    │
│   16 RUS  1:28.991  DROP  │                    │                    │
│   17 SAI  1:29.102  DROP  │                    │                    │
│   ...                     │                    │                    │
└───────────────────────────┴────────────────────┴────────────────────┘
```

### 2.2 패널 인벤토리

| 슬롯 | 패널 이름 | 역할 | 레이스 대시보드 대응 |
|---|---|---|---|
| 좌측 메인 | **QualifyingTower** | 세그먼트 베스트 기준 순위 타워 + drop zone | Leaderboard |
| 우상단 | **SegmentProgress** | Q1/Q2/Q3 3-pill + 세그먼트 카운트다운 | SessionProgress |
| 우중단 | **SegmentBestBoard** | 세그먼트별(Q1/Q2/Q3) 전 드라이버 베스트 모아보기 | — (신규) |
| 하단 우 | **LiveMap** | 플라잉/out 랩 구분 + 미니섹터 색칠 변형 | LiveMap |
| 우 플로팅 | **Flag/Message Banner** | RED FLAG · YELLOW · 세그먼트 종료 메시지 | 동일 |

### 2.3 QualifyingTower 상세 와이어프레임

```
┌──────────────────────────────────────────────────────────┐
│ QUALIFYING — Q1   (20 / 20 active)                       │
├─────┬──────┬───────────┬──────────┬────────────┬─────────┤
│  P  │ DRV  │  SEG BEST │   GAP    │    LAST    │   TYR   │
├─────┼──────┼───────────┼──────────┼────────────┼─────────┤
│  1  │ VER  │ 1:27.341  │    –     │ ●●●●●●●●●  │   S     │
│  2  │ NOR  │ 1:27.502  │ +0.161   │ ●●●●◐○○○○  │   S     │
│  3  │ LEC  │ 1:27.689  │ +0.348   │ ─ (flying) │   S     │
│  4  │ HAM  │ 1:27.801  │ +0.460   │ ●●●●●●●●◐  │   M     │
│     │      │           │          │   OUT →    │         │
│ ...                                                      │
├─────────── CUT LINE ─── (+0.823 gap band) ───────────────┤  ← 컷라인 구분선
│ 16  │ RUS  │ 1:28.164  │ +0.823   │ ●●●◑○○○○○  │   S     │
│ 17  │ SAI  │ 1:28.991  │ +1.650   │ ─ (in lap) │   M     │  ← drop zone 행 배경 빨강 계열
│ 18  │ ALO  │ 1:29.102  │ +1.761   │ ○○○○○○○○○  │   S     │
│ 19  │ STR  │ 1:29.440  │ +2.099   │ ─ (no time)│   M     │
│ 20  │ BOT  │    –      │    –     │ ─ (out lap)│   S     │
└──────────────────────────────────────────────────────────┘
```

- SEG BEST: 현재 세그먼트(`qualifying_phase`)의 `flying` 랩만으로 산출한 드라이버 베스트
- GAP: 컷라인까지 갭(컷라인 위) 또는 현재 탈락 갭(drop zone). 리더 기준도 선택 가능
- LAST: 최근 완료 랩의 미니섹터 바(2048=노랑/2049=초록/2052=보라/2064=핏)
- OUT / IN / flying 마커: 현재 랩 분류 표기
- 컷라인 구분선: 다음 세그먼트 진출 인원 경계(데이터 파생, 하드코딩 금지)

### 2.4 SegmentProgress 상세 와이어프레임

```
┌─────────────────────────────────────────────────────────┐
│                  SEGMENT PROGRESS                        │
│                                                          │
│    [  Q1 ●ACTIVE  ]    [   Q2   ]    [   Q3   ]         │
│    ▓▓▓▓▓▓▓▓▓▓░░░░░░░░                                   │
│              07:42                                       │
│          (18:00 기준 SSOT)                                │
│                                                          │
│    ▲ RED FLAG 시: "~approx" 표기로 불확실성 표시             │
└─────────────────────────────────────────────────────────┘
```

- 활성 pill 강조, 완료 pill 체크 표시, 미진행 pill 흐림
- 카운트다운 원천: `SEGMENT_DURATIONS_MIN[kind][segIndex]` — qualifying `[18,15,12]`분, sprint_qualifying `[12,10,8]`분
- Red flag로 연장/단축 시 best-effort + "~approx" 표기

### 2.5 SegmentBestBoard 상세 와이어프레임

```
┌─────────────────────────────────────────────────────────┐
│  SEGMENT BEST BOARD                                      │
├──────────────┬──────────────┬──────────────┬────────────┤
│     Q1       │     Q2       │     Q3       │            │
│  ──────────  │  ──────────  │  ──────────  │            │
│  VER 1:27.3  │  ─           │  ─           │            │
│  NOR 1:27.5  │  ─           │  ─           │  세션 베스트  │
│  LEC 1:27.7  │  ─           │  ─           │  보라 강조   │
│  ...         │  ...         │  ...         │            │
└──────────────┴──────────────┴──────────────┴────────────┘
```

- Sprint Qualifying일 때 컬럼 헤더는 SQ1 / SQ2 / SQ3
- 세션 전체 베스트 랩은 보라(purple) 강조
- 미도달 세그먼트 셀은 `–` (null 패딩 표시)

---

## 3. 데이터 계약 (mock = 실제 타입)

### 3.1 세션 종류 판정 (`src/shared/sessionKind.ts`)

```ts
// 세션 종류 판정 — 두 필드 모두 필요 (session_type 단독은 Sprint/SQ 오판)
resolveSessionKind(sessionType: string, sessionName: string): SessionKind | null
// → 'qualifying' | 'sprint_qualifying' | 'sprint' | 'race' | 'practice' | null

isQualifyingFamily(kind: SessionKind | null): boolean
// → kind === 'qualifying' || kind === 'sprint_qualifying'

segmentPrefix(kind: SessionKind | null): 'SQ' | 'Q'
// → sprint_qualifying → 'SQ', 그 외 → 'Q'
// 라벨 예: Q1/Q2/Q3 vs SQ1/SQ2/SQ3

SEGMENT_DURATIONS_MIN: Readonly<Record<'qualifying' | 'sprint_qualifying', readonly [number, number, number]>>
// qualifying:        [18, 15, 12]  (Q1=18분, Q2=15분, Q3=12분)
// sprint_qualifying: [12, 10,  8]  (SQ1=12분, SQ2=10분, SQ3=8분)
// ※ 카운트다운·세그먼트 길이 계산은 이 테이블만 참조. 분 리터럴 산재 금지(SSOT).
```

### 3.2 세그먼트 경계 신호 (`RaceControlRecord.qualifying_phase`)

```ts
// src/shared/openf1Types.ts
interface RaceControlRecord {
  date: Date;
  session_key: number;
  qualifying_phase: number | null;
  // 1 = Q1/SQ1, 2 = Q2/SQ2, 3 = Q3/SQ3. 비예선 세션은 null.
  flag: string | null;   // 'RED', 'GREEN', 'CHEQUERED' 등
  message: string;
  // ...
}
```

- `qualifying_phase` 변화 + flag 조합이 세그먼트 `[startMs, endMs]` 경계의 PRIMARY 신호
- race_control 공백 시: 랩 `date_start` 활동 클러스터링(SECONDARY, `confidence: 'clustered'` 표기)

### 3.3 세그먼트 멤버십 + 세그먼트별 베스트 (`SessionResultRecord.duration`)

```ts
// src/shared/openf1Types.ts
interface SessionResultRecord {
  driver_number: number;
  position: number | null;
  /** 예선: [Q1_best, Q2_best, Q3_best] 배열. 비도달 세그먼트는 null 패딩.
   *  예) Q1 탈락 드라이버: [1:28.1, null, null]
   *      Q3 진출 드라이버: [1:27.3, 1:26.9, 1:25.8]
   *  비예선 세션: number | null */
  duration: number | Array<number | null> | null;
  gap_to_leader: number | string | Array<number | null> | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
}
```

- `duration` 배열 길이 = 드라이버가 도달한 최종 세그먼트 인덱스+1 (멤버십 확정 뷰)
- 다음 세그먼트 멤버십 크기(진출 인원)를 데이터에서 파생 → 컷라인 상수 하드코딩 금지
- **미래 누설 규율**: 진행 중 뷰는 `date_start ≤ t` 완료 랩(`getCompletedLapsBefore`)만 사용; `session_result.duration[]`는 확정 뷰 · 경계 교차검증에만 사용

### 3.4 랩 분류 (`LapRecord`)

```ts
// src/shared/openf1Types.ts
interface LapRecord {
  date_start: Date | null;
  driver_number: number;
  lap_number: number;
  lap_duration: number | null;       // 미완료 랩: null
  is_pit_out_lap: boolean;           // OUT 랩 직접 표시
  segments_sector_1: number[];       // 미니섹터 색 코드 배열
  segments_sector_2: number[];       // 2048=노랑/2049=초록/2052=보라/2064=핏
  segments_sector_3: number[];
}
// IN 랩 판정: 해당 랩 번호에 PitRecord가 존재하는지 확인
// flying 랩: is_pit_out_lap === false && PitRecord 없음 && lap_duration != null
// 세그먼트 베스트 산정은 flying 랩만 포함
```

### 3.5 사용 DataSource 메서드 (정확한 시그니처)

```ts
// src/shared/DataSource.ts

// 1) 세그먼트 경계 신호 수집 — race_control 전체
getAllBefore<'race_control'>(
  endpoint: 'race_control',
  t: Date,
  filters?: Partial<RaceControlRecord>,
  limit?: number,
): RaceControlRecord[]

// 2) 드라이버 완료 랩 (flying 베스트 산정용, 미래 누설 zero)
getCompletedLapsBefore(driverNum: number, t: Date, limit?: number): LapRecord[]

// 3) pit 레코드 (IN 랩 판정용)
getAllBefore<'pit'>(endpoint: 'pit', t: Date, filters?: Partial<PitRecord>): PitRecord[]

// 4) 세션 결과 (확정 뷰 / 세그먼트 멤버십 확정)
getSessionResult(driverNum: number): SessionResultRecord | null
// ※ undated endpoint — 표시 게이트(display_time ≥ session.date_end)는 호출처가 판정

// 5) 드라이버 메타(팀 컬러, 약칭)
getAllBefore<'drivers'>(endpoint: 'drivers', t: Date): DriverRecord[]

// 6) 현재 표시 시각
getDisplayTime(): Date

// 7) 집계(세션 베스트 랩, personal best)
getAggregateBefore<'fastest_lap'>(aggregate: 'fastest_lap', t: Date): FastestLapAggregate | null
getAggregateBefore<'personal_bests'>(aggregate: 'personal_bests', t: Date): Map<number, PersonalBestRow>

// 8) 스트림 상태 (라이브 vs 리플레이 UI 배지)
getStreamState(): StreamState

// 9) 표시 시각 변경 구독
onDisplayTimeChange(handler: (t: Date) => void): () => void
```

---

## 4. 상태 / 엣지케이스

### 4.1 세그먼트 진행 중 (active)

- `qualifying_phase === 1|2|3`인 가장 최근 `RaceControlRecord`를 기준으로 활성 세그먼트 판단
- 활성 세그먼트 종료 전: `session_result.duration[]` 미사용; `getCompletedLapsBefore(t)` + flying 필터로 실시간 베스트 산출
- 카운트다운: 세그먼트 시작 시각 + `SEGMENT_DURATIONS_MIN[kind][segIndex]`분 — `getDisplayTime()`

### 4.2 세그먼트 종료 / 탈락 확정

- 세그먼트 종료(CHEQUERED 또는 다음 `qualifying_phase` 시작): 탈락 드라이버 고정
- `session_result.duration[]` 배열 길이로 각 드라이버의 진출/탈락 세그먼트 확정
- 컷라인 위치 = 다음 세그먼트 멤버십 크기(데이터 파생) — `15`, `10`, `5` 등 상수 분기 금지

### 4.3 drop zone 경계

- 현재 세그먼트 진행 중: 임시(provisional) 컷라인. 라이브 순위 변동에 따라 drop zone 드라이버 갱신
- 리플레이: 항상 데이터 파생 컷라인 (라이브 프로비저널 `KNOCKOUT_CONFIG`는 Phase 4 연기)
- 2026 그리드 22대(11팀) 대응: 하드코딩 없이 자동 반영됨

### 4.4 카운트다운 (남은 시간)

- 원천: `SEGMENT_DURATIONS_MIN[kind][segIndex]` SSOT — 분 리터럴 코드 내 산재 금지
- Red flag로 세그먼트 연장/단축 시: `race_control` CHEQUERED로 실제 종료 시각 보정 가능; 보정 불가 시 "~approx" 표기
- 남은 시간 ≤ 60초: 긴박감 강조 시각(색·애니메이션)

### 4.5 미도달 세그먼트 (null 패딩)

- `session_result.duration[i] === null`: 해당 드라이버가 i번째 세그먼트에 미진출 → 셀 `–` 표시
- `duration` 자체가 `number | null` (비배열): 비예선 세션이거나 undated 데이터 → guard 필수

### 4.6 미래 누설 zero

- `t` 시점 진행 중 순위/세그먼트 베스트: `date_start ≤ t` 완료 랩만 반영
- `session_result.duration[]` 최종값은 `display_time ≥ session.date_end` 이후에만 노출
- Q1 진행 중 시각 `t`에서 Q2/Q3 데이터 및 `session_result` 최종값 미노출 (스냅샷 테스트 대상)

### 4.7 라이브 vs 리플레이

- 라이브: `getStreamState()` → 'stalled' 시 "데이터 끊김" 오버레이; 카운트다운은 실시간 진행
- 리플레이: `getDisplayTime()`이 playback_clock; 시크 시 세그먼트 베스트/카운트다운 즉시 재계산

### 4.8 Sprint Qualifying (SQ 라벨)

- `segmentPrefix(kind) === 'SQ'` → 모든 라벨 SQ1/SQ2/SQ3으로 치환
- `SEGMENT_DURATIONS_MIN.sprint_qualifying = [12, 10, 8]`분 — qualifying의 [18, 15, 12]와 다름
- 2023 Sprint Shootout: `session_name === 'Sprint Shootout'` → `resolveSessionKind` → `'sprint_qualifying'` 동일 흐름

---

## 5. 비주얼 방향

### 5.1 세그먼트 구분 색

| 상태 | 색 계열 | 용도 |
|---|---|---|
| 활성 세그먼트 pill | 흰색/밝은 강조 | Q1●/Q2●/Q3● 현재 진행 중 |
| 완료 세그먼트 pill | 어두운 중간 톤 + 체크 | Q1✓ 완료 |
| 미진행 세그먼트 pill | 흐린 회색 | Q3 (미도달) |
| 세그먼트 진행 바 | team_colour 계열 또는 흰색 | SegmentProgress 바 채움 |

### 5.2 drop zone 강조 (탈락권)

- 컷라인 구분선: 밝은 흰색 점선 또는 실선, 양쪽에 "CUT LINE" 텍스트
- drop zone 행: 배경 빨강 계열(어두운 red tint, 예: `rgba(220, 38, 38, 0.15)`) — 지나치게 강렬하지 않게
- drop zone 드라이버 GAP 칸: 빨간색 텍스트 + "DROP" 레이블

### 5.3 베스트 랩 강조

- 세션 전체 베스트 랩: 보라(purple, `#a855f7` 계열) — SegmentBestBoard 및 QualifyingTower SEG BEST 칸
- Personal best 갱신 시: 초록(`#22c55e` 계열) 순간 플래시
- 세그먼트 베스트가 이전 세그먼트 베스트보다 빠른 경우: 노란 밑줄 또는 플래시

### 5.4 team_colour 활용

- `DriverRecord.team_colour` (hex): QualifyingTower 드라이버 번호 좌측 세로 바 또는 배경 tint
- SegmentBestBoard: 드라이버 행 좌측 2px team_colour 바

### 5.5 카운트다운 긴박감

- 남은 시간 > 60s: 일반 흰색 텍스트
- 남은 시간 30–60s: 노란색 텍스트 (`#eab308`)
- 남은 시간 < 30s: 빨간색 텍스트 + pulse 애니메이션
- 세그먼트 종료(0:00): 플래시 후 다음 세그먼트로 전환 또는 "SEGMENT END" 표시

### 5.6 미니섹터 색 (LiveMap 변형)

- 코드 `2048` → 노랑(personal best 기준 느린 구간)
- 코드 `2049` → 초록(personal best)
- 코드 `2052` → 보라(overall best)
- 코드 `2064` → 흰색/회색(pit lane)
- flying 랩 드라이버: 마커 풀 밝기, out/in 랩 드라이버: 마커 dimming

---

## 6. Claude design 프롬프트 스니펫

아래 블록을 복사해 Claude에게 붙여넣으면 이 화면의 디자인(화면 구성, 컴포넌트 트리, prop 인터페이스)을 요청할 수 있다. **화면만 설계하고 구현 코드는 작성하지 않는다**는 전제가 포함되어 있다.

```
당신은 F1 타이밍 대시보드 UI 디자이너입니다. 지금은 **화면 설계만** 합니다 — 구현 코드(로직, 상태관리, API 호출) 작성은 이 단계에서 금지합니다.

## 화면: 퀄리파잉 대시보드 (QualifyingDashboard)

### 맥락
- 프레임워크: React 18 + TypeScript + Vite + wouter
- 라우트: `/live/:sessionKey` · `/replay/:sessionKey`
- 활성 조건: `isQualifyingFamily(resolveSessionKind(session_type, session_name)) === true`
- 데이터 접근: `DataSource` 인터페이스에만 의존 (구현 세부사항 노출 금지)

### 데이터 계약 핵심 (§3 발췌)

1. **세션 종류 판정** (`src/shared/sessionKind.ts`)
   - `resolveSessionKind(sessionType, sessionName)` → 'qualifying' | 'sprint_qualifying' | ...
   - `segmentPrefix(kind)` → 'Q' | 'SQ' (라벨: Q1/Q2/Q3 vs SQ1/SQ2/SQ3)
   - `SEGMENT_DURATIONS_MIN.qualifying = [18, 15, 12]` 분 (Q1/Q2/Q3)
   - `SEGMENT_DURATIONS_MIN.sprint_qualifying = [12, 10, 8]` 분 (SQ1/SQ2/SQ3)
   - 분(分) 리터럴을 코드에 산재하지 말고 이 SSOT만 참조할 것

2. **세그먼트 경계** (`RaceControlRecord.qualifying_phase: number | null`)
   - 1/2/3 = Q1/Q2/Q3. PRIMARY 신호.

3. **세그먼트별 베스트 + 멤버십** (`SessionResultRecord.duration`)
   - 예선: `Array<number | null>` — 인덱스 0/1/2가 Q1/Q2/Q3 베스트, 미도달은 null 패딩
   - **확정 뷰 전용** — 진행 중 순위는 `getCompletedLapsBefore(driverNum, t)` flying 랩만

4. **DataSource 메서드**
   - `getAllBefore('race_control', t)` — 세그먼트 경계
   - `getCompletedLapsBefore(driverNum, t)` — 시간 컷 완료 랩 (미래 누설 zero)
   - `getAllBefore('pit', t)` — IN 랩 판정
   - `getSessionResult(driverNum)` — 확정 뷰 (표시 게이트: display_time ≥ session.date_end)
   - `getAggregateBefore('fastest_lap' | 'personal_bests', t)` — 베스트 집계
   - `getDisplayTime()` — 현재 표시 시각

### 설계 요청
다음을 설계해 주세요 (구현 코드 없이, 인터페이스·prop 타입·컴포넌트 트리·데이터 흐름 다이어그램 형태로):

1. **QualifyingTower**: 세그먼트 베스트 순위 타워. 컬럼: P · DRV · SEG BEST · GAP(컷라인까지) · LAST(미니섹터 바) · TYR. 드롭존 행 음영 + 컷라인 구분선. 컷라인 위치는 상수 금지, 데이터 파생.
2. **SegmentProgress**: Q1/Q2/Q3(또는 SQ1/SQ2/SQ3) 3-pill + 세그먼트 카운트다운. 제한시간은 `SEGMENT_DURATIONS_MIN[kind][i]` 참조. 카운트다운 30s 이하 긴박감 시각.
3. **SegmentBestBoard**: 세그먼트별(Q1/Q2/Q3) 전 드라이버 베스트 모아보기. 세션 베스트=보라.
4. **컴포넌트 트리 + prop 인터페이스**: 위 세 컴포넌트와 QualifyingDashboard 루트의 관계, 각 컴포넌트 prop 타입.

### 제약
- 미래 누설 zero: 진행 중 뷰는 `date_start ≤ t` 완료 랩만. `session_result` 최종값은 세션 종료 후만.
- Sprint Qualifying(`kind === 'sprint_qualifying'`)일 때 모든 라벨을 SQ1/SQ2/SQ3으로 치환.
- 분 리터럴(18, 15, 12, 12, 10, 8) 코드 산재 금지 — `SEGMENT_DURATIONS_MIN` SSOT 참조.
- drop zone 컷라인 위치 상수(15/10/5) 하드코딩 금지 — 데이터 파생.
```
