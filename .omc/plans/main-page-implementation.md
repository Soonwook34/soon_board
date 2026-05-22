# 메인 페이지 구현 계획 (pending approval)

> 작성일: 2026-05-20 · 최종 수정: 2026-05-22 · 상태: **pending approval**
> 전제: [openf1-api-reference.md](../../docs/openf1-api-reference.md), [live-streaming-strategy.md](../../docs/live-streaming-strategy.md), [replay-strategy.md](../../docs/replay-strategy.md), [live-map-implementation.md](./live-map-implementation.md), [dashboard-implementation.md](./dashboard-implementation.md), [deployment-architecture.md](../../docs/deployment-architecture.md). 본 계획은 그 두 화면(라이브 / 리플레이)의 **진입점인 메인 페이지**의 구현 전략이다.
>
> **호스팅·MVP 컨텍스트 (2026-05-22 확정):** GitHub + Vercel 정적 호스팅 + 개인 사용. 시즌 카탈로그는 **GitHub Actions 일일 cron**에서 빌드되어 main 브랜치에 commit되고, Vercel이 자동 재배포. 프레임워크 **Vite + React 18**, 라우팅 **wouter**. 시즌 커버리지는 OpenF1가 데이터를 제공하는 **2023+ 만**.

---

## 0. 한눈에 보는 사양

| 항목 | 값 |
|---|---|
| 카탈로그 신선도 (사용자 결정) | **정적 시드(빌드 타임) + 현재 시즌만 런타임 재검증** |
| 랜딩 구조 (사용자 결정) | **Upcoming/Live Hero + 시즌 그리드** |
| GP → 세션 UX (사용자 결정) | **인라인 확장 (Expand)** |
| 추가 기능 (사용자 결정) | **검색·필터** + **완료 세션 결과 미리보기** |
| 시간 정렬 기준 | 사용자 wall_clock (기기 시간). 시계 오차 위험은 §13 |
| 데이터 단위 | 연도별 1개 JSON 파일 (`seasons/{year}.json`), `fetch()` + Vercel CDN 캐시 |
| 커버리지 | **OpenF1에 데이터가 존재하는 시즌만** (2023+, 미래 시즌은 OpenF1 노출 시점에 추가) |
| API 호출 | 빌드 타임 1회/일 (GitHub Actions) + 런타임은 현재 시즌 재검증 1회/페이지 로드 |
| **타깃 디바이스 (사용자 결정)** | **Desktop only (1280px+)** — 좁은 화면은 안내만 |
| **테마 (사용자 결정)** | **다크 모드 only** (F1 방송 분위기, 단일 디자인 토큰 셋) |

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

### 1.3 그리드 결정 (Desktop only)

- **Desktop 1280px+: 4열 × 6행** (24 GP 시즌 기준) — 1차 타깃 + 1920×1080 기준 폴리시
- **1024~1280px**: 동작하지만 디자인 보장 안 함 (그리드 좁아져 일부 카드 잘림 가능)
- **< 1024px**: 단일 컬럼 fallback + 상단 안내 배너 "더 큰 화면에서 보시는 것을 권장합니다"
- Hero는 항상 전체 폭

---

## 2. 데이터 모델 (연도별 JSON)

### 2.1 파일 구조

```
public/seasons/                  ← Vercel CDN이 정적 자산으로 서빙, fetch()로 접근
├── index.json                   ← 가용 시즌 목록 (시즌 picker가 먼저 로드)
├── 2023.json
├── 2024.json
├── 2025.json
└── 2026.json                    ← 현재 시즌 (런타임 재검증 대상)
```

**미래 시즌 정책 (2026-05-22 확정):** OpenF1의 `meetings?year=Y` 응답이 비어 있는 연도는 JSON을 만들지 않는다. F1 공식 달력 발표 후 OpenF1이 meetings/sessions를 노출하면 다음 daily cron에서 자동 추가된다. 시즌 picker는 `index.json`을 보고 동적으로 옵션 구성.

**`public/` 디렉터리에 두는 이유:** Vite는 `public/`를 빌드 시 그대로 `dist/` 루트로 복사하고 hash 없는 경로로 서빙한다. `fetch('/seasons/2026.json')`로 캐시 적중 가능 (`src/main/data/`에 두면 JS 번들에 import되어 모든 시즌이 초기 로드에 포함됨).

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
- 가용 시즌(보통 3~4개) 누적 ~300 KB / gzip ~60 KB
- **초기 로드 영향**: 시즌 picker는 `index.json` (< 1KB) + 현재 시즌 JSON 1개(~80KB)만 로드. 다른 시즌은 picker 변경 시 lazy fetch (Vercel CDN 적중 시 < 100ms)

---

## 3. 빌드 + 런타임 데이터 파이프라인

### 3.1 빌드 타임 (`scripts/fetch-season-catalog.ts`)

각 연도별로:
1. `GET /v1/meetings?year={Y}` (1 req)
2. **응답이 빈 배열이면 해당 연도 skip** (미래 시즌으로 OpenF1 미노출 상태). 기존 JSON이 있으면 보존, 없으면 생성 안 함
3. 각 meeting에 대해 `GET /v1/sessions?meeting_key={K}` (~24 req)
4. PAST 세션(`date_end < now`)에 대해:
   - `GET /v1/session_result?session_key={S}&position<=3` (포디움)
   - `GET /v1/laps?session_key={S}&lap_duration>0` 중 최소값 (최고 랩)
   - `GET /v1/weather?session_key={S}&rainfall=1` 1건 이상 존재 여부 (`rainfall_any`)
5. 합쳐서 `public/seasons/{year}.json` 저장
6. **`public/seasons/index.json` 갱신**: 생성에 성공한 연도 목록 + 각 연도의 `generated_at` 메타. **Atomic 정책 (critic C3):** 모든 시즌 step 성공 시에만 entry 추가, tmp 파일 + `fs.renameSync` 로 POSIX atomic 교체, commit은 `public/seasons/` 디렉토리 단위 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md) "index.json atomic 갱신")

**총 호출 수 (한 시즌):** ~1 + 24 + 120×3 = ~385 req. 무료 30 req/min 한도로 ~13분. **GitHub Actions runner에서 실행** (브라우저/Vercel Functions X — 자세한 흐름은 [deployment-architecture.md](../../docs/deployment-architecture.md)).

**스로틀링:** 25 req/min로 호출 (29s 간격), 4 시즌 빌드 ≈ 1시간 — CI 매일 1회 실행 (충분).

### 3.2 일일 GitHub Actions 갱신

- `.github/workflows/daily-data-refresh.yml` — 매일 01:00 UTC (OpenF1 자정 갱신 + 1h) cron 트리거. 시즌 카탈로그·race distance·(일요일) 서킷 맵을 1개 commit으로 통합 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md))
- 가용 시즌(보통 3~4개) JSON + `index.json` 재생성 후 main 브랜치에 직접 commit (개인 사용이라 PR 리뷰 단계 불필요)
- Vercel이 commit을 감지해 자동 재배포 (~1분 내 반영)
- PAST 세션의 `result_preview`는 immutable이므로 **재계산 생략** (incremental — 새 PAST 진입 세션만 계산)
- 미래 시즌은 일정 변경(우천 취소 등) 반영

### 3.3 런타임 재검증 (현재 시즌만)

- 페이지 진입 시:
  1. `fetch('/seasons/index.json')` (브라우저 → Vercel CDN, ~1KB)
  2. `fetch('/seasons/{currentYear}.json')` (Vercel CDN, ~80KB) — 적중 시 < 100ms
  3. 즉시 화면 렌더
- 같은 페이지에서 백그라운드로 `GET https://api.openf1.org/v1/sessions?year=2026` 1회 호출 (~1 req, OpenF1 직접 호출, 익명)
- 응답 비교:
  - `is_cancelled`/`date_start`/`date_end`가 다른 세션 찾아내 in-memory 패치
  - 차이가 있으면 UI에 "일정이 업데이트되었습니다" 토스트 (자동 새로고침은 안 함)
- 과거 연도는 재검증 안 함 (immutable). 시즌 picker 변경 시 `fetch('/seasons/{year}.json')` 1회.
- Vercel CDN cache-control: 기본값 `public, max-age=0, must-revalidate` + `stale-while-revalidate` 1일. main 브랜치 commit 즉시 무효화 (Vercel 자동 처리).

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

**성능 주의:** 가용 시즌 × ~120 세션 = ~400~480회 `classify()` 호출. **매 RAF 호출 금지** — Hero 컴포넌트에서 `useMemo` + `now`를 1초 throttle로 받아 `nextUpcomingSession`을 재계산. `Date.now()`가 1초 단위로 변하므로 카운트다운 정확성에는 영향 없음.

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

**자동 전환 동작:**
- `liveWindowOpensInMs` 도달 시 (start − 30min) — `LiveDataSource.start()` 자동 호출, 폴 시작. 오버레이는 그대로 유지 ("Waiting for first data...")
- `LiveDataSource.getStreamState() === 'live'` (첫 sample 수신, 버퍼 ≥ 5s) 도달 시 — 오버레이 fade out, 라이브맵+대시보드 표시
- `startsInMs == 0` 도달했어도 OpenF1이 아직 데이터 미노출이면 "Waiting for first data..." 유지. visibility change/탭 백그라운드 → 포그라운드 복귀 시점에 재평가 (`document.visibilitychange` 이벤트로 status 재계산).

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

- expanded 상태는 `?gp=<meeting_key>` 쿼리로 보존 — wouter의 `useLocation` + `URLSearchParams`로 동기
- 새로고침 시 자동 복원
- LIVE/UPCOMING/PAST 세션 클릭 시 `/live/:key` 또는 `/replay/:key` 라우트로 전환 — wouter `<Link>` 또는 `setLocation()`

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

**라우팅 라이브러리:** **wouter** (2026-05-22 확정). 경로 매칭은 wouter의 `<Route>` + `useLocation`, 쿼리 파라미터(`?season=&gp=&q=&session=&status=`)는 native `URLSearchParams`로 분리 처리. 세션 진입(`/live/:key`, `/replay/:key`)은 wouter의 `<Link>` 또는 `setLocation()`. `vercel.json`의 SPA fallback이 모든 경로를 `/index.html`로 rewrite하므로 새로고침해도 wouter가 그대로 처리.

---

## 10. 모듈 구조

```
index.html                         # Vite entry
src/
├── main.tsx                       # ReactDOM root + wouter Router 부착
├── App.tsx                        # wouter <Route> 3개: / · /live/:key · /replay/:key
├── style/
│   ├── tokens.ts                  # 다크 모드 디자인 토큰 (색·여백·타이포)
│   └── global.css                 # CSS reset + body 다크 배경
├── shared/
│   ├── DataSource.ts              # SSOT (live-map §3.1, critic M1)
│   ├── openf1Types.ts             # OpenF1 타입
│   └── Footer.tsx                 # 단일 attribution + 라이선스 + F1 디스클레이머 + generated_at (critic M8)
├── main/
│   ├── index.ts
│   ├── MainPage.tsx               # 최상위 컨테이너
│   ├── Hero.tsx                   # 다음 upcoming/live 세션 hero + 큰 카운트다운
│   ├── SeasonPicker.tsx           # 시즌 dropdown (index.json 기반 동적 옵션)
│   ├── GpGrid.tsx                 # CSS Grid 컨테이너 + reflow 관리
│   ├── GpCard.tsx                 # 개별 GP 카드 (썸네일·국가플래그·상태배지)
│   ├── ExpandedSessions.tsx       # GP 확장 시 표시되는 세션 패널
│   ├── SessionCard.tsx            # 인라인 확장 안의 작은 세션 카드
│   ├── StatusBadge.tsx            # PAST / LIVE / UPCOMING / CANCELLED 배지
│   ├── Countdown.tsx              # 1초 갱신 카운트다운 (Hero + UPCOMING 카드)
│   ├── SearchFilter.tsx           # 상단 검색바 + 필터
│   ├── ResultPreviewTooltip.tsx   # PAST 세션 호버 미리보기
│   ├── NarrowScreenBanner.tsx     # <1024px 안내 배너 (§1.3)
│   ├── stores/
│   │   ├── catalogStore.ts        # `fetch('/seasons/{year}.json')` + 인메모리 캐시 + 런타임 재검증
│   │   └── uiStore.ts             # 현재 시즌·확장된 GP·검색어·필터 상태 (wouter useLocation + URLSearchParams 동기)
│   └── derived/
│       ├── sessionStatus.ts       # classify(session, now)
│       ├── meetingStatus.ts       # GP 단위 status 집계
│       ├── nextUpcoming.ts        # Hero용 다음 세션 결정 (useMemo + 1s throttle)
│       └── searchFilter.ts        # 검색·필터 매칭 로직
└── live/
    └── CountdownOverlay.tsx       # 라이브 화면에서 세션 미시작 시 오버레이 (§5)

public/                            # Vite가 빌드 시 dist/ 루트로 그대로 복사 (해시 없는 정적 자산)
├── seasons/                       # 본 plan 범위
│   ├── index.json                 # 가용 시즌 목록 + generated_at
│   ├── 2023.json
│   ├── 2024.json
│   ├── 2025.json
│   └── 2026.json                  # 현재 시즌 (런타임 재검증 대상)
├── trackOutlines/                 # live-map-implementation.md §1.3 (참고만, 본 plan 범위 밖)
└── raceDistance.json              # dashboard-implementation.md §2.2 (참고만, 본 plan 범위 밖)

scripts/
└── fetch-season-catalog.ts        # GitHub Actions `daily-data-refresh.yml` step 1에서 실행
                                   # 같은 workflow의 step 2/3은 race-distance·circuit-maps 스크립트
                                   # ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md))
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
15. **GitHub Actions 자동 갱신** — 매일 01:00 UTC에 통합 `.github/workflows/daily-data-refresh.yml`이 실행되어 시즌 JSON + raceDistance + (일요일) trackOutlines 갱신 commit, Vercel 자동 재배포 (~1분 내 production 반영)
16. **시간 시뮬레이션 가능** — 개발 모드에서 `?now=2024-03-02T15:00:00Z` 쿼리로 wall_clock 시뮬레이션 → 상태 전환 시각 점검 가능
17. **`?now=...` production 차단 (critic M6 + P0-3)** — production 환경에서 `?now=` 쿼리는 무시됨. 분기는 **`import.meta.env.DEV || import.meta.env.VITE_VERCEL_ENV === 'preview'`** 일 때만 활성. `import.meta.env.PROD` 만 쓰면 Vite는 preview 빌드도 PROD=true로 잡아 분기가 깨짐. `VITE_VERCEL_ENV`는 **단계 0-b1의 `vite.config.ts` `define` 으로 명시 주입** (vercel.json env 자동 전개 미보장). 단위 테스트로 회귀 방지 + **preview 배포 브라우저 console에서 `import.meta.env.VITE_VERCEL_ENV === 'preview'` 실측, production 배포에서 `=== 'production'` 실측. 빈 문자열이면 단계 0-b1 회귀.** + production 실제 배포에서 `?now=2024-01-01` 무시 확인
18. **CDN 캐시 적중** — 같은 시즌 JSON 재방문 시 두 번째 fetch는 Vercel CDN 적중으로 응답 < 100ms + `Cache-Control` 헤더에 `stale-while-revalidate` 포함 (Network 패널 수동 확인)
19. **다크 모드 일관성** — 모든 패널·카드·텍스트가 단일 디자인 토큰 셋(`src/style/tokens.ts`)을 통해서만 색상 사용 (코드 리뷰 + ESLint 옵션). 다크 배경 위 텍스트 콘트라스트 WCAG AA 충족 (자동 도구 확인)
20. **Desktop 전용 동작** — 1280px+ 그리드 4×6 렌더 검증 + <1024px에서 `NarrowScreenBanner` 표시 (Playwright viewport 테스트)

---

## 12. 구현 단계

### 단계 0: 프로젝트 부트스트랩 + 디자인 토큰

> **선행 정리 (critic C1):** 현재 리포의 `.github/workflows/ci.yml`은 이전 스택(Astro/pnpm/monorepo) 기준이라 **즉시 교체**해야 본 plan과 호환된다. `package.json` 자체도 부재해 npm 명령 실행 불가 (chicken-and-egg). 단계 0 첫 액션이 그 두 가지 base를 만드는 것.
>
> **[Cross-plan 책임, critic P0-2]** 본 단계 0의 모든 액션(0-a~0-i, 0-b1 포함)은 **main-page 작업자가 단독 수행**한다. dashboard·live-map 작업자는 단계 0 완료 인수(아래 ✅ 신규 인수)가 충족된 commit을 base로 자신의 단계 1(live-map은 단계 0.5 → 1)에 진입한다. 단계 0를 두 곳에서 동시에 실행하면 destructive ci.yml 교체가 race를 일으킨다.

- **0-a.** 기존 `.github/workflows/ci.yml` 삭제. `package.json`이 없으면 신규 생성 (Vite create로 자동 생성됨)
- **0-b.** Vite + React 18 + TypeScript strict 초기 셋업 (`npm create vite@latest`) — 결과적으로 `package.json`·`package-lock.json`·`index.html`·`src/main.tsx`·`src/App.tsx`·`vite.config.ts`·`tsconfig.json` 생성
- **0-b1. (critic P0-3)** `vite.config.ts`의 `define`으로 `import.meta.env.VITE_VERCEL_ENV`를 빌드 셸의 `process.env.VERCEL_ENV`로 **명시 주입**. Vercel `vercel.json env` 매핑은 Pages Functions 환경변수용이고 Vite의 `import.meta.env` 인라인은 별도 단계가 필요해 두지 않으면 preview 빌드와 production 빌드 모두 빈 문자열로 인라인되어 인수 17이 항상 fail-open/fail-closed 가 된다.
  ```ts
  // vite.config.ts
  export default defineConfig({
    define: {
      'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
    },
  });
  ```
- **0-c.** `package.json` scripts 정의: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `fetch:catalog`, `fetch:race-distance`, `fetch:maps`, `refresh-data` ([deployment-architecture.md §7](../../docs/deployment-architecture.md))
- **0-d.** `.github/workflows/ci.yml` 신규 작성 — [deployment-architecture.md §3.2](../../docs/deployment-architecture.md) 정의 그대로 (`npm ci` + lint·typecheck·test·build)
- **0-e.** wouter 설치, `src/App.tsx` (빈 라우트 3개), `src/main.tsx` (ReactDOM root)
- **0-f.** `src/style/tokens.ts` — 다크 모드 디자인 토큰 (배경/표면/텍스트 3단계, 팀 컬러는 raw hex 유지, 강조색, 여백·타이포 스케일)
- **0-g.** `src/style/global.css` — CSS reset + body 다크 배경
- **0-h.** `vercel.json` — SPA fallback ([deployment-architecture.md §4.1](../../docs/deployment-architecture.md))
- **0-i.** `index.html` — viewport meta + title + `<NarrowScreenBanner />` 안내 자리
- ✅ 인수: 19번 (다크 모드 일관성), 20번 (Desktop 전용)
- ✅ 신규 인수 (단계 0 완료 게이트): 새 `ci.yml`이 main에서 녹색 통과, `npm run build` 성공, `vercel.json` SPA fallback이 preview 배포에서 동작, **preview 배포에서 `import.meta.env.VITE_VERCEL_ENV === 'preview'` 실측** (critic P0-3)

### 단계 1: 시즌 카탈로그 빌드 스크립트
- `scripts/fetch-season-catalog.ts`
- 2024 한 시즌으로 검증 → `public/seasons/2024.json` 산출
- result_preview 포함
- `public/seasons/index.json` 생성
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
- wouter Router 부착(`src/main.tsx`) + 라우트 3개 정의(`src/App.tsx`)
- 진입 시 라이브맵·대시보드 컴포넌트로 위임
- 쿼리(`?season=&gp=&q=&session=&status=`)는 `URLSearchParams`로 직접 처리
- `vercel.json` SPA fallback (`rewrites` 규칙) 빌드 산출물에 포함
- **(critic P0-4) `/live/:key`·`/replay/:key` 진입 시 OpenF1 CORS ping 선행** — `GET /v1/sessions?session_key=latest&limit=1` 1회 호출 (`fetch` mode: 'cors'). 실패 시 `src/live/CorsFailedNotice.tsx` 표시 + 라이브맵·대시보드 마운트 보류 + LiveDataSource·ReplayDataSource `.start()` 호출 금지. 성공 시 hydration 진입.
- `src/live/CorsFailedNotice.tsx` — "OpenF1 API에 접근할 수 없습니다. 잠시 후 다시 시도하거나 OpenF1 서비스 상태를 확인하세요." + 재시도 버튼 (CORS ping 재호출)
- ✅ 인수: 13번
- ✅ **신규 인수 (critic P0-4)**: msw로 OpenF1 OPTIONS 404 시뮬레이션 시 `/live/:key` 진입이 `CorsFailedNotice`만 렌더링하고 라이브맵·대시보드 컴포넌트가 마운트되지 않음 (Playwright 또는 Vitest+JSDOM)

### 단계 12: 일일 GitHub Actions 갱신
- `.github/workflows/daily-data-refresh.yml` 작성 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md)) — Node.js runner + `npm ci` + 시즌 카탈로그·race distance·(일요일 step) 서킷 맵을 순차 실행 후 1개 commit
- 매일 01:00 UTC cron 트리거
- 실패 시 GitHub Actions 알림 (별도 채널 없음, 개인 사용)
- Vercel은 main 브랜치 push 감지 시 자동 재배포 (별도 설정 불필요)
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
| 사용자 기기 시계 오차 (critic M5) | past/live/upcoming 판정 잘못 → 잘못된 화면 진입 | **2계층 보정 정책**: (1) 메인 페이지 진입 시 `fetch('/seasons/index.json')` 응답 헤더의 `Date` 와 `Date.now()` 비교 — Vercel edge time 기준이라 NTP 보장 X, 5분 단위 정확도. 5분 이상 차이면 토스트 경고 + 사용자에게 시스템 시간 확인 안내. (2) **라이브/리플레이 진입 후의 critical 시각 결정(데이터 정렬·display_time)은 모두 OpenF1 `newest_received_date`** 만 사용 — HTTP Date 헤더는 안내용으로만, 의사결정에 사용 금지. |
| 시즌 중 일정 변경 (우천 취소) | JSON에 stale 정보 | 런타임 재검증 + 토스트 (§3.3). 다음 일일 CI 빌드로 영구 반영 |
| 미래 시즌 데이터 비어있음 (예: 2027 일정 미공개) | Hero에 표시 불가 | 빌드 스크립트가 빈 데이터를 만들지 않음 — 해당 연도 JSON 없으면 시즌 picker에서 비활성. Hero는 사용 가능한 가장 빠른 upcoming 사용 |
| OpenF1 빌드 타임 호출 실패 (네트워크/429) | JSON 일부 누락 | 스크립트가 시즌 단위로 atomic 처리. 실패 시 이전 JSON 유지 (덮어쓰기 X). CI 알림 |
| OpenF1 429 / 5xx 연속 / abuse 차단 (critic C2) | 다일 동안 시즌 카탈로그 stale | `scripts/_lib/openf1Client.ts` 공통 wrapper에 token-bucket(25 req/min) + exponential backoff + jitter + max 5 retry + 5xx > 50% 시 workflow abort. `Retry-After` 헤더 우선 ([deployment-architecture.md §3.1](../../docs/deployment-architecture.md)) |
| `is_cancelled` 메타가 자정 UTC에만 갱신 | 우천 취소 등 즉시 반영 안 됨 | 런타임 재검증으로 24h 내 반영. 사용자가 LIVE 윈도우에 진입했는데 데이터 없으면 "세션이 취소되었거나 지연 중입니다" 표시 |
| GP 카드 인라인 확장이 그리드 reflow로 화면 점프 | UX 혼란 | 확장된 row만 늘어나고 다른 row는 그대로 유지되도록 CSS Grid `grid-template-rows: auto auto` 명시. 스크롤 위치 보존 |
| Hero 카운트다운이 0에 도달했는데 라이브 데이터가 늦게 도착 | "라이브 시작!"이라고 했는데 빈 화면 | 라이브 화면이 "Waiting for first data..." 인디케이터 표시 (§5). `newest_received_date` 갱신 감지 시 자동 전환 |
| 일일 CI 실패 시 stale 데이터 무한정 사용 | 일정 정확성 저하 | 페이지 상단에 `generated_at` 표시 (작은 글씨). 7일 이상 stale 이면 빨간 경고 배지 |
| 검색 substring 매칭이 한글 입력자에게 약함 | 한국 사용자가 "스즈카"로 못 찾음 | MVP는 영문 substring만. 후속 fuzzy/한글 alias 추가 (§16) |
| Qualifying의 `session_result.duration`이 배열 (Q1/Q2/Q3) | result_preview 빌드 실패 | Qualifying은 Q3 (또는 최고 단계) 결과 사용 + 별도 분기 |
| 라이브 윈도우 진입 시점에 hero가 즉시 LIVE 모드로 안 바뀜 | 사용자가 놓침 | Countdown 컴포넌트의 0 도달 시 콜백으로 catalogStore status 재평가 트리거 |
| Vercel CDN이 main 브랜치 commit 직후에도 stale JSON 서빙 | 새로 갱신된 시즌 데이터가 ~1분 지연 반영 | Vercel은 production 배포 완료 시점에 edge 캐시 자동 무효화. 그래도 stale-while-revalidate 정책이라 사용자는 stale을 보고 백그라운드 갱신. 명시적 강제 갱신 필요 시 ?v={timestamp} 쿼리 추가 (운영 절차) |
| 사용자가 백그라운드 탭에 있을 때 카운트다운이 0에 도달 | Hero가 LIVE 모드로 안 바뀜 | `setInterval` 1Hz는 백그라운드 탭에서도 동작(throttle만 됨). 추가로 `document.visibilitychange` 이벤트로 포그라운드 복귀 시 status 즉시 재평가 |
| `?now=...` 시뮬레이션 쿼리가 production에 누설 | 사용자가 가짜 시간으로 잘못된 화면 봄 | `import.meta.env.PROD`에서 무시. 단위 테스트로 회귀 방지 (인수 17) |
| 다크 모드 디자인 토큰 분산 (각 컴포넌트가 자체 색상 정의) | 색 일관성 깨짐 | `src/style/tokens.ts` 단일 정의 + CSS variables(`:root { --bg-primary: ... }`) + 코드 리뷰에서 raw hex 금지 |
| **OpenF1 CORS 정책 변경 (critic P0-4)** | 브라우저에서 즉시 동작 불가 (preflight fail) — 라이브/리플레이 진입 전체 차단 | 라이브/리플레이 라우트 진입 시 OpenF1 ping endpoint (예: `GET /v1/sessions?session_key=latest&limit=1`) 1회 호출로 CORS 헬스 체크. 실패 시 `src/live/CorsFailedNotice.tsx` 표시 + 라이브맵·대시보드 마운트 보류 + 정상 폴링 시작 금지. mitigation 트리거 = 백엔드 프록시 도입 검토 ([§16](#16-미해결--결정-필요-항목), [deployment-architecture.md §8](../../docs/deployment-architecture.md)) |

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
| **CDN 캐시 적중** | 빌드 산출물(`dist/seasons/*.json`)에 대한 두 번째 요청 응답 시간 측정 | Vercel deployment preview Network 패널 (수동) |
| **다크 모드 콘트라스트** | 토큰 색 조합이 WCAG AA 충족 (4.5:1 텍스트, 3:1 아이콘) | `@axe-core/playwright` 또는 수동 |
| **e2e (옵션)** | GitHub Actions가 실 OpenF1 호출 → 산출 JSON으로 Playwright 시각 회귀 | GitHub Actions + Playwright |

---

## 15. 명시적으로 스코프 밖

- 즐겨찾기/북마크 (사용자 결정으로 제외)
- 키보드 단축키 (사용자 결정으로 제외)
- 다국어 (i18n) — 한국어/영어 혼용 그대로
- 사용자 계정/로그인 — 개인 사용이라 영구 제외
- 푸시 알림 (다가오는 세션 알림)
- 챔피언십 standings (시즌 누적 순위) — 후속
- 드라이버/팀 검색 — 후속
- 자동 새로고침 (변경 토스트만, 사용자 액션 필요)
- **모바일·태블릿 우선 UX (Desktop only 확정, 1024 미만은 안내만 — §1.3)**
- **라이트 모드 / 테마 토글 (다크 모드 only 확정 — §0)**
- **다중 사용자 / SNS 공유 / 임베드** — 외부 공개 시 [deployment-architecture.md §8](../../docs/deployment-architecture.md) 백엔드 도입 트리거 발동

---

## 16. 미해결 / 결정 필요 항목

(2026-05-22 확정 — 사용자 결정)
- **프레임워크:** Vite + React 18
- **라우팅 라이브러리:** wouter (~1.5KB, SPA용)
- **CI 플랫폼:** GitHub Actions (Vercel은 정적 호스팅만, 빌드 작업은 Actions에서)
- **시즌 커버리지:** 2023+ (OpenF1 지원 범위와 일치). 미래 시즌은 OpenF1 노출 시점에 자동 추가
- **시간 시뮬레이션 보안:** `?now=...`는 **`import.meta.env.DEV || import.meta.env.VITE_VERCEL_ENV === 'preview'`** 조건일 때만 활성. production 비활성. `VITE_VERCEL_ENV`는 `vercel.json` env 매핑 (`$VERCEL_ENV` 노출) 필요 — 단계 0-h에 포함
- **타깃 디바이스:** Desktop only (1280px+), <1024는 안내 배너
- **테마:** 다크 모드 only — 단일 디자인 토큰 셋(`src/style/tokens.ts`)
- **시즌 JSON 로드:** `fetch('/seasons/{year}.json')` + Vercel CDN. `public/seasons/` 정적 자산
- **미래 시즌 처리:** OpenF1 `meetings?year=Y` 응답이 빈 배열이면 JSON 미생성

남은 미해결:
1. **시즌 picker 기본값** — 페이지 첫 진입 시 (a) 현재 연도 (b) 다음 upcoming 세션이 있는 시즌. 12월~2월 (off-season)에 차이.
2. **GP 카드 썸네일** — `circuit_image` URL을 그대로 사용 vs 자체 캐싱/리사이즈. F1 CDN 변경 위험 (openf1-api-reference §11-12 Madring/Catalunya 깨짐 사례).
3. **국가 플래그** — `country_flag` URL 그대로 vs emoji unicode flag vs 자체 SVG. emoji는 OS 폰트 의존도 큼.
4. **취소된 세션 UI** — 회색 dim + "취소됨" 표기만 vs 별도 섹션으로 분리.
5. **카운트다운 기준** — "라이브 진입 가능 시각(start − 30min)" vs "실제 lights out(start)". 본 계획은 **start 기준**, 별도 표지로 "라이브 데이터는 30분 전부터" 안내.
6. **`raceDistance.json` 자동 fetch 채널** — 대시보드 §13-2와 통합. GitHub Actions에서 FastF1로 자동 fetch할지 수동 큐레이션할지.
7. **스타일링 방법** — 다크 모드 토큰을 (a) CSS variables 직접 (b) Tailwind config `theme.extend` (c) styled-components 중 어느 방식으로 표현할지. 대시보드 §13-1과 통합.

---

## 17. 참고

- [openf1-api-reference.md](../../docs/openf1-api-reference.md) — meetings/sessions 엔드포인트, 라이브 윈도우 30min 정책, 자정 UTC 갱신
- [live-streaming-strategy.md](../../docs/live-streaming-strategy.md) — 라이브 30s 버퍼
- [replay-strategy.md](../../docs/replay-strategy.md) — 재생 60s 윈도우
- [deployment-architecture.md](../../docs/deployment-architecture.md) — Vercel + GitHub Actions + `vercel.json` SPA fallback
- [live-map-implementation.md](./live-map-implementation.md) — 라이브 화면의 맵 컴포넌트
- [dashboard-implementation.md](./dashboard-implementation.md) — 라이브 화면의 대시보드 + DataSource 추상
