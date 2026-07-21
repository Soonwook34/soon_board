# 디자인 브리프 — 드라이버 디테일 패널

> 드라이버 한 명의 세션 내 전체 타이밍 정보를 세로 스택으로 보여주는 우측 sticky 사이드 패널 · 라우트: `/live/:sessionKey` 및 `/replay/:sessionKey` (공통) · 데이터: DataSource

## 1. 목적 / 컨텍스트

레이스 대시보드(브리프 02)에서 리더보드 행 또는 맵 마커를 클릭할 때 우측에 push 방식으로 열리는 사이드 패널이다. 한 번에 한 명만 표시하며, 다른 드라이버를 클릭하면 같은 패널이 슬라이드 트랜지션으로 새 내용으로 갱신된다. 패널 내 모든 정보 역시 DataSource의 `display_time`에 반응하며, 라이브/리플레이 모드를 직접 알지 못한다. 세션 종료 후에는 하단에 세션 결과 섹션이 추가로 나타난다.

**위치/크기:** 우측 고정(sticky), 약 360px 폭. 내부는 세로 스크롤 가능. 상위 화면은 Push 모드로 좌측 영역이 좁아짐.

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

### 2.1 전체 구조

```
┌──────────────────────────────────────────┐
│ DriverHeader                             │
│ ┌────────────────────────────────────┐   │
│ │ [헤드샷]  LANDO NORRIS             │   │
│ │           MCLAREN   ●              │   │
│ │  4        🇬🇧 GBR                  │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ CurrentState                             │
│ ┌────────────────────────────────────┐   │
│ │ P2  ·  LAP 35  ·  +1.2s  ·  M 5L  │   │
│ │                                    │   │
│ │ LAST LAP         1:31.456          │   │
│ │  S1 ▓   S2 ▓   S3 ░               │   │
│ │  27.1   32.4   —                   │   │
│ │                                    │   │
│ │ IN PROGRESS  ⏱ 27.1 ...            │   │
│ │  ▓▓░                               │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ RecentLapsTable                          │
│ ┌────────────────────────────────────┐   │
│ │ LAP  TIME    S1     S2     S3   SPD│   │
│ │  35  1:31.4  27.1   32.4  31.9 312│   │
│ │  34  1:31.7  27.3   32.1  32.3 308│   │
│ │  33  1:32.0  27.5   32.6  31.9 310│   │
│ │  32  1:31.9  27.2   32.3  32.4 305│   │
│ │  31  1:32.3  27.6   32.8  31.9 309│   │
│ │         더 보기 (+28) ▾             │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ StintHistory                             │
│ ┌────────────────────────────────────┐   │
│ │ #1  MEDIUM   L1–L18  (new)         │   │
│ │     ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰            │   │
│ │ #2  HARD     L19–L35  (진행 중)    │   │
│ │     ▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰  →          │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ PitHistory                               │
│ ┌────────────────────────────────────┐   │
│ │ Lap 18 · 24.6s lane (2.3s box)     │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│ SessionResult  (세션 종료 후만 표시)      │
│ ┌────────────────────────────────────┐   │
│ │  P2  · 56 laps · +12.4s            │   │
│ │  DNF / DNS / DSQ 배지              │   │
│ └────────────────────────────────────┘   │
├──────────────────────────────────────────┤
│                              [✕ 닫기]    │
└──────────────────────────────────────────┘
```

### 2.2 섹션별 표시 항목

#### DriverHeader (정적, 드라이버 선택 시 1회 로드)
- **헤드샷 이미지** — `DriverRecord.headshot_url` (F1 CDN. null이면 번호 대형 텍스트로 대체)
- **이름** — `DriverRecord.broadcast_name` (fallback: `full_name`)
- **드라이버 번호** — `DriverRecord.driver_number` 큰 숫자
- **팀 컬러 칩** — `DriverRecord.team_colour` hex로 색상 띠 또는 점
- **팀 이름** — `DriverRecord.team_name`
- **국가 플래그 + 코드** — `DriverRecord.country_code` (null이면 미표시)

#### CurrentState (display_time 갱신 반응)
한 눈에 보이는 요약 행:
- **현재 순위** — `P2` 형태, `PositionRecord.position`
- **현재 lap** — `LAP 35`, 본인의 진행 중 또는 가장 최근 완료 lap의 `LapRecord.lap_number`
- **앞차 간격 / 리더 갭** — `IntervalRecord.interval` / `IntervalRecord.gap_to_leader` (number | string | null)
- **현재 타이어** — compound 1글자 + tyre age. 예: `M 5L` → `StintRecord.compound`, 현재 lap - `StintRecord.tyre_age_at_start` 기반

---

**Last Lap 서브섹션:**
- **타이틀 + 시간** — `LAST LAP` + `LapRecord.lap_duration` (초 → `m:ss.sss` 포맷, null이면 `—`)
- **섹터 바** — 2px 높이, S1|S2|S3 각 1/3 폭
  - 색: overall best(보라) / personal best(초록) / 그 외(노랑) / null(회색)
- **섹터 시간 텍스트** — `LapRecord.duration_sector_1/2/3` 각각 바 아래 또는 우측 (null이면 `—`)

---

**In Progress 서브섹션** (본인이 현재 lap 주행 중일 때만):
- `LapRecord` 에서 `date_start ≤ t` AND (`lap_duration == null` OR `date_start + lap_duration > t`) 인 record
- 통과한 섹터의 시간 텍스트 + 색상 바 (미통과 섹터는 회색 `#374151`)
- 타이틀: `IN PROGRESS` + 경과 타이머(초) 또는 통과 섹터 시간

#### RecentLapsTable (완료 lap만, 기본 5행 + 더 보기)
테이블 헤더: `LAP` · `TIME` · `S1` · `S2` · `S3` · `SPD`

각 행:
- **LAP** — `LapRecord.lap_number`
- **TIME** — `LapRecord.lap_duration` (`m:ss.sss`, null → `—`)
- **S1/S2/S3** — `LapRecord.duration_sector_1/2/3` (초 포맷, null → `—`)
  - 각 셀에 섹터 색상(보라/초록/노랑/회색) 적용
- **SPD** — `LapRecord.st_speed` (km/h 정수, null → `—`)

하단 토글:
- 5개 초과 시 `더 보기 (+N) ▾` / `접기 ▴` 버튼 표시
- 펼침 시 전체 완료 lap 표시
- 5개 이하이면 토글 미표시

#### StintHistory
각 stint 한 행:
- **stint 번호** `#1`
- **compound** + compound 색 chip (SOFT/MEDIUM/HARD/INT/WET)
- **랩 범위** `L1–L18`
- **시작 tyre age** — `StintRecord.tyre_age_at_start == 0` → `(new)`, 그 외 → `(used Nlap)`
- **가로 stint 막대** — `lap_start ~ lap_end` 비례 막대, compound 색 fill
- 현재 진행 중 stint: `lap_end` 표시 없이 `→` 화살표 또는 `진행 중` 라벨

#### PitHistory
각 pit stop 한 줄:
- `Lap N · XX.Xs lane (YY.Ys box)` 형식
- `PitRecord.lap_number`, `PitRecord.pit_duration` (lane 시간)
- `stop_duration` — null이면 `box: —` 표시 (2024 US GP 이전 데이터 등)
- 최신 순 정렬 (위가 최신)

#### SessionResult (세션 종료 후만, `display_time ≥ session.date_end`)
- **최종 순위** — `SessionResultRecord.position` (null이면 `—`)
- **총 lap 수** — `SessionResultRecord.number_of_laps`
- **총 시간 또는 리더 갭** — `SessionResultRecord.duration` (Race: 초, Qualifying: 배열) / `SessionResultRecord.gap_to_leader`
- **상태 배지** — `dnf` / `dns` / `dsq` boolean → 각각 `DNF` / `DNS` / `DSQ` 강조 배지
- **Qualifying 처리**: `duration` 배열 `[Q1, Q2, Q3]`로 Q1/Q2/Q3 시간 각각 표시. 도달 못 한 세그먼트는 `null` → `—`.

---

## 3. 데이터 계약 (mock = 실제 타입)

### 3.1 섹션별 record 타입 + DataSource 메서드

#### DriverHeader
- `DriverRecord`: `driver_number`, `broadcast_name`, `full_name`, `name_acronym`, `team_name`, `team_colour`, `headshot_url`, `country_code`
- 정적(드라이버 선택 시 1회). DataSource 메서드 불필요 (drivers 맵에서 직접 룩업).

#### CurrentState
| 항목 | record 타입 + 필드 | DataSource 메서드 |
|---|---|---|
| 현재 순위 | `PositionRecord.position` | `getLatestBefore('position', t, { driver_number })` |
| 현재 lap | `LapRecord.lap_number` | `getLapAt(driverNum, t)` |
| interval / gap | `IntervalRecord.interval`, `gap_to_leader` | `getLatestBefore('intervals', t, { driver_number })` |
| 현재 타이어 | `StintRecord.compound`, `tyre_age_at_start`, `lap_start` | `getStintForLap(driverNum, currentLap)` |
| Last Lap 시간 + 섹터 | `LapRecord.lap_duration`, `duration_sector_1/2/3` | `getCompletedLapsBefore(driverNum, t, 1)` |
| 섹터 색 판정 | `AggregateResults.purple_sectors`, `personal_bests` | `getAggregateBefore('purple_sectors', t)`, `getAggregateBefore('personal_bests', t)` |
| In Progress lap | `LapRecord.date_start`, `lap_duration`, `duration_sector_1/2/3` | `getLapAt(driverNum, t)` |

**In Progress 판정:**
`getLapAt(driverNum, t)` 결과에서 `lap_duration == null` 이거나 `date_start + lap_duration > t` → In Progress 서브섹션 표시.

#### RecentLapsTable
- `LapRecord`: `lap_number`, `lap_duration`, `duration_sector_1/2/3`, `st_speed`, `date_start`, `is_pit_out_lap`
- `DataSource.getCompletedLapsBefore(driverNum, t): LapRecord[]` (limit 없음 — 전체 완료 lap)
- 섹터 색: `getAggregateBefore('purple_sectors', t)`, `getAggregateBefore('personal_bests', t)`

**미래 누설 방지:** `getCompletedLapsBefore`가 `date_start + lap_duration ≤ t` 를 보장. 컴포넌트 단 raw `Date` 비교 금지.

#### StintHistory
- `StintRecord`: `stint_number`, `compound`, `lap_start`, `lap_end`, `tyre_age_at_start`
- `DataSource.getAllBefore('stints', t, { driver_number }): StintRecord[]`
- 완료 stint: `lap_end ≤ current_leader_lap`
- 진행 중 stint: `lap_end > current_leader_lap` 또는 가장 최근 stint
- current_leader_lap: `getLapAt(leaderDriverNum, t)?.lap_number`

#### PitHistory
- `PitRecord`: `date`, `lap_number`, `pit_duration`
- `DataSource.getAllBefore('pit', t, { driver_number }): PitRecord[]`
- **미래 누설 방지:** `getAllBefore` 의 `date ≤ t` 컷 보장. 표시 단 재확인 불필요 (DataSource 책임).

#### SessionResult
- `SessionResultRecord`: `position`, `number_of_laps`, `duration`, `gap_to_leader`, `dnf`, `dns`, `dsq`
- `DataSource.getSessionResult(driverNum): SessionResultRecord | null`
- **표시 게이트:** 호출처에서 `display_time ≥ SessionRecord.date_end` 조건 판정 후 렌더.

### 3.2 aggregate 사용 요약
| aggregate | 사용 섹션 | 메서드 |
|---|---|---|
| `purple_sectors` | CurrentState 섹터 바, RecentLapsTable 섹터 셀 색 | `getAggregateBefore('purple_sectors', t)` |
| `personal_bests` | CurrentState 섹터 바, RecentLapsTable 섹터 셀 색 | `getAggregateBefore('personal_bests', t)` |

`PurpleSectorsAggregate`: `s1 / s2 / s3: { driver_number, sector_duration } | null`
`PersonalBestRow`: `{ driver_number, best_lap_duration, best_sector_1, best_sector_2, best_sector_3: number | null }`

---

## 4. 상태 / 엣지케이스

### 4.1 Loading / Buffering
- 패널 열림 시 데이터 아직 없음 → 각 섹션 skeleton 표시. DriverHeader 헤드샷은 이미지 로드 실패 대비 번호 fallback.
- `headshot_url == null` → 드라이버 번호 대형 텍스트로 대체.

### 4.2 라이브 vs 리플레이 차이
- **공통:** 모든 섹션은 `display_time t` 하나에만 반응.
- **interval / gap:** 라이브는 ~4s cadence 갱신. 리플레이에서 historical `intervals` 비신뢰 가능 → null / stale 값 대비 (`—` 표시).
- **모드 전환:** 라이브↔리플레이 전환 시 패널 자동 닫힘.

### 4.3 미래 누설 zero
| 섹션 | 방어 |
|---|---|
| RecentLapsTable | `getCompletedLapsBefore` — `date_start + lap_duration ≤ t` 보장. 진행 중 lap은 In Progress로만 표시 |
| StintHistory | `getAllBefore('stints', t)` + `lap_end ≤ current_leader_lap` 완료 판정. 미래 스틴트 미표시 |
| PitHistory | `getAllBefore('pit', t)` — `date ≤ t` 컷 보장 |
| SessionResult | `display_time ≥ session.date_end` 게이트 — 라이브 중 숨김 |
| CurrentState In Progress | `getLapAt` 의 `date_start ≤ t` 보장. 미래 lap은 반환되지 않음 |

### 4.4 In-progress lap 처리
- `getLapAt(driverNum, t)` 로 현재 lap record 취득.
- `lap_duration == null` 또는 `date_start + lap_duration > t` → In Progress 서브섹션 표시.
- 통과한 섹터(`duration_sector_N != null`)만 시간+색상 표시. 아직 통과 안 한 섹터 → 회색 `#374151`.

### 4.5 Lapped (+1 LAP) 드라이버
- `IntervalRecord.interval` / `gap_to_leader`가 문자열(예: `"+1 LAP"`) → 그대로 표시. 숫자 포맷 함수 적용 전 타입 체크 필수.

### 4.6 DNF / DNS / DSQ
- `SessionResultRecord.dnf / dns / dsq: boolean`
- 세션 종료 후(`display_time ≥ session.date_end`)에만 SessionResult 섹션 표시.
- 강조 배지 색: DNF → 빨강/주황, DNS → 회색, DSQ → 빨강.

### 4.7 session_result 없음 (라이브 중)
- `getSessionResult(driverNum)` 가 null → SessionResult 섹션 전체 미렌더.
- `display_time < session.date_end` 이면 null 여부와 무관하게 미표시.

### 4.8 Qualifying session_result.duration 배열
- `SessionResultRecord.duration: number | Array<number | null> | null`
- 배열인 경우: `[Q1시간, Q2시간, Q3시간]`. null 패딩된 세그먼트는 `—`.
- `session_type == "Qualifying"` 분기 처리.

### 4.9 아웃랩 / 인랩 (is_pit_out_lap)
- `LapRecord.is_pit_out_lap == true` → 랩 시간과 섹터가 비정상(느림). 별도 시각 표시(작은 `PIT OUT` 라벨) 또는 색 제외 처리.
- `lap_duration == null` 인 lap은 RecentLapsTable에서 제외(`getCompletedLapsBefore` 가 보장).

### 4.10 패널 열기 / 닫기 / 전환
- **닫기:** X 버튼, ESC 키, 같은 드라이버 재클릭.
- **다른 드라이버 클릭:** 닫지 않고 슬라이드 트랜지션으로 새 내용 갱신.
- **1280px 미만 viewport:** 자동 닫힘 + 토스트 안내.
- **맵 마커:** 선택된 드라이버 마커에 하이라이트 링(외부 노란 링 1px).

---

## 5. 비주얼 방향

### 5.1 전반 기조
대시보드 전체 다크 테마와 동일. 우측 패널은 배경색을 메인 패널보다 한 단계 밝게(~`#111827` 또는 `#1F2937`) 레이어 구분. 각 섹션 경계에 1px border (`dashboardColors.border`).

### 5.2 DriverHeader 강조
- 헤드샷: 원형 또는 직사각형 크롭. 위에서 team_colour로 강조 그라디언트 띠.
- 드라이버 번호: 특대형(48–64px), team_colour로 색상 적용.
- 팀 이름: 소문자, 팀 컬러 칩과 나란히.

### 5.3 team_colour 사용
- `DriverRecord.team_colour` hex를 `#` 접두사와 함께 사용.
- 번호 텍스트 색, 좌측 세로 강조 띠, 섹션 헤더 accent line에 적용.
- 배경 전체를 팀 컬러로 물들이지 않음.

### 5.4 강조색 규칙
| 목적 | 색 |
|---|---|
| Overall best sector (purple) | `#A855F7` |
| Personal best sector (green) | `#10B981` |
| 그 외 completed sector (yellow) | `#F59E0B` |
| 미통과 / 데이터 없음 | `#374151` |
| DNF / DSQ 배지 | `#EF4444` |
| DNS 배지 | `#6B7280` |

### 5.5 타이어 compound 색
SOFT → `#EF4444`, MEDIUM → `#F59E0B`, HARD → `#E5E7EB`, INTERMEDIATE → `#10B981`, WET → `#3B82F6`.

### 5.6 타이포그래피
- 시간 숫자: monospace, `m:ss.sss` 포맷.
- 섹션 타이틀(LAST LAP, IN PROGRESS, RECENT LAPS 등): uppercase, letter-spacing 넓음, 작은 크기.
- 포지션 숫자(`P2`): 크고 bold.

### 5.7 섹터 바 (SectorBar 공통 컴포넌트)
- 높이 2px, 3등분(각 1/3 폭, 시간 비율 미반영).
- CurrentState와 RecentLapsTable 모두 동일 `SectorBar` 컴포넌트 사용 (`sectorColors.ts` SSOT).

---

## 6. Claude design 프롬프트 스니펫

```
지금은 화면 디자인만 작업합니다. 데이터 연결, store 구현, API 호출 코드는 작성하지 마세요.

## 컨텍스트
soon-board — OpenF1 기반 F1 타이밍 대시보드 (React 18 + TypeScript + Vite).
드라이버 디테일 패널은 레이스 대시보드 우측에 Push 방식으로 열리는 sticky 사이드 패널입니다.
모든 데이터는 DataSource 인터페이스 추상화 뒤에 있으며, 라이브/리플레이 모드를 직접 알지 못합니다.
display_time(t) 하나에만 반응합니다.

## 화면: 드라이버 디테일 패널 (DriverDetailPanel)
폭: ~360px. 우측 sticky. 내부 세로 스크롤 가능.
라우트: /live/:sessionKey 및 /replay/:sessionKey 공통.
다크 테마 (배경 ~#111827 — 메인 패널보다 한 단계 밝음).

## 섹션 구성 (구현 없이 껍데기/목업만)

### 1. DriverHeader (정적, 선택 시 1회)
- 헤드샷(headshot_url, null이면 번호 대형 텍스트 대체)
- broadcast_name / full_name
- driver_number (큰 숫자, team_colour 적용)
- team_name + team_colour 칩
- country_code 플래그

### 2. CurrentState (display_time 반응)
- 한 줄 요약: 순위(P2) · 현재 lap(LAP 35) · interval(+1.2s) / gap_to_leader · 타이어(M 5L)
- Last Lap 서브: 큰 숫자 lap_duration + 섹터 바(2px, S1|S2|S3 1/3 폭, 보라/초록/노랑/회색) + 섹터 시간 텍스트
- In Progress 서브 (주행 중일 때만): 경과/통과 섹터 시간 + 부분 섹터 바(미통과=회색)

### 3. RecentLapsTable
- 기본 5행 (LAP · TIME · S1 · S2 · S3 · SPD)
- 섹터 셀 색: 보라(#A855F7) overall best / 초록(#10B981) personal best / 노랑(#F59E0B) 그 외 / 회색(#374151) null
- 5행 초과 시 "더 보기 (+N) ▾" / "접기 ▴" 토글

### 4. StintHistory
- #번호 · compound(색 chip) · L시작–L종료 · tyre_age 표시
- 가로 stint 막대 (compound 색 fill)
- 진행 중 stint: → 화살표 또는 "진행 중" 라벨

### 5. PitHistory
- "Lap N · XX.Xs lane (YY.Ys box)" 한 줄씩. stop_duration null → "box: —"

### 6. SessionResult (display_time ≥ session.date_end 시만 표시)
- 최종 순위 / 총 lap / 총 시간(또는 gap_to_leader)
- DNF / DNS / DSQ 배지
- Qualifying: duration 배열 → Q1/Q2/Q3 시간 표시

## 데이터 계약 (mock 시 아래 타입 구조 사용)
// DriverRecord: { driver_number, broadcast_name, full_name, name_acronym, team_name, team_colour, headshot_url: string|null, country_code: string|null }
// PositionRecord: { position: number, date: Date }
// IntervalRecord: { interval: number|string|null, gap_to_leader: number|string|null, date: Date }
// LapRecord: { lap_number, lap_duration: number|null, duration_sector_1/2/3: number|null, date_start: Date|null, is_pit_out_lap: boolean, st_speed: number|null }
// StintRecord: { stint_number, compound, lap_start, lap_end, tyre_age_at_start }
// PitRecord: { date: Date, lap_number, pit_duration: number|null }
// SessionResultRecord: { position: number|null, number_of_laps: number|null, duration: number|Array<number|null>|null, gap_to_leader: number|string|Array<number|null>|null, dnf: boolean, dns: boolean, dsq: boolean }
// AggregateResults.purple_sectors: { s1,s2,s3: { driver_number, sector_duration } | null }
// AggregateResults.personal_bests: Map<driver_number, { best_sector_1/2/3: number|null }>

## 디자인 가이드
- team_colour hex를 번호 텍스트 색 + 좌측 강조 띠에 사용. 배경 전체 물들이기 금지.
- 섹터 바: 높이 2px, 3등분 (시간 비율 미반영). CurrentState와 RecentLapsTable에 동일 컴포넌트.
- 타이밍 숫자: monospace. 섹션 타이틀: uppercase letter-spacing.
- interval/gap이 string("+1 LAP")이면 그대로 표시.
- is_pit_out_lap == true인 랩은 "PIT OUT" 소라벨 표시.
- 섹션 경계: 1px border (어두운 계열, dashboardColors.border).
```
