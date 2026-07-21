# 디자인 브리프 — 레이스 대시보드

> 세션 전체를 한 화면에서 조망하는 메인 타이밍 화면 · 라우트: `/live/:sessionKey` 및 `/replay/:sessionKey` (공통) · 데이터: DataSource

## 1. 목적 / 컨텍스트

OpenF1 REST 데이터를 기반으로 F1 세션(Race, Sprint, Qualifying, Practice)의 실시간·리플레이 타이밍 정보를 단일 화면에서 제공한다. 라이브와 리플레이 모드는 화면에 투명하며, DataSource 인터페이스 한 겹이 `display_time`이라는 단일 시계를 공급한다. 화면의 모든 패널은 이 `display_time` 값에만 반응하고, 자체 시계나 fetch 로직을 직접 갖지 않는다.

**사용 맥락:** Desktop only (1280px 이상). 1920×1080 기준 디자인. 브라우저 F1 방송그래픽 스타일의 다크 테마. 화면 스크롤 없음(전체 뷰포트 점유).

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

### 2.1 전체 레이아웃 — 사이드 패널 닫힘 (12-col CSS Grid)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ① SessionHeader                                                              │
│  ← BACK  |  트랙명 · 국기 · 세션명  |  현지시각  |  LIVE -30s / REPLAY 1.5×  │
├─────────────────────────────────┬────────────────────────────────────────────┤
│ ② SessionProgress (진행률 바)    │ ④ RaceControlBanner                       │
│  ████████████░░░░  L35 / 57     │  🟡 YELLOW  SECTOR 4 · LAP 35             │
├─────────────────────────────────┴─────────────────┬────────────────────────┤
│                                                   │ ⑤ Leaderboard          │
│                                                   │ LEADERBOARD ────────── │
│                                                   │ P  DRV  INT     LAST   │
│                                                   │ 1  VER   —   1:31.4 M3 │
│                                                   │    ▓░░ ░░▓ ░▓░         │
│                                                   │ 2  NOR +1.2  1:31.7 M5 │
│                                                   │    ▓▓░ ░▓░ ░░▓         │
│                                                   │ 3  PIA +4.8  1:32.1 H2 │
│   ③ Live Map                                      │  ... (20행) ...         │
│   (live-map-implementation.md 참조)               │                        │
│                                                   │ ▸ TYRE STRATEGY ─────  │
│                                                   │ (기본 접힘 — 토글 시)   │
│                                                   │  VER ▰▰▰M ▰▰▰▰H ▰▰S   │
│                                                   │  NOR ▰▰▰▰S ▰▰M ▰▰▰H   │
│                                                   │                        │
│                                                   │ EVENTS ──────────────  │
│                                                   │ 🚩 YELLOW S4 · L35     │
│                                                   │ 🚨 SAFETY CAR · L28    │
│                                                   │ 🔵 DRS ENABLED · L27   │
├───────────────────────────────────────────────────┴────────────────────────┤
│ ⑧ FastestLapBadges (4 카드)                      │ ⑨ WeatherMini           │
│ [🟣 FL VER 1:29.8] [S1 HAM 27.1] [S2 PIA 32.4] [S3 NOR 30.1]  │ 28°C 🌤  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 사이드 패널 열림 시 (Push 모드 — 드라이버 클릭)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ① SessionHeader (전체 폭)                                                       │
├──────────────────────┬────────────────────────────────┬────────────────────────┤
│ ② SessionProgress    │ ④ RaceControlBanner             │                        │
├──────────────────────┴───────────────┬─────────────────┤ ⑩ DriverDetailPanel   │
│                                      │ ⑤ Leaderboard   │  (우측 sticky, ~360px) │
│                                      │  (폭 압축 — LAST │                        │
│                                      │   칼럼 숨김 가능) │                        │
│  ③ Live Map (폭 약간 축소)            │                  │                        │
│                                      │ ▸ TYRE STRATEGY  │                        │
│                                      │ EVENTS           │                        │
├──────────────────────────────────────┴─────────────────┴────────────────────────┤
│ ⑧ FastestLapBadges                                    │ ⑨ WeatherMini           │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 패널별 표시 항목

#### ① SessionHeader
- 좌: ← Back 버튼 (선택적, onBack props)
- 중: 트랙명(`MeetingRecord.location`) + 국기(`country_code`) + 세션명(`SessionRecord.session_name`) + 타입(`session_type`)
- 중-우: 현지 시각(wall clock + `SessionRecord.gmt_offset` 적용, 1초 갱신)
- 우: 모드 인디케이터 — `"LIVE -30s"` / `"REPLAY 1.5×"` / `"⏸ PAUSED"` (`DataSource.getStreamState()`)
- 우 끝: 데이터 끊김 배지(`stalled` 상태 시), CC-BY-4.0 ⓘ 아이콘

#### ② SessionProgress (진행률 바)
- Race/Sprint: 현재 랩 / 총 랩 수. 예: `L35 / 57`. 총 랩 = `raceDistance.json` `(circuit_key, year)` 룩업 (없으면 `L?? / ??`).
- Practice/Qualifying: 경과 시간 / 총 세션 시간 (`date_start`, `date_end` 기준).
- 배경 segment: 적기 구간(빨강), Safety Car 구간(노랑), 정상(어두운 회색).

#### ④ RaceControlBanner
- 현재 활성 플래그/메시지 1건. 예: `🟡 YELLOW SECTOR 4`
- still-active 판정: GREEN/CLEAR → 5s 잔상, CHEQUERED → 세션 끝까지, RED → 다음 GREEN까지, SafetyCar → 텍스트 파싱으로 종료 판정.
- 왼쪽 칼라 띠로 플래그 종류 강조.

#### ⑤ Leaderboard (20행)
헤더 칼럼: `P` · `DRV` · `INT` · `GAP` · `LAST` · `TYR`

각 행:
- **P** — 순위 숫자
- **DRV** — `DriverRecord.name_acronym` + 팀 컬러 칩(`team_colour` hex)
- **INT** — 앞차와의 interval (초). 리더: `—`. lapped: `+1 LAP` 등 문자열.
- **GAP** — 리더와의 gap (`IntervalRecord.gap_to_leader`)
- **LAST** — 직전 완료 lap 시간 (`LapRecord.lap_duration`, 초 포맷). 완료 lap이 없으면 `—`.
  - LAST 아래 2px 섹터 바: S1 | S2 | S3 각 1/3 폭, 색 = overall best(보라) / personal best(초록) / 그 외(노랑) / null(회색)
- **TYR** — compound 1글자 + tyre age. 예: `M5` (Medium, 5랩)
- **표지(badge):**
  - `ⓟ` — 현재 pit lane 진행 중
  - `ⓕ` — 세션 fastest lap 보유
  - `✕` — DNF/DNS/DSQ (session_result 게이트, 세션 종료 후)
  - 피트 후 N랩 노란 점

클릭 시 → DriverDetailPanel(⑩) 열림.

#### ⑥ TyreStrategy (기본 접힘, CollapsibleSection)
- 헤더: `▸ TYRE STRATEGY` 토글
- 드라이버별 가로 stint 막대 (현재 순위 정렬). 가로축 = lap 1 ~ 현재 leader lap.
- compound 색: SOFT=빨강, MEDIUM=노랑, HARD=회백색, INTERMEDIATE=초록, WET=파랑
- 스틴트 경계에 pit stop 점.
- 현재 lap 위치 세로 라인.

#### ⑦ EventTicker (최근 5건, 1줄 ellipsis 클램프)
- `race_control` 최신 5건, 최신이 위.
- 카테고리 아이콘: 🚩 Flag / 🚨 SafetyCar / 🔵 DRS / 📋 Other
- 각 항목: 아이콘 + 1줄 클램프 메시지 + `title` 속성(hover 전문)
- 새 이벤트 슬라이드인, 오래된 항목 fade out.

#### ⑧ FastestLapBadges (4 카드 가로, 하단 띠)
좌에서 순서:
1. **FL** — 세션 fastest lap: 드라이버 컬러 칩 + acronym + 시간 (보라 강조)
2. **S1** — 섹터 1 best: 드라이버 + 시간 (보라)
3. **S2** — 섹터 2 best: 드라이버 + 시간 (보라)
4. **S3** — 섹터 3 best: 드라이버 + 시간 (보라)

각 카드 작은 텍스트로 카드 타이틀, 큰 숫자로 시간. 최고 스피드 트랩(`st_speed`)은 카드 추가 옵션.

#### ⑨ WeatherMini (하단 띠 우측)
- 기온(°C) / 노면 온도(°C) / 강수 아이콘(`rainfall` 0/1) / 풍속+풍향(숫자 + 방향 화살표)

---

## 3. 데이터 계약 (mock = 실제 타입)

### 3.1 패널별 record 타입 + DataSource 메서드

#### ① SessionHeader
- `SessionRecord` (`session_name`, `session_type`, `date_start`, `date_end`, `gmt_offset`, `location`, `country_code`)
- `MeetingRecord` (`location`, `country_code`, `country_name`, `circuit_short_name`, `circuit_key`, `year`)
- `DataSource.getStreamState(): StreamState`
- `DataSource.getDisplayTime(): Date`

#### ② SessionProgress
- `SessionRecord` (`date_start`, `date_end`, `session_type`, `circuit_key`, `year`) — 세션 1회 로드
- `LapRecord` (`lap_number`, `date_start`) — leader의 현재 lap 추적
  - `DataSource.getLapAt(leaderDriverNum, t): LapRecord | null`
- `RaceControlRecord` (`date`, `flag`, `category`, `message`) — 구간 segment 채색
  - `DataSource.getAllBefore('race_control', t): RaceControlRecord[]`
- 총 랩 수: `fetch('/raceDistance.json')` → `(circuit_key, year) → total_laps` 룩업 (런타임 1회)

#### ④ RaceControlBanner
- `RaceControlRecord` (`date`, `flag`, `category`, `scope`, `sector`, `message`, `qualifying_phase`)
  - `DataSource.getLatestBefore('race_control', t): RaceControlRecord | null`
  - still-active 판정은 `flagDecoder.ts` 로직 사용

#### ⑤ Leaderboard
| 항목 | record 타입 | DataSource 메서드 |
|---|---|---|
| 순위 | `PositionRecord` (`position`, `date`) | `getLatestBefore('position', t, { driver_number })` |
| 드라이버 정보 | `DriverRecord` (`name_acronym`, `team_colour`, `driver_number`) | 세션 1회 로드 (정적) |
| interval / gap | `IntervalRecord` (`interval`, `gap_to_leader`, `date`) | `getLatestBefore('intervals', t, { driver_number })` |
| 직전 완료 lap 시간 | `LapRecord` (`lap_duration`, `duration_sector_1/2/3`, `date_start`) | `getCompletedLapsBefore(driverNum, t, 1)` |
| 현재 타이어 | `StintRecord` (`compound`, `tyre_age_at_start`, `lap_start`, `lap_end`) | `getStintForLap(driverNum, currentLap)` |
| pit 진행 중 | `PitRecord` (`date`, `pit_duration`, `lap_number`) | `getLatestBefore('pit', t, { driver_number })` |
| 섹터 바 색 | `AggregateResults` (`purple_sectors`, `personal_bests`) | `getAggregateBefore('purple_sectors', t)`, `getAggregateBefore('personal_bests', t)` |

**섹터 바 색 판정 (`sectorColors.ts` SSOT):**
- `PurpleSectorsAggregate.s1.driver_number == 본인` → 보라 `#A855F7`
- `PersonalBestRow.best_sector_N` < 본인 섹터 시간 → 초록 `#10B981`
- 그 외 → 노랑 `#F59E0B`
- `duration_sector_N == null` → 회색 `#374151`

#### ⑥ TyreStrategy
- `StintRecord` (`driver_number`, `stint_number`, `lap_start`, `lap_end`, `compound`, `tyre_age_at_start`)
  - `DataSource.getAllBefore('stints', t, { driver_number }): StintRecord[]`
  - 막대 길이 계산: `[lap_start, lap_end)` 반-개구간 (중복 카운트 방지)
- `PositionRecord` — 현재 순위 정렬용
  - `DataSource.getLatestBefore('position', t, { driver_number })`
- `PitRecord` — 스틴트 경계 점 표시
  - `DataSource.getAllBefore('pit', t, { driver_number })`

#### ⑦ EventTicker
- `RaceControlRecord` (`date`, `category`, `flag`, `scope`, `sector`, `message`, `lap_number`)
  - `DataSource.getAllBefore('race_control', t, undefined, 5): RaceControlRecord[]`

#### ⑧ FastestLapBadges
- `AggregateResults.fastest_lap: FastestLapAggregate | null`
  - `{ driver_number, lap_number, lap_duration }`
- `AggregateResults.purple_sectors: PurpleSectorsAggregate`
  - `s1 / s2 / s3: PurpleSectorRow | null`
  - `PurpleSectorRow: { driver_number, sector_duration }`
- 호출: `DataSource.getAggregateBefore('fastest_lap', t)`, `getAggregateBefore('purple_sectors', t)`
- driver_number → acronym 조인: `DriverRecord.name_acronym` (정적 drivers 맵)

#### ⑨ WeatherMini
- `WeatherRecord` (`air_temperature`, `track_temperature`, `rainfall`, `wind_speed`, `wind_direction`, `date`)
  - `DataSource.getLatestBefore('weather', t): WeatherRecord | null`

### 3.2 aggregate 사용 요약
| aggregate | 사용 패널 | 메서드 |
|---|---|---|
| `fastest_lap` | ⑧ FastestLapBadges (FL 카드) | `getAggregateBefore('fastest_lap', t)` |
| `purple_sectors` | ⑤ 리더보드 섹터 바, ⑧ S1/S2/S3 배지 | `getAggregateBefore('purple_sectors', t)` |
| `personal_bests` | ⑤ 리더보드 섹터 바 (초록 판정) | `getAggregateBefore('personal_bests', t)` |

---

## 4. 상태 / 엣지케이스

### 4.1 Loading / Buffering / Stalled
- **Buffering** (`StreamState = 'buffering'`): 초기 hydration 중. 각 패널은 skeleton 플레이스홀더 표시. 리더보드 20행 회색 스켈레톤, 타이어 전략 빈 상태, 배지 `—`.
- **Stalled** (`StreamState = 'stalled'`): ≥5s 신규 데이터 없음. SessionHeader에 "데이터 끊김" 배지 표시. 패널 데이터는 마지막 `display_time` 값으로 freeze.
- **Lagging** (`StreamState = 'lagging'`): 헤더 모드 인디케이터에 미묘한 경고색.

### 4.2 라이브 vs 리플레이 차이
- **공통**: 모든 패널은 `DataSource.getDisplayTime()`이 반환하는 단일 `t`에 의존. 모드를 직접 알지 못함.
- **라이브 전용 고려**: `intervals` 데이터는 라이브에서 ~4s cadence로 갱신되지만, 리플레이에서는 historical 보존이 비신뢰 (replay-strategy §1.2). 리플레이 모드에서 `IntervalRecord`가 없거나 stale할 수 있음 → `interval` / `gap_to_leader` null 또는 문자열 대비.
- **모드 전환**: 라이브↔리플레이 전환 시 DriverDetailPanel(⑩)은 자동 닫힘.

### 4.3 미래 누설 zero (Future Leak Prevention)
모든 패널은 `display_time t` 이후 데이터를 표시하지 않는다:
- 리더보드 LAST 칼럼: `date_start + lap_duration ≤ t` 인 lap만 (`getCompletedLapsBefore` 경유)
- 이벤트 티커: `getAllBefore('race_control', t, undefined, 5)` 강제
- 타이어 전략 막대: `getAllBefore('stints', t, { driver_number })` 결과만
- 빠른 랩 배지: `getAggregateBefore` 는 `t`까지 완료된 lap만 누적 — 시크 시 reset 후 재빌드
- 버퍼/캐시에 미래 record가 이미 있어도 DataSource 메서드가 `date ≤ t` 컷 보장

### 4.4 In-progress lap
- 리더보드 LAST 칼럼: 현재 진행 중인 lap(`lap_duration == null`)은 표시 제외 → `getCompletedLapsBefore`가 자동 처리
- 타이어 전략: 현재 스틴트는 `lap_end = current_leader_lap` 으로 진행 중 표기

### 4.5 Lapped (+1 LAP)
- `IntervalRecord.gap_to_leader`와 `interval`은 `number | string | null`. 문자열(예: `"+1 LAP"`) 그대로 표시. 숫자 포맷 함수 적용 전 타입 체크 필수.

### 4.6 DNF / DNS / DSQ
- `SessionResultRecord.dnf / dns / dsq: boolean`
- 세션 종료 후(`display_time ≥ session.date_end`)에만 표시. 표지 `✕` 리더보드 행에 추가.
- `DataSource.getSessionResult(driverNum)` 사용.

### 4.7 session_result 표시 게이트
- `display_time ≥ SessionRecord.date_end` 조건 만족 시에만 DNF/DNS/DSQ 배지 렌더.
- 라이브 중: 이 섹션 숨김.

### 4.8 총 랩 수 없음
- `raceDistance.json`에 `(circuit_key, year)` 항목 없음 → `L?? / ??` 표시. 직전 시즌 fallback 선택적.

### 4.9 1280px 미만
- 사이드 패널 자동 닫힘 + 토스트 안내.
- 1024px 미만: NarrowScreenBanner가 진입 차단.

---

## 5. 비주얼 방향

### 5.1 전반 기조
F1 방송그래픽 스타일 다크 테마. 배경은 거의 검정(~`#0D0D0D` ~ `#111827`). 패널 구분은 미묘한 border(`#1F2937` 계열). 텍스트는 흰색/밝은 회색 계열.

### 5.2 team_colour 사용
- `DriverRecord.team_colour` (6자리 hex, 예: `"1E41FF"`)를 `#` 접두사와 함께 팀 컬러 칩(가로 3–4px 세로 막대 또는 작은 원형 dot)으로 사용.
- 리더보드 DRV 셀 좌측 칩, FastestLapBadge 좌측 칩.
- 칩 이외에 배경을 전체 팀 컬러로 물들이지 않음 (가독성 유지).

### 5.3 강조색 규칙
| 목적 | 색 |
|---|---|
| Overall best sector / Fastest Lap (purple) | `#A855F7` |
| Personal best sector (green) | `#10B981` |
| 그 외 completed sector (yellow) | `#F59E0B` |
| 데이터 없음 / 미통과 sector | `#374151` |
| YELLOW flag / Safety Car 배너 | `#F59E0B` (amber) |
| RED flag | `#EF4444` |
| CHEQUERED / session end | `#FFFFFF` |
| GREEN / clear | `#10B981` |

### 5.4 타이어 compound 색
SOFT → `#EF4444` (빨강), MEDIUM → `#F59E0B` (노랑), HARD → `#E5E7EB` (회백), INTERMEDIATE → `#10B981` (초록), WET → `#3B82F6` (파랑).

### 5.5 플래그 이벤트 배너 (EventBroadcast)
중요 이벤트(RED/YELLOW/SAFETY CAR/CHEQUERED) 발생 시 화면 상단 center에 full-width 슬라이드인 배너. ~5초 후 자동 사라짐. 플래그 종류별 강조색 배경. 일상 메시지(blue flag, track limits)는 미표시.

### 5.6 타이포그래피 방향
- 타이밍 숫자: 고정폭(monospace) 폰트. 1:31.456 형식.
- 드라이버 acronym: 대문자, 중간 크기 bold.
- 패널 타이틀(LEADERBOARD, EVENTS, TYRE STRATEGY): 소문자 letter-spacing 넓은 label.

---

## 6. Claude design 프롬프트 스니펫

```
지금은 화면 디자인만 작업합니다. 데이터 연결, store 구현, API 호출 코드는 작성하지 마세요.

## 컨텍스트
soon-board — OpenF1 기반 F1 타이밍 대시보드 (React 18 + TypeScript + Vite).
라이브와 리플레이 모드를 공통 DataSource 인터페이스로 추상화.
모든 패널은 DataSource.getDisplayTime()이 반환하는 단일 display_time(t)에만 반응합니다.

## 화면: 레이스 대시보드 (/live/:sessionKey 및 /replay/:sessionKey 공통)
Desktop only, 1280×800 이상, 전체 뷰포트 (스크롤 없음).
12-col CSS Grid, 다크 테마 (배경 ~#0D0D0D).

## 주요 패널 (구현 없이 껍데기/목업만)
1. SessionHeader — 트랙명, 국기, 세션명, 현지 시각, 모드 인디케이터(LIVE / REPLAY / PAUSED)
2. SessionProgress — 진행률 바 (L35/57 또는 경과 시간), 적기/SC 구간 segment
3. RaceControlBanner — 현재 활성 플래그 메시지 (최대 1건)
4. Leaderboard — 20행. 칼럼: P / DRV (acronym + team colour 칩) / INT / GAP / LAST + 섹터 바 / TYR (compound + age) / badge
   - 섹터 바: 2px 높이, S1|S2|S3 각 1/3 폭. 색: 보라(#A855F7) overall best / 초록(#10B981) personal best / 노랑(#F59E0B) 그 외 / 회색(#374151) null
5. TyreStrategy — 기본 접힘(▸ 토글). 드라이버별 stint 가로 막대. compound 색: SOFT=빨강, MEDIUM=노랑, HARD=회백, INT=초록, WET=파랑
6. EventTicker — race_control 최근 5건, 1줄 ellipsis 클램프, 카테고리 아이콘
7. FastestLapBadges — 4 카드: FL(fastest lap) · S1 · S2 · S3. 보라 강조.
8. WeatherMini — 기온, 노면온도, 강수(binary), 풍속/풍향
9. EventBroadcast (optional overlay) — 중요 플래그 발생 시 상단 슬라이드인 배너, ~5s 자동 사라짐

## 데이터 계약 (mock 시 아래 타입 구조 사용)
// IntervalRecord: { gap_to_leader: number | string | null, interval: number | string | null }
// LapRecord: { lap_duration: number | null, duration_sector_1/2/3: number | null, is_pit_out_lap: boolean }
// StintRecord: { compound: string, tyre_age_at_start: number, lap_start: number, lap_end: number }
// PitRecord: { date: Date, pit_duration: number | null, lap_number: number }
// DriverRecord: { name_acronym: string, team_colour: string, driver_number: number, headshot_url: string | null }
// WeatherRecord: { air_temperature: number, track_temperature: number, rainfall: number, wind_speed: number, wind_direction: number }
// AggregateResults.fastest_lap: { driver_number, lap_number, lap_duration } | null
// AggregateResults.purple_sectors: { s1, s2, s3: { driver_number, sector_duration } | null }
// AggregateResults.personal_bests: Map<driver_number, { best_sector_1/2/3: number | null }>

## 디자인 가이드
- team_colour hex를 팀 칩(3–4px 세로 막대)으로 사용. 배경 전체 물들이기 금지.
- 타이밍 숫자: monospace. 드라이버 acronym: 대문자 bold.
- 패널 타이틀: letter-spacing 넓은 uppercase label.
- interval/gap이 string("+1 LAP")인 경우 그대로 표시.
```
