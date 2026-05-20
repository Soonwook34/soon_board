# 메인 페이지 구현 계획 (pending approval)

> 작성일: 2026-05-20 · 상태: **pending approval**
> 전제: [openf1-api-reference.md](../../docs/openf1-api-reference.md), [live-streaming-strategy.md](../../docs/live-streaming-strategy.md), [replay-strategy.md](../../docs/replay-strategy.md), [live-map-implementation.md](./live-map-implementation.md), [dashboard-implementation.md](./dashboard-implementation.md). 본 계획은 그 두 화면(라이브 / 리플레이)의 **진입점인 메인 페이지**의 구현 전략이다.

---

## 0. 한눈에 보는 사양

| 항목 | 값 |
|---|---|
| 카탈로그 신선도 (사용자 결정) | **정적 시드(빌드 타임) + 현재 시즌만 런타임 재검증** |
| 랜딩 구조 (사용자 결정) | **Upcoming/Live Hero + 시즌 그리드** |
| GP → 세션 UX (사용자 결정) | **인라인 확장 (Expand)** |
| 추가 기능 (사용자 결정) | **검색·필터** + **완료 세션 결과 미리보기** |
| 시간 정렬 기준 | 사용자 wall_clock (기기 시간). 시계 오차 위험은 §13 |
| 데이터 단위 | 연도별 1개 JSON 파일 (`seasons/{year}.json`) |
| 커버리지 | 2023 ~ 현재 연도 + 알려진 미래 시즌 |
| API 호출 | 빌드 타임 1회/일 + 런타임은 현재 시즌 재검증 1회/페이지 로드 |

---

## 1. 화면 구조

### 1.1 기본 형태

```
┌──────────────────────────────────────────────────────────────────────┐
│ 로고/타이틀                                       검색바 [_______ 🔍] │
├──────────────────────────────────────────────────────────────────────┤
│ ⓘ NEXT  Spanish GP · Qualifying                                      │
│         Starts in 2d 14h 32m  ⏰              [Enter live screen →] │
├──────────────────────────────────────────────────────────────────────┤
│ Season: [2026 ▾]   Filters: [Race] [Quali] [Sprint] [Practice]      │
│                    Status: [Past] [Live] [Upcoming]                  │
├──────────────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐               │
│ │ PAST │ │ PAST │ │ LIVE │ │ UPCM │ │ UPCM │ │ UPCM │  ← GP 그리드  │
│ │ BHR  │ │ SAU  │ │ AUS  │ │ JPN  │ │ CHN  │ │ MIA  │               │
│ │ Mar2 │ │ Mar9 │ │ now  │ │ +6d  │ │ +13d │ │ +20d │               │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘               │
│                                                                      │
│ (인라인 확장: GP 카드 클릭 시 카드 아래로 펼쳐져 세션 리스트 표시)    │
│                                                                      │
│ ┌──────┐ ┌──────┐ ... (시즌 전체 24개 카드 4열 × 6행)                │
│ └──────┘ └──────┘                                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 GP 카드 확장 시 (인라인 expand)

```
┌──────┐ ┌──────┐ ┌─────────────────────────────────────────┐ ┌──────┐
│ PAST │ │ PAST │ │ ▼ Australian GP · Mar 16                │ │ UPCM │
│ BHR  │ │ SAU  │ │   (Race date: 2026-03-16T05:00:00Z)     │ │ JPN  │
│ Mar2 │ │ Mar9 │ │                                          │ │ +6d  │
└──────┘ └──────┘ │  ┌─FP1─┐ ┌─FP2─┐ ┌─FP3─┐                 │ └──────┘
                  │  │PAST │ │PAST │ │PAST │                 │
                  │  │1:23 │ │1:22 │ │1:21 │                 │
                  │  └─────┘ └─────┘ └─────┘                 │
                  │  ┌─QUAL──┐ ┌─RACE──┐                     │
                  │  │ LIVE  │ │ UPCM  │                     │
                  │  │ now   │ │ +1d   │                     │
                  │  └───────┘ └───────┘                     │
                  └─────────────────────────────────────────┘
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                                 ...
│ UPCM │ │ UPCM │ │ UPCM │ │ UPCM │
└──────┘ └──────┘ └──────┘ └──────┘
```

- 다른 GP 카드 클릭 시 기존 확장은 자동 collapse, 새 카드 expand
- 세션 카드 클릭 시:
  - **PAST** → `/replay/{session_key}` 진입 (리플레이 모드)
  - **LIVE** → `/live/{session_key}` 진입 (라이브 모드)
  - **UPCOMING** → `/live/{session_key}` 진입 + 카운트다운 오버레이 (§5)

### 1.3 그리드 결정

- Desktop 1280 px: 4열 × 6행 (24 GP 시즌 기준)
- Tablet 768 px: 3열 × 8행
- Mobile 480 px: 2열 × 12행
- Hero는 항상 전체 폭

---

## 2. 데이터 모델 (연도별 JSON)

### 2.1 파일 구조

```
src/main/data/seasons/
├── 2023.json
├── 2024.json
├── 2025.json
├── 2026.json     ← 현재 시즌 (런타임 재검증 대상)
└── 2027.json     ← 미래 시즌 (알려진 일정만, 부분 데이터)
```

### 2.2 스키마 (한 연도 = 한 파일)

```json
{
  "year": 2024,
  "generated_at": "2026-05-20T00:00:00Z",
  "source": "openf1.org/v1",
  "meetings": [
    {
      "meeting_key": 1229,
      "meeting_name": "Bahrain Grand Prix",
      "meeting_official_name": "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2024",
      "location": "Sakhir",
      "country_code": "BRN",
      "country_name": "Bahrain",
      "country_flag": "https://media.formula1.com/.../bahrain-flag.png",
      "circuit_key": 63,
      "circuit_short_name": "Sakhir",
      "circuit_type": "Permanent",
      "circuit_image": "https://media.formula1.com/.../Bahrain_carbon.png",
      "gmt_offset": "03:00:00",
      "date_start": "2024-02-29T11:30:00+00:00",
      "date_end": "2024-03-02T17:00:00+00:00",
      "is_cancelled": false,
      "sessions": [
        {
          "session_key": 9468,
          "session_name": "Practice 1",
          "session_type": "Practice",
          "date_start": "2024-02-29T11:30:00+00:00",
          "date_end": "2024-02-29T12:30:00+00:00",
          "is_cancelled": false,
          "result_preview": {
            "podium": [
              { "position": 1, "driver_number": 1,  "name_acronym": "VER", "team_colour": "3671C6" },
              { "position": 2, "driver_number": 11, "name_acronym": "PER", "team_colour": "3671C6" },
              { "position": 3, "driver_number": 55, "name_acronym": "SAI", "team_colour": "F91536" }
            ],
            "fastest_lap": {
              "driver_number": 1,
              "name_acronym": "VER",
              "lap_duration": 89.123
            },
            "rainfall_any": false
          }
        }
      ]
    }
  ]
}
```

**필드 정책:**
- `result_preview`는 PAST 세션에만 포함 (빌드 타임 1회 계산, 이후 immutable)
- `sessions[].is_cancelled == true` 이면 result_preview 없음
- `meeting`의 `date_start`/`date_end`는 정보용. 상태 판정은 `sessions[].date_start`/`date_end`로
- 미래 세션은 `result_preview` 미포함

### 2.3 크기 예산

- 한 시즌 ~24 meetings × ~5 sessions = ~120 세션 객체
- 평균 1 세션 = ~400 바이트 (result_preview 포함 ~700 바이트)
- 한 시즌 JSON ≈ **30 ~ 80 KB** (gzip ≈ 10 ~ 20 KB)
- 4 시즌 누적 ~300 KB / gzip ~60 KB → 초기 로드 영향 미미

---

## 3. 빌드 + 런타임 데이터 파이프라인

### 3.1 빌드 타임 (`scripts/fetch-season-catalog.ts`)

각 연도별로:
1. `GET /v1/meetings?year={Y}` (1 req)
2. 각 meeting에 대해 `GET /v1/sessions?meeting_key={K}` (~24 req)
3. PAST 세션(`date_end < now`)에 대해:
   - `GET /v1/session_result?session_key={S}&position<=3` (포디움)
   - `GET /v1/laps?session_key={S}&lap_duration>0` 중 최소값 (최고 랩)
   - `GET /v1/weather?session_key={S}&rainfall=1` 1건 이상 존재 여부 (`rainfall_any`)
4. 합쳐서 `src/main/data/seasons/{year}.json` 저장

**총 호출 수 (한 시즌):** ~1 + 24 + 120×3 = ~385 req. 무료 30 req/min 한도로 ~13분. **반드시 백엔드/CI에서 실행** (브라우저 X).

**스로틀링:** 25 req/min로 호출 (29s 간격), 4 시즌 빌드 ≈ 1시간 — CI 매일 1회 실행 (충분).

### 3.2 일일 CI 갱신

- GitHub Actions 매일 자정 UTC + 1h (OpenF1의 sessions/meetings 갱신 직후)
- 4개 시즌 JSON 재생성 후 PR로 커밋 (또는 직접 main 브랜치 push)
- PAST 세션의 `result_preview`는 immutable이므로 **재계산 생략** (incremental — 새 PAST 진입 세션만 계산)
- 미래 시즌은 일정 변경(우천 취소 등) 반영

### 3.3 런타임 재검증 (현재 시즌만)

- 페이지 로드 시 `seasons/2026.json` 정적 로드 (즉시 표시)
- 백그라운드로 `GET /v1/sessions?year=2026` 1회 호출 (~1 req)
- 응답 비교:
  - `is_cancelled`/`date_start`/`date_end`가 다른 세션 찾아내 in-memory 패치
  - 차이가 있으면 UI에 "일정이 업데이트되었습니다" 토스트 (자동 새로고침은 안 함)
- 과거 연도는 재검증 안 함 (immutable)

---

## 4. 상태 판정 (past / live / upcoming) + 카운트다운

### 4.1 판정 로직

```ts
type SessionStatus =
  | { kind: "past";     finishedAgoMs: number }
  | { kind: "live";     startedAgoMs: number; endsInMs: number }
  | { kind: "upcoming"; startsInMs: number; liveWindowOpensInMs: number }
  | { kind: "cancelled" };

const LIVE_PREROLL_MS = 30 * 60 * 1000;  // OpenF1 라이브 윈도우는 시작 30min 전부터
const LIVE_POSTROLL_MS = 30 * 60 * 1000;

function classify(session: SessionData, now: Date): SessionStatus {
  if (session.is_cancelled) return { kind: "cancelled" };
  const start = +new Date(session.date_start);
  const end = +new Date(session.date_end);
  const t = +now;
  if (t < start - LIVE_PREROLL_MS) {
    return {
      kind: "upcoming",
      startsInMs: start - t,
      liveWindowOpensInMs: (start - LIVE_PREROLL_MS) - t
    };
  }
  if (t < end + LIVE_POSTROLL_MS) {
    return { kind: "live", startedAgoMs: t - start, endsInMs: (end + LIVE_POSTROLL_MS) - t };
  }
  return { kind: "past", finishedAgoMs: t - end };
}
```

**라이브 vs 진짜 진행 중 구분:**
- 라이브 윈도우는 `[start − 30min, end + 30min]` (OpenF1 정책)
- "진짜 진행 중"은 `[start, end]` — UI에서 `started_ago_ms > 0` 일 때 빨간 점 추가

### 4.2 GP(meeting) 상태 = sessions 집계

- GP에 LIVE 세션이 하나라도 있으면 → `live`
- 없고, upcoming 세션이 하나라도 있으면 → `upcoming` (가장 가까운 세션 기준 잔여 시간)
- 모두 past 이면 → `past`
- 모두 cancelled → `cancelled`

### 4.3 카운트다운 컴포넌트

`<Countdown targetDate={...} format="auto" />`

- 1초마다 갱신 (`setInterval` 1000ms)
- 포맷 자동:
  - > 24h: "in Xd Yh"
  - > 1h: "in Xh Ym"
  - > 1m: "in Xm Ys"
  - < 1m: "in Xs" (밝은 색 강조)
- 0 도달 시 자동으로 status 재평가 + UI 갱신

### 4.4 다음 Upcoming 세션 선택 (Hero용)

```ts
function nextUpcomingSession(allSeasons: SeasonData[], now: Date): SessionData | null {
  return allSeasons
    .flatMap(s => s.meetings.flatMap(m => m.sessions.map(sess => ({ sess, meeting: m }))))
    .filter(({ sess }) => classify(sess, now).kind === "upcoming")
    .sort((a, b) => +new Date(a.sess.date_start) - +new Date(b.sess.date_start))[0] ?? null;
}
```

- LIVE 세션이 있으면 그것이 우선 (Hero가 LIVE 모드로 전환)
- 없으면 가장 빠른 upcoming
- 모두 past 이면 Hero에 "오프시즌입니다" + 가장 최근 past 세션 결과 표시

---

## 5. 라이브 화면 진입 시 카운트다운 오버레이

사용자가 upcoming 세션 카드를 클릭하면 `/live/{session_key}`로 진입. 도착한 시점에 세션이 아직 시작 안 했다면:

```
┌─────────────────────────────────────────┐
│                                         │
│     Australian GP · Race                │
│     Starts in                           │
│                                         │
│         01:23:45                        │
│         (HH:MM:SS, 1초 갱신)             │
│                                         │
│     Status: pre-session (no live data)  │
│                                         │
│     [← Back to main]                    │
└─────────────────────────────────────────┘
```

- 화면 중앙에 큰 HH:MM:SS 카운트다운
- `liveWindowOpensInMs`까지 도달하면 → 라이브 데이터 수신 시작 시도
- `startsInMs == 0` (정확히 lights out 시점)에 도달하면 카운트다운 페이드아웃 + 라이브맵/대시보드 표시
- 라이브 윈도우 진입(start − 30min) 후에도 `newest_received_date`가 충분히 진행 안 됐으면 "Waiting for first data..." 표시

**구현 위치:** `src/live/CountdownOverlay.tsx`. 라이브 화면 컴포넌트(`LiveScreen.tsx`)가 status에 따라 오버레이 또는 라이브맵+대시보드 중 하나를 렌더.

---

## 6. 인라인 확장 UX 디테일

### 6.1 동작 규칙

- GP 카드 클릭 → 카드 자체에 `expanded` 클래스 추가 + 다음 row 위치에 세션 리스트 패널이 슬라이드 다운 (250ms)
- 다른 GP 클릭 → 기존 패널 collapse (150ms) → 새 패널 expand
- 같은 GP 다시 클릭 또는 ESC → collapse
- 한 번에 1개만 expanded

### 6.2 그리드 reflow 처리

CSS Grid `grid-template-rows: auto`로 expanded 패널이 들어간 row가 자동 확장. 다른 row의 GP 카드 위치는 변경되지 않음 (grid auto-flow가 row 단위로 안정).

### 6.3 URL 보존

- expanded 상태는 `?gp=<meeting_key>` 쿼리로 보존
- 새로고침 시 자동 복원
- LIVE/UPCOMING/PAST 세션 클릭 시 `/live` 또는 `/replay` 라우트로 페이지 전환 (history.push)

---

## 7. 검색 + 필터

### 7.1 검색

- 상단 검색바 (`SearchFilter.tsx`)
- 입력 시 디바운스 200ms 후 필터링
- 매칭 대상 필드: `meeting.meeting_name`, `meeting.location`, `meeting.country_name`, `meeting.circuit_short_name`
- 매칭 방식: 대소문자 무시 substring (fuzzy는 MVP에선 미적용)
- 매칭 안 되는 GP 카드는 grid에서 숨김

### 7.2 필터

| 필터 | 옵션 | 기본값 |
|---|---|---|
| 세션 타입 | Race / Qualifying / Sprint / Sprint Qualifying / Practice | 전부 ON |
| 상태 | Past / Live / Upcoming / Cancelled | Cancelled OFF, 나머지 ON |

- 다중 선택 가능 (checkbox)
- 필터는 GP 카드에서 표시할 **세션 종류**만 영향. GP 자체는 해당 종류의 세션이 하나라도 있으면 표시.
- 상태 필터는 GP 단위로 판정 (§4.2)

### 7.3 빈 결과 처리

- 검색+필터 조합으로 매칭 GP가 0개면 "조건에 맞는 GP가 없습니다 — 필터 초기화" 버튼

---

## 8. 완료 세션 결과 미리보기

### 8.1 트리거

- PAST 세션 카드(인라인 확장 안에 있는 작은 카드)를 호버 → 미리보기 카드가 200ms 지연 후 표시
- 모바일/터치 환경: 호버 없음 → 길게 누름(long-press 500ms)로 대체. 짧은 탭은 진입.

### 8.2 미리보기 내용

```
┌─────────────────────────────┐
│ 🏁 Australian GP · Race      │
│ ────────────────────────────│
│ 🥇 P1  VER  1:21:14.567     │
│ 🥈 P2  HAM  +2.3s            │
│ 🥉 P3  LEC  +5.7s            │
│                              │
│ ⚡ Fastest: VER 1:21.123     │
│ ☔ Rain: No                  │
└─────────────────────────────┘
```

- 데이터 출처: `seasons/{year}.json`의 `session.result_preview` (빌드 타임 사전 계산)
- 호버 해제 시 100ms 후 사라짐 (잠깐 다른 영역 거치는 마우스 이동 허용)

### 8.3 Qualifying 세션 변형

Qualifying은 포디움 대신 Q3 상위 3 + Pole Position 시간:
```
🏁 Australian GP · Qualifying
🥇 P1 VER  Q3 1:15.234 (POLE)
🥈 P2 LEC  Q3 +0.123s
🥉 P3 HAM  Q3 +0.345s
```

---

## 9. 라우팅 + URL 구조

| 라우트 | 의미 |
|---|---|
| `/` | 메인 페이지 (현재 시즌 자동 선택) |
| `/?season=2024` | 시즌 picker 상태 (URL 쿼리) |
| `/?season=2024&gp=1229` | + GP 확장 상태 |
| `/?q=monaco` | 검색 상태 |
| `/?session=race,qualifying` | 세션 타입 필터 |
| `/?status=upcoming,live` | 상태 필터 |
| `/live/{session_key}` | 라이브 화면 진입 |
| `/replay/{session_key}` | 리플레이 화면 진입 |

**라우팅 라이브러리:** 미정 (§16). 메인 페이지 자체는 1개 뷰 + 쿼리 파라미터만 사용하므로 `history.pushState` 직접 사용도 충분.

---

## 10. 모듈 구조

```
src/main/
├── index.ts
├── MainPage.tsx                   # 최상위 컨테이너
├── Hero.tsx                       # 다음 upcoming/live 세션 hero + 큰 카운트다운
├── SeasonPicker.tsx               # 시즌 dropdown
├── GpGrid.tsx                     # CSS Grid 컨테이너 + reflow 관리
├── GpCard.tsx                     # 개별 GP 카드 (썸네일·국가플래그·상태배지)
├── ExpandedSessions.tsx           # GP 확장 시 표시되는 세션 패널
├── SessionCard.tsx                # 인라인 확장 안의 작은 세션 카드
├── StatusBadge.tsx                # PAST / LIVE / UPCOMING / CANCELLED 배지
├── Countdown.tsx                  # 1초 갱신 카운트다운 (Hero + UPCOMING 카드)
├── SearchFilter.tsx               # 상단 검색바 + 필터
├── ResultPreviewTooltip.tsx       # PAST 세션 호버 미리보기
├── stores/
│   ├── catalogStore.ts            # 시즌 JSON 로드 + 캐시 + 런타임 재검증
│   └── uiStore.ts                 # 현재 시즌·확장된 GP·검색어·필터 상태 (URL sync)
├── derived/
│   ├── sessionStatus.ts           # classify(session, now)
│   ├── meetingStatus.ts           # GP 단위 status 집계
│   ├── nextUpcoming.ts            # Hero용 다음 세션 결정
│   └── searchFilter.ts            # 검색·필터 매칭 로직
└── data/
    └── seasons/
        ├── 2023.json
        ├── 2024.json
        ├── 2025.json
        ├── 2026.json              # 현재 시즌 (런타임 재검증 대상)
        └── 2027.json              # 미래 시즌 (알려진 일정만)

src/live/
└── CountdownOverlay.tsx           # 라이브 화면에서 세션 미시작 시 오버레이 (§5)

scripts/
└── fetch-season-catalog.ts        # 빌드 타임 시즌 JSON 생성 + 일일 CI 갱신
```

---

## 11. 인수 기준

1. **카탈로그 JSON 크기** — 한 시즌당 ≤ 100 KB (gzip ≤ 20 KB)
2. **초기 페이지 로드** — 첫 paint < 2s (3G fast 기준), 전체 시즌 그리드 렌더 < 4s
3. **상태 판정 정확성** — `classify()` 단위 테스트로 boundary 케이스(start ± 30min, end ± 30min) 모두 정확
4. **카운트다운 정확성** — 1초마다 갱신, 5분 동안 ±2초 이내 wall-clock 추적 (NTP 없이도)
5. **Hero 자동 선택** — 다음 upcoming 세션이 LIVE 진입 시 Hero가 자동으로 LIVE 모드로 전환
6. **라이브 화면 진입 시 카운트다운 오버레이** — `date_start` 도달 전 진입 시 HH:MM:SS 카운트다운 표시, 0 도달 시 라이브 화면으로 자동 전환
7. **인라인 확장** — 다른 GP 카드 클릭 시 기존 확장이 collapse 애니메이션 후 새 카드 expand. 동시 expanded는 최대 1개
8. **검색 응답성** — 입력 후 200ms 디바운스 → 매칭 결과 즉시 표시. 검색 결과 0건 시 안내 메시지
9. **필터 즉시 반영** — 체크박스 토글 시 100ms 이내 그리드 업데이트
10. **결과 미리보기 호버** — 200ms 호버 지연 후 표시, 100ms 해제 후 사라짐
11. **URL 보존** — `?season=&gp=&q=&session=&status=` 쿼리가 새로고침 후에도 정확히 복원
12. **런타임 재검증** — 현재 시즌 페이지 로드 시 ≤ 5s 이내 배경 fetch 완료, 변경된 entry 있으면 토스트 표시
13. **세션 진입 라우팅** — PAST→`/replay/...`, LIVE→`/live/...`, UPCOMING→`/live/...`+카운트다운 오버레이
14. **시즌 picker 변경** — 다른 시즌 JSON 로드 < 1s (이미 fetch된 시즌은 즉시)
15. **CI 자동 갱신** — 매일 자정 UTC + 1h에 빌드 스크립트 실행되어 JSON 갱신 PR/커밋 생성
16. **시간 시뮬레이션 가능** — 개발 모드에서 `?now=2024-03-02T15:00:00Z` 쿼리로 wall_clock 시뮬레이션 → 상태 전환 시각 점검 가능

---

## 12. 구현 단계

### 단계 1: 시즌 카탈로그 빌드 스크립트
- `scripts/fetch-season-catalog.ts`
- 2024 한 시즌으로 검증 → `seasons/2024.json` 산출
- result_preview 포함
- ✅ 인수: 1번 (크기)

### 단계 2: 상태 판정 + 카운트다운 derived
- `derived/sessionStatus.ts`, `meetingStatus.ts`, `nextUpcoming.ts`
- 단위 테스트: boundary, cancelled, qualifying multi-phase
- `Countdown.tsx`
- ✅ 인수: 3번, 4번

### 단계 3: catalogStore + UI store (URL sync)
- `stores/catalogStore.ts` (lazy load by year)
- `stores/uiStore.ts` (시즌·gp·검색·필터·URL 동기)
- ✅ 인수: 11번 (URL 보존)

### 단계 4: 메인 페이지 골격 + GP 그리드
- `MainPage.tsx`, `SeasonPicker.tsx`, `GpGrid.tsx`, `GpCard.tsx`, `StatusBadge.tsx`
- 2024 시즌으로 그리드 렌더 검증
- ✅ 인수: 2번 (로드 시간), 14번 (시즌 변경)

### 단계 5: Hero + 다음 upcoming 자동 선택
- `Hero.tsx` + `nextUpcoming` 연동
- LIVE 자동 전환
- ✅ 인수: 5번

### 단계 6: 인라인 확장 + 세션 카드
- `ExpandedSessions.tsx`, `SessionCard.tsx`
- 슬라이드 다운 애니메이션, 단일 expansion 정책
- ✅ 인수: 7번

### 단계 7: 검색 + 필터
- `SearchFilter.tsx`, `derived/searchFilter.ts`
- 디바운스 + 즉시 필터 + URL 동기
- ✅ 인수: 8번, 9번

### 단계 8: 결과 미리보기 호버
- `ResultPreviewTooltip.tsx`
- 호버 지연 + 사라짐 정책
- ✅ 인수: 10번

### 단계 9: 라이브 화면 카운트다운 오버레이
- `src/live/CountdownOverlay.tsx`
- 라이브맵·대시보드 컨테이너에서 status 분기
- ✅ 인수: 6번

### 단계 10: 런타임 재검증 + 변경 토스트
- `catalogStore`의 현재 시즌 background fetch + diff
- 변경 토스트 컴포넌트
- ✅ 인수: 12번

### 단계 11: 라우팅 (`/`, `/live/{}`, `/replay/{}`)
- 라우팅 라이브러리 선택 (§16) + 라우트 정의
- 진입 시 라이브맵·대시보드 컴포넌트로 위임
- ✅ 인수: 13번

### 단계 12: 일일 CI 갱신
- GitHub Actions (또는 다른 CI) workflow
- 매일 자정 UTC + 1h 실행
- ✅ 인수: 15번

### 단계 13: 2023/2025/2026/2027 시즌 빌드 + 시각 점검
- 모든 알려진 시즌 일괄 빌드
- ✅ 인수: 1번 전체

### 단계 14: 시간 시뮬레이션 + 시각 회귀
- 개발용 `?now=...` 쿼리 핸들러
- Playwright 시각 회귀
- ✅ 인수: 16번

---

## 13. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 사용자 기기 시계 오차 | past/live/upcoming 판정 잘못 → 잘못된 화면 진입 | 페이지 로드 시 `Date.now()` vs HTTP `Date` 헤더 비교. 5분 이상 차이면 토스트 경고. 라이브 진입 시는 OpenF1 `newest_received_date` 사용해 보정 |
| 시즌 중 일정 변경 (우천 취소) | JSON에 stale 정보 | 런타임 재검증 + 토스트 (§3.3). 다음 일일 CI 빌드로 영구 반영 |
| 미래 시즌 데이터 비어있음 (예: 2027 일정 미공개) | Hero에 표시 불가 | 빌드 스크립트가 빈 데이터를 만들지 않음 — 해당 연도 JSON 없으면 시즌 picker에서 비활성. Hero는 사용 가능한 가장 빠른 upcoming 사용 |
| OpenF1 빌드 타임 호출 실패 (네트워크/429) | JSON 일부 누락 | 스크립트가 시즌 단위로 atomic 처리. 실패 시 이전 JSON 유지 (덮어쓰기 X). CI 알림 |
| `is_cancelled` 메타가 자정 UTC에만 갱신 | 우천 취소 등 즉시 반영 안 됨 | 런타임 재검증으로 24h 내 반영. 사용자가 LIVE 윈도우에 진입했는데 데이터 없으면 "세션이 취소되었거나 지연 중입니다" 표시 |
| GP 카드 인라인 확장이 그리드 reflow로 화면 점프 | UX 혼란 | 확장된 row만 늘어나고 다른 row는 그대로 유지되도록 CSS Grid `grid-template-rows: auto auto` 명시. 스크롤 위치 보존 |
| Hero 카운트다운이 0에 도달했는데 라이브 데이터가 늦게 도착 | "라이브 시작!"이라고 했는데 빈 화면 | 라이브 화면이 "Waiting for first data..." 인디케이터 표시 (§5). `newest_received_date` 갱신 감지 시 자동 전환 |
| 일일 CI 실패 시 stale 데이터 무한정 사용 | 일정 정확성 저하 | 페이지 상단에 `generated_at` 표시 (작은 글씨). 7일 이상 stale 이면 빨간 경고 배지 |
| 검색 substring 매칭이 한글 입력자에게 약함 | 한국 사용자가 "스즈카"로 못 찾음 | MVP는 영문 substring만. 후속 fuzzy/한글 alias 추가 (§16) |
| Qualifying의 `session_result.duration`이 배열 (Q1/Q2/Q3) | result_preview 빌드 실패 | Qualifying은 Q3 (또는 최고 단계) 결과 사용 + 별도 분기 |
| 라이브 윈도우 진입 시점에 hero가 즉시 LIVE 모드로 안 바뀜 | 사용자가 놓침 | Countdown 컴포넌트의 0 도달 시 콜백으로 catalogStore status 재평가 트리거 |

---

## 14. 검증

| 단계 | 방법 | 도구 |
|---|---|---|
| 단위 | classify(), nextUpcoming(), searchFilter(), countdown formatting | Vitest |
| 통합 | 합성 시즌 데이터로 MainPage 렌더 + 검색·필터·확장 시나리오 | Vitest + JSDOM |
| 시각 회귀 | 4개 상태(past-only / live-active / upcoming-only / cancelled) 시각 스냅샷 | Playwright + 픽셀 diff |
| 시간 시뮬레이션 | `?now=...` 쿼리로 가짜 wall_clock → status 전환 검증 | Playwright |
| 라우팅 | URL 직접 입력으로 GP/세션 확장 복원, live/replay 진입 | Playwright |
| 빌드 스크립트 | 합성 응답으로 fetch-season-catalog.ts 단위 테스트 | Vitest + msw |
| CI 갱신 | dry-run workflow + JSON diff 확인 | GitHub Actions |

---

## 15. 명시적으로 스코프 밖

- 즐겨찾기/북마크 (사용자 결정으로 제외)
- 키보드 단축키 (사용자 결정으로 제외)
- 다국어 (i18n)
- 사용자 계정/로그인
- 푸시 알림 (다가오는 세션 알림)
- 챔피언십 standings (시즌 누적 순위) — 후속
- 드라이버/팀 검색 — 후속
- 자동 새로고침 (변경 토스트만, 사용자 액션 필요)
- 모바일 우선 UX (대시보드와 동일하게 desktop 우선, 모바일은 반응형 fallback)

---

## 16. 미해결 / 결정 필요 항목

1. **프레임워크** — 라이브맵/대시보드 미해결과 동기화 (React 가정)
2. **라우팅 라이브러리** — `react-router` vs `wouter` vs 자체 history API. 단순 라우트 3개라 자체 구현도 가능
3. **CI 플랫폼** — GitHub Actions vs GitLab CI vs 다른 곳. 빌드 스크립트 실행 환경
4. **시즌 picker 기본값** — 페이지 첫 진입 시 (a) 현재 연도 (b) 다음 upcoming 세션이 있는 시즌 — 두 값이 다른 경우는 12월 ~ 2월 사이 (off-season)
5. **GP 카드 썸네일** — `circuit_image` URL을 그대로 사용 vs 자체 캐싱/리사이즈. F1 CDN 변경 위험
6. **국가 플래그** — `country_flag` URL 그대로 vs emoji unicode flag vs 자체 SVG. emoji는 OS 폰트 의존도 큼
7. **시즌 카탈로그 자동 갱신 알림** — 변경 토스트 외에 별도 알림 채널 필요? (이메일/Slack 등)
8. **취소된 세션 UI** — 회색 dim + "취소됨" 표기만 vs 별도 섹션으로 분리
9. **시간 시뮬레이션 보안** — `?now=...` 쿼리는 개발 모드에만 활성? 프로덕션에서도 허용?
10. **카운트다운에서 LIVE 윈도우 vs date_start 기준** — Hero의 카운트다운이 "라이브 진입 가능 시각(start − 30min)"을 기준으로 할지 "실제 lights out(start)"을 기준으로 할지. 본 계획은 **start 기준**으로 카운트, 별도 표지로 "라이브 데이터는 30분 전부터" 안내
11. **2023 이전 데이터** — OpenF1는 2023부터. 그 이전 시즌은 정적 카탈로그로도 지원할지 (Ergast 등 별도 출처). MVP는 2023+ 만

---

## 17. 참고

- [openf1-api-reference.md](../../docs/openf1-api-reference.md) — meetings/sessions 엔드포인트, 라이브 윈도우 30min 정책, 자정 UTC 갱신
- [live-streaming-strategy.md](../../docs/live-streaming-strategy.md) — 라이브 30s 버퍼
- [replay-strategy.md](../../docs/replay-strategy.md) — 재생 60s 윈도우
- [live-map-implementation.md](./live-map-implementation.md) — 라이브 화면의 맵 컴포넌트
- [dashboard-implementation.md](./dashboard-implementation.md) — 라이브 화면의 대시보드 + DataSource 추상
