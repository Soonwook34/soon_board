# 디자인 브리프 — 메인 페이지(시즌 → GP → 세션 선택)

> 한 줄 요약: 연도 선택 → GP 그리드 탐색 → 세션 선택 → 라이브/리플레이 진입까지의 전체 흐름을 담는 허브 화면.
> 라우트: `/` · 데이터: 정적 카탈로그(`/seasons/index.json`, `/seasons/{year}.json`)

---

## 1. 목적 / 컨텍스트

이 화면은 soon-board의 **유일한 진입 허브**다. 사용자는 여기서 세 단계를 거쳐 목적지에 도달한다.

1. **연도 선택** — 시즌 picker로 보고 싶은 시즌(2023~현재)을 고른다.
2. **GP(meeting) 탐색** — 해당 시즌의 모든 그랑프리가 카드 그리드로 펼쳐진다.
3. **세션 선택** — GP 카드를 클릭하면 인라인으로 세션 목록이 확장된다. 세션 클릭 시 라이브(`/live/{session_key}`) 또는 리플레이(`/replay/{session_key}`) 화면으로 라우팅된다.

OpenF1 라이브 스트림에 **전혀 의존하지 않는다.** 소비하는 데이터는 GitHub Actions 일일 cron이 빌드해 Vercel CDN에 올린 정적 JSON뿐이다. 현재 시즌만 예외적으로 런타임에 백그라운드 재검증을 1회 수행한다(일정 변경 감지용).

**Hero 배너**는 가장 임박한 upcoming 또는 현재 진행 중(live) 세션을 자동으로 선택해 카운트다운 또는 라이브 진입 버튼을 보여준다. 모두 종료된 오프시즌에는 가장 최근 past 세션 결과를 표시한다.

---

## 2. 화면 구성 (패널 인벤토리 + 레이아웃)

### ASCII 와이어프레임 (1280px+ 기준)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  SOON BOARD                                        [______________ 🔍]   │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  HERO BANNER                                                       │  │
│  │  ⓘ LIVE  Australian GP · Race                                     │  │
│  │          Started 12m ago                    [→ Enter live screen] │  │
│  └────────────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────────┤
│  Season: [2026 ▾]   │  [Race] [Quali] [Sprint] [Practice]  (세션 타입)  │
│                     │  [Past] [Live] [Upcoming] [Cancelled] (상태)       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   ← GP 그리드 (4열)       │
│  │  PAST  │ │  PAST  │ │  LIVE  │ │  UPCM  │                           │
│  │  🇧🇭 BHR │ │  🇸🇦 SAU │ │  🇦🇺 AUS │ │  🇯🇵 JPN │                           │
│  │ Sakhir │ │ Jeddah │ │Melbourne│ │Suzuka  │                           │
│  │ Mar 2  │ │ Mar 9  │ │ now ●  │ │ +6d    │                           │
│  └────────┘ └────────┘ └────────┘ └────────┘                           │
│                                                                          │
│  (GP 카드 클릭 시 카드 아래 행에 세션 패널 인라인 확장 ↓)               │
│                                                                          │
│  ┌────────┐ ┌─────────────────────────────────────────────┐ ┌────────┐  │
│  │  PAST  │ │  ▼ Australian GP · Mar 16                   │ │  UPCM  │  │
│  │  CHN   │ │                                             │ │  MIA   │  │
│  │        │ │  ┌─FP1──┐ ┌─FP2──┐ ┌─FP3──┐               │ │        │  │
│  │        │ │  │ PAST │ │ PAST │ │ PAST │               │ │        │  │
│  └────────┘ │  │VER   │ │NOR   │ │HAM   │               │ └────────┘  │
│             │  └──────┘ └──────┘ └──────┘               │             │
│             │  ┌─QUAL─────┐ ┌─RACE──────┐               │             │
│             │  │  LIVE ●  │ │  UPCOMING │               │             │
│             │  │  now     │ │  +1d 4h   │               │             │
│             │  └──────────┘ └───────────┘               │             │
│             └─────────────────────────────────────────────┘             │
│                                                                          │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                           │
│  │  UPCM  │ │  UPCM  │ │  UPCM  │ │  UPCM  │                           │
│  └────────┘ └────────┘ └────────┘ └────────┘                           │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 영역별 설명

| 영역 | 컴포넌트 | 역할 |
|---|---|---|
| **상단 헤더** | 로고 + 검색바 | 브랜드 + 전역 GP 검색(meeting_name / location / country_name / circuit_short_name) |
| **Hero 배너** | `Hero.tsx` | 가장 임박한 upcoming/live 세션 1개를 자동 선택. UPCOMING이면 카운트다운("in 2d 14h"), LIVE면 진행 중 표시 + 진입 버튼. 오프시즌이면 최근 race 결과 카드. |
| **시즌 Picker + 필터 바** | `SeasonPicker.tsx` + `SearchFilter.tsx` | 연도 드롭다운(index.json 기반 동적 옵션) + 세션 타입 / 상태 필터 (멀티 체크) |
| **GP 그리드** | `GpGrid.tsx` + `GpCard.tsx` | 4열 CSS Grid. 각 GP 카드에 국가 플래그, 서킷명, 날짜, 상태 배지 표시 |
| **인라인 세션 패널** | `ExpandedSessions.tsx` + `SessionCard.tsx` | GP 카드 클릭 시 해당 행 다음에 슬라이드 다운(250ms). 세션 카드마다 상태 배지 + 카운트다운 또는 result_preview 요약 |
| **result_preview 요약** | `ResultPreviewTooltip.tsx` | PAST 세션 카드 호버 시 200ms 지연 후 팝업. 포디엄 3인(팀컬러 점), fastest_lap, rainfall_any 표시 |

---

## 3. 데이터 계약 (mock = 실제 타입)

### 사용 타입 (`src/shared/seasonData.ts`)

| 인터페이스 | 핵심 필드 |
|---|---|
| `SeasonsIndex` | `generated_at: string`, `seasons: SeasonIndexEntry[]` |
| `SeasonIndexEntry` | `year: number`, `generated_at: string`, `source: string` |
| `SeasonData` | `year: number`, `generated_at: string`, `meetings: MeetingData[]` |
| `MeetingData` | `meeting_key: number`, `meeting_name: string`, `location?: string`, `country_name?: string`, `country_flag?: string`, `circuit_short_name?: string`, `gmt_offset?: string`, `date_start?: string`, `date_end?: string`, `is_cancelled?: boolean`, `sessions: SessionData[]` |
| `SessionData` | `session_key: number`, `session_name: string`, `session_type: string`, `date_start: string`, `date_end: string`, `is_cancelled?: boolean`, `result_preview?: ResultPreview` |
| `ResultPreview` | `podium: ResultPreviewDriverRow[]`, `fastest_lap: { driver_number, name_acronym, lap_duration } \| null`, `rainfall_any: boolean` |
| `ResultPreviewDriverRow` | `position: number`, `driver_number: number`, `name_acronym: string`, `team_colour: string` |

### 데이터 출처 (fetch 경로)

```
GET /seasons/index.json          → SeasonsIndex   (< 1KB, 시즌 picker 초기화)
GET /seasons/{year}.json         → SeasonData     (~30–80KB, 해당 시즌 전체)
```

- 초기 로드: `index.json` + 현재 시즌 JSON 2회만 fetch. 다른 시즌은 picker 변경 시 lazy fetch.
- 현재 시즌만 백그라운드에서 OpenF1 API와 비교해 `is_cancelled` / `date_start` / `date_end` 변경 감지.

### 표기 규칙

| 필드 | 표기 방법 |
|---|---|
| `team_colour` | 앞에 `#` 없는 6자리 hex로 저장됨 → CSS에서 `#${team_colour}` 로 사용 |
| `lap_duration` | 초 단위 float (예: `89.123`) → 표시 시 `m:ss.SSS` 포맷 (예: `1:29.123`) |
| `date_start` / `date_end` | ISO 8601 문자열 → 사용자 기기 wall-clock 기준 로컬 시간 표시. `meeting.gmt_offset` 을 보조 정보로 활용 가능 |
| `country_flag` | OpenF1 제공 URL 그대로 `<img>` src로 사용 |

---

## 4. 상태 / 엣지케이스

세션 상태는 `SessionData.date_start`, `date_end`, `is_cancelled` 세 필드와 사용자 기기 wall-clock으로 결정된다. 라이브 윈도우는 `[start − 30min, end + 30min]` (OpenF1 정책).

### 세션 상태 매트릭스

| 상태 | 조건 | 카드 표시 | 클릭 동작 |
|---|---|---|---|
| `upcoming` | `now < date_start − 30min` | 파란 배지 "UPCOMING" + 카운트다운 ("in Xd Yh") | `/live/{session_key}` + 카운트다운 오버레이 |
| `live` | `date_start − 30min ≤ now ≤ date_end + 30min` | 빨간 배지 "LIVE" + 빨간 점 (진행 중 구간) | `/live/{session_key}` 즉시 진입 |
| `past` | `now > date_end + 30min` | 회색 배지 "PAST" + result_preview 요약(있으면) | `/replay/{session_key}` |
| `cancelled` | `is_cancelled === true` | 취소선 + "CANCELLED" 배지 | 비활성(클릭 불가) |

### GP(meeting) 상태 집계

- 소속 세션 중 하나라도 `live` → GP 배지 "LIVE"
- `live` 없고 `upcoming` 있으면 → "UPCOMING" (가장 빠른 세션 기준 잔여 시간)
- 전부 `past` → "PAST"
- 전부 `cancelled` → "CANCELLED"

### 엣지케이스 처리

| 케이스 | 표시 방법 |
|---|---|
| **로딩 중** | GP 카드 위치에 스켈레톤 플레이스홀더(회색 사각형 애니메이션). Hero도 스켈레톤. |
| **빈 시즌** (`meetings` 배열 길이 0) | 그리드 대신 "이 시즌의 GP 정보가 아직 없습니다" 안내 텍스트 |
| **is_cancelled meeting** | GP 카드 자체를 취소선 + 반투명 처리. 기본 상태 필터에서 숨김(Cancelled 기본 OFF) |
| **is_cancelled session** | 세션 카드 취소선 + 비활성. result_preview 없음(당연) |
| **미래 세션 (result_preview 없음)** | 포디엄/패스티스트 영역 표시 안 함. 카운트다운만 표시 |
| **종료됐으나 result_preview 없는 세션** | "결과 데이터 없음" 플레이스홀더(대시 —) |
| **rainfall_any === true** | 세션 카드에 빗방울 아이콘(☔) 또는 "WET" 태그 표시 |
| **검색/필터 결과 0건** | 그리드 대신 "조건에 맞는 GP가 없습니다 — 필터 초기화" 버튼 |
| **1024px 미만 화면** | 상단에 "더 넓은 화면에서 보시는 것을 권장합니다" 안내 배너. 단일 컬럼 fallback. |

---

## 5. 비주얼 방향

### 톤 & 테마

- **다크 모드 only.** F1 방송 그래픽 분위기: 짙은 거의 검은 배경(`#0a0a0a` 계열) + 밝은 텍스트 + 원색 강조.
- 타이포그래피는 모노스페이스 혼용: 카운트다운 숫자, 랩타임, session_key 등 수치 데이터는 고정 폭 폰트로.

### GP 카드 위계

```
┌─────────────────────────┐
│  🇦🇺  [국가 플래그]       │  ← 상단: 국가 플래그 + 국가코드
│  Australian GP           │  ← meeting_name
│  Melbourne               │  ← location (circuit_short_name)
│  Mar 16                  │  ← date_start (로컬 날짜)
│                          │
│  ████ LIVE  ●            │  ← 상태 배지 (색상 코딩)
└─────────────────────────┘
```

- **PAST** 카드: 약간 어두운 배경, 회색 배지
- **LIVE** 카드: 테두리 강조(빨간 glow 또는 1px solid red), 빨간 배지 + 점멸 도트
- **UPCOMING** 카드: 기본 밝기, 파란 배지 + 카운트다운 텍스트
- **CANCELLED** 카드: 전체 반투명(opacity 0.4) + 취소선

### result_preview 팝업 (PAST 세션 호버)

- 포디엄 3인: 각 행 왼쪽에 해당 드라이버의 `team_colour`로 칠한 작은 색상 점(●) + 약어(`name_acronym`)
  - P1 금색 배경 / P2 은색 / P3 동색으로 순위 색상 강조
- **fastest_lap**: 보라색(`#9B59B6` 계열) 강조 — F1 DHL 패스티스트랩 전통색
- **rainfall_any**: 빗방울 아이콘(☔) + "WET" 표기, 파란 계열 색상
- 팝업은 세션 카드 위/옆에 떠오름. 배경은 반투명 다크 패널 + 미세한 테두리.

### Hero 배너

- 화면 전체 폭(full-width). 배경은 해당 meeting의 `circuit_image`를 흐리게(blur + darken overlay) 처리해 배경으로.
- LIVE 모드: 빨간 "LIVE ●" 배지 + GP명 + 세션명. 진입 버튼은 CTA 스타일(밝은 빨강 또는 흰색).
- UPCOMING 모드: 큰 카운트다운 숫자(`in Xd Yh Zm`) 중앙 배치.
- 오프시즌: 가장 최근 race의 포디엄 3인 팀컬러 스트라이프를 배경 일부에.

### 일반 원칙

- `team_colour`(6자리 hex)는 드라이버/팀을 나타내는 색 점, 카드 액센트 등에 적극 활용한다.
- 애니메이션은 최소화: 인라인 expand 슬라이드(250ms ease-out), 상태 전환 배지 fade만. 번쩍임 없음.
- 포커스 링(키보드 탐색용) 등 접근성 기본은 유지.

---

## 6. Claude design 프롬프트 스니펫

완성 프롬프트(그대로 복사해서 사용 가능한 버전)는 **[`docs/redesign/01-first-screen-prompt.md`](../01-first-screen-prompt.md)** 를 참조한다. 중복 기재를 피한다.

핵심 제약 두 줄만 요약:
- **데이터 계약 고정**: `seasonData.ts`의 타입(`MeetingData`, `SessionData`, `ResultPreview`, `ResultPreviewDriverRow`)은 변경하지 말고 그대로 소비할 것.
- **상태 판정 기준**: `is_cancelled`, `date_start`, `date_end` + wall-clock 비교. 라이브 윈도우는 `[start − 30min, end + 30min]`.
