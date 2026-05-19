# Deep Interview Spec: SOON Board — F1 Live Timing 대시보드

> **상태:** `pending approval` — 실행 전 사용자 명시 승인 필요
> **다음 단계:** Execution Bridge 선택 (omc-plan consensus 권장 / autopilot / ralph / team / refine further)

---

## Metadata

| 항목 | 값 |
|---|---|
| Interview ID | `di-soon-board-2026-05-19` |
| Rounds | 5 (Round 0 topology + Rounds 1–5 questions) |
| Final Ambiguity Score | **10.1%** |
| Type | greenfield |
| Generated | 2026-05-19 |
| Threshold | 0.20 |
| Initial Context Summarized | no (briefing was reasonable size) |
| Status | **PASSED** (≤ threshold) |
| Research file | `.omc/state/research-openf1-svg.md` |

---

## Clarity Breakdown

| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.92 | 0.40 | 0.368 |
| Constraint Clarity | 0.92 | 0.30 | 0.276 |
| Success Criteria | 0.85 | 0.30 | 0.255 |
| **Total Clarity** | | | **0.899** |
| **Ambiguity** | | | **0.101** |

---

## Topology

Round 0에서 5개 컴포넌트로 잠금. 전부 active, deferral 없음.

| # | Component | Status | Description | Coverage Note |
|---|-----------|--------|-------------|---------------|
| 1 | **Data Layer (OpenF1)** | active | OpenF1 REST 클라이언트, 폴링 스케줄러, 토큰버킷 rate limiter, 인메모리 store, 타입 정의 | AC §1, §2 커버 |
| 2 | **Live Leaderboard** | active | 순위·랩타임·갭·인터벌·타이어·핏스탑 표시 + 랩타임 미니 스파크라인 | AC §3 커버 |
| 3 | **Circuit Map & Marker Tracking** | active | 서킷 SVG + 텔레메트리 좌표 매핑 + rAF imperative 마커 보간 (**주인공**) | AC §4, §5 커버 |
| 4 | **Historical Playback (Time Travel)** | active | 2024–2026 캘린더, 세션 선택, 글로벌 타이머, 1x/2x/5x 배속 — Live는 `anchor=now, speed=1x` 특수 케이스 | AC §6 커버 |
| 5 | **App Shell / Branding / Layout** | active | 다크 모드, "SOON Board" 워드마크('ON' 강조), FHD + iPad 반응형 그리드 | AC §7 커버 |

---

## Goal

F1 중계를 시청하는 동안 **서브 모니터(FHD)나 태블릿(iPad)**에서 동시에 펼쳐 보는 클라이언트-사이드 SPA. **공식 중계가 못 보여 주는 '전체 필드 조감'을 핵심 부가가치**로 삼아, 20명의 드라이버 위치를 서킷 SVG 위에 동시에 부드럽게 보여 주고, 실시간(`anchor=now, speed=1x`)과 과거 세션 재생(`speed ∈ {1, 2, 5}`)을 **단일 글로벌 타이머**로 통합 처리한다. OpenF1 무료 플랜만 사용하며 GitHub Pages로 100% 정적 호스팅한다.

---

## Constraints

1. **Hosting:** GitHub Pages — 100% client-side, 백엔드/서버리스 없음.
2. **Stack:** React (Vite) + Tailwind CSS + **Zustand**(상태) + **TypeScript**(권장).
3. **Data Source:** OpenF1 v1 (무료 플랜).
   - **실시간 OAuth2 스트림은 사용 불가**(클라이언트에 secret 임베드 불가).
   - 모든 데이터는 historical 엔드포인트를 통해 ~3초 지연 폴링.
   - Rate limit: **3 req/s, 30 req/min** (token bucket 강제).
4. **CORS:** `api.openf1.org`는 `Access-Control-Allow-Origin: *`로 동작하는 것으로 강하게 추정되지만, 빌드 시 `curl -I`로 검증. 만약 향후 변경 시 fallback은 Cloudflare Worker 프록시.
5. **타겟 디바이스:** FHD 데스크톱(1920×1080) **AND** iPad(태블릿 가로/세로) — 두 브레이크포인트 모두 1등급 지원, 반응형 그리드.
6. **SVG 라이선스:** `bacinger/f1-circuits` (MIT) GeoJSON을 빌드 타임에 SVG `<path>`로 변환. `julesr0y/f1-circuits-svg`는 라이선스 불명으로 채택 거부.
7. **언어:** 한국어 UI 우선, 컴포넌트 식별자/코드는 영문.
8. **브랜딩:** 워드마크 "SO**ON** Board" — 'ON'을 F1 레이싱 레드 또는 네온으로 강조('실시간 온보드' 함의).
9. **테마:** 다크 모드 only(중계와 시각적 이질감 최소화).

---

## Non-Goals (v1)

- ❌ OpenF1 유료/스폰서 플랜 의존
- ❌ OAuth2 기반 진짜 실시간 스트림
- ❌ 모바일 폰(<768px) 레이아웃 — iPad가 최소 폼팩터
- ❌ 사용자 계정·즐겨찾기·서버 저장
- ❌ Native 앱 빌드
- ❌ 음성/사운드(엔진음, TR) — 2026 시즌 OpenF1에서 team radio 거의 부재
- ❌ 3D 트랙(고도 z 사용)
- ❌ 차내 카메라 / 영상 통합
- ❌ 라이트 모드
- ❌ 일반 텔레메트리 분석 도구(엔지니어용) — 우리는 *시청 동반* 도구

---

## Acceptance Criteria

### §1 OpenF1 데이터 페치
- [ ] AC1.1 `api.openf1.org/v1/*` 호출이 GitHub Pages 도메인에서 CORS 우회 없이 성공한다 (빌드 시 `curl -I` 검증 스크립트 포함).
- [ ] AC1.2 토큰버킷 rate limiter가 3 req/s, 30 req/min 한도를 절대 초과하지 않는다 (테스트: 동시 50개 요청 큐잉 → 모든 호출 성공, 429 0회).
- [ ] AC1.3 HTTP 429 응답 시 지수 백오프 시작 2s, 최대 30s, 최대 5회 재시도.
- [ ] AC1.4 모든 폴링 데이터 P95 신선도 ≤ **4초** (서버 발행 → UI 반영).

### §2 폴링 스케줄
- [ ] AC2.1 활성 세션 동안 총 요청량 ≤ **26 req/min** (4 req/min headroom).
- [ ] AC2.2 location 폴링 주기 6s, intervals 6s, laps 30s, stints/pit 60s, weather 60s, race_control 10s, position 10s.
- [ ] AC2.3 `location` 호출은 단일 요청으로 전 드라이버 데이터 수신(driver_number 필터 없이 session_key + date window).

### §3 Live Leaderboard
- [ ] AC3.1 20명 드라이버 행이 현재 race position 오름차순으로 정렬·표시.
- [ ] AC3.2 각 행은: 순위, 드라이버 헬멧 컬러 + 약자, 팀, 최근 랩타임, Interval(앞차), Gap(리더), 현재 타이어 컴파운드 + 수명(랩 수), 핏스탑 횟수.
- [ ] AC3.3 각 행에 최근 10랩의 랩타임 미니 스파크라인.
- [ ] AC3.4 정렬·필터·하이라이트 변경이 60fps에서 렉 없음(measured via React Profiler).

### §4 Circuit Map (주인공)
- [ ] AC4.1 빌드 타임에 `bacinger/f1-circuits` GeoJSON → SVG `<path>` 변환 (서킷별 정적 자산).
- [ ] AC4.2 세션 진입 시 driver 1, 첫 클린 랩의 `location` 샘플(~333 row)을 자동 페치하여 affine 변환 행렬을 캘리브레이션.
- [ ] AC4.3 20개 드라이버 마커가 동시에 표시되며, 각 마커는 헬멧 컬러 + 번호 라벨을 가진다.
- [ ] AC4.4 마커 보간은 **rAF 기반 60Hz imperative SVG attribute(`transform`) 업데이트** — React 리렌더 우회.
- [ ] AC4.5 dropped frame 비율이 5초 윈도우에서 10% 이상이면 자동으로 30Hz 폴백.
- [ ] AC4.6 좌표 매핑은 Y-축 플립 + 5% 패딩 + 균일 종횡비.

### §5 좌표 매핑 정확도
- [ ] AC5.1 캘리브레이션 후 텔레메트리 폴리라인이 SVG 트랙 path 안쪽 ±5% 이내에 위치.
- [ ] AC5.2 캘리브레이션 fit 실패 시 텔레메트리 폴리라인을 **자체 outline**으로 fallback 렌더링 (외부 의존성 zero 시나리오).

### §6 Historical Playback
- [ ] AC6.1 2024 / 2025 / 2026 캘린더 그랑프리 목록 표시(OpenF1 `meetings`).
- [ ] AC6.2 그랑프리 선택 시 세션(P1/P2/P3/Sprint/Quali/Race) 선택 UI.
- [ ] AC6.3 1x / 2x / 5x 배속 토글 — 글로벌 타이머의 `playbackRate`만 변경, 모든 컴포넌트가 자동 동기화.
- [ ] AC6.4 타임라인 스크러버로 임의 시점 점프 시 500ms 이내 모든 시각화 일관 정렬.
- [ ] AC6.5 Live 모드 = `anchor=now, playbackRate=1x` 특수 케이스로 동일 코드 경로.

### §7 UI/UX·브랜딩·반응형
- [ ] AC7.1 헤더에 "SO**ON** Board" 워드마크, 'ON'에 racing red(`#E10600`) 또는 네온 그린(`#00FF94`) 적용.
- [ ] AC7.2 FHD(≥1440px): 좌측 Map(60% 폭), 우측 Leaderboard + 상세 패널.
- [ ] AC7.3 iPad 가로(1024×768): 상단 Map(50% 높이), 하단 Leaderboard 스크롤.
- [ ] AC7.4 iPad 세로(768×1024): Map 풀폭(50% 높이) → Leaderboard 풀폭(50% 높이).
- [ ] AC7.5 모든 인터랙티브 요소 키 타겟 ≥ 44×44px (iPad 터치).
- [ ] AC7.6 Lighthouse Performance ≥ 80, Accessibility ≥ 90.

---

## Assumptions Exposed & Resolved

| 어쩌면 사용자가 명시 안 한 가정 | 도전 라운드 | 결과 |
|---|---|---|
| "Live" = WebSocket 등 진짜 실시간 스트림 | R1 | ❌ 무료 플랜 OAuth2 + secret 임베드 불가 → "Live = `anchor=now, speed=1x`인 Playback 특수 케이스" |
| 폴링 주기는 자유롭게 잡으면 됨 | R1 + 리서치 | ❌ 30 req/min 하드 캡 → 토큰버킷 + 계층화 스케줄 |
| FHD 우선, iPad는 부차 | R2 | ❌ 두 디바이스 모두 1등급, 반응형 그리드 |
| 60Hz 마커 = 그냥 React 리렌더 | R3 | ❌ 20대 × 60Hz React 리렌더는 병목 → Zustand store + useRef + rAF imperative `transform` 업데이트 |
| 상태 라이브러리는 RTK 등 무거운 게 안전 | R3 | ❌ 60Hz 워크로드엔 부적합 → **Zustand** + selector 격리 |
| SOON Board는 중계 그래픽 보강이면 충분 | R4 (Contrarian) | ❌ '전체 필드 조감'이 차별점 → **Map이 주인공**, Leaderboard는 조연 |
| `julesr0y` SVG는 라이선스 없어도 GitHub Pages에서 OK | R5 | ❌ 라이선스 안전 → **bacinger MIT** GeoJSON 채택 |
| "Smooth"는 주관적 표현 | R5 | ❌ 60Hz 시도 → dropped frame >10% 시 30Hz 폴백 + P95 신선도 ≤ 4초 |

---

## Technical Context (연구 핵심 인용)

### OpenF1 API 요약 (출처: `.omc/state/research-openf1-svg.md`)
- **CORS:** 강한 추정으로 `*` (검증 후 진행).
- **Auth:** 무료 플랜에서 historical 데이터 전부 anonymous. 실시간 OAuth2는 클라이언트 측 비현실적.
- **Rate Limit:** **3 req/s, 30 req/min**.
- **Latency:** OpenF1 자체는 라이브 대비 ~3초 지연 (TV 30–60초보다 빠름).
- **핵심 엔드포인트:** `meetings`, `sessions`, `drivers`, `intervals`, `laps`, `pit`, `stints`, `location`, `position`, `car_data`, `weather`, `race_control`.
- **`location`:** ~3.7 Hz, X/Y/Z 로컬 좌표(미터 아님, 임의 단위), origin은 circuit별로 임의. 횡 배치(lateral)는 부정확 — centerline 용도로만 사용.
- **데이터 가용성:** 2023/2024/2025 풀, 2026 race-by-race 누적 (TR은 거의 없음).
- **페이지네이션:** 없음. `session_key` + `date>=` / `date<=` 윈도우로 청크 분할.

### SVG 출처 결정
- **채택:** `bacinger/f1-circuits` (MIT, 43개 서킷, 2026 Madrid 포함, GeoJSON LineString) → 빌드 시 SVG path 변환.
- **거부:** `julesr0y/f1-circuits-svg` (라이선스 불명, 78개), `f1laps/f1-track-vectors` (아카이브).
- **이중 안전망:** 외부 SVG 못 쓰는 상황에서도 OpenF1 `location` 1랩(~333 row)으로 자체 outline polyline 생성 가능.

### 좌표 매핑 공식
```
svg_x = (X_tel - X_min) / (X_max - X_min) * (W - 2·pad) + pad
svg_y = (Y_max - Y_tel) / (Y_max - Y_min) * (H - 2·pad) + pad   // Y-flip
pad   = 0.05 · max(W, H)
scale = min(W / (X_max - X_min), H / (Y_max - Y_min))           // 균일 스케일
```

---

## 상세 구현 계획서 (사용자가 명시적으로 요청한 산출물)

### A. OpenF1 데이터 분석 & 클라이언트 아키텍처

#### A.1 모듈 구조

```
src/
  api/
    client.ts            // fetch wrapper + queue + token-bucket
    rateLimiter.ts       // 3 req/s, 30 req/min token bucket
    endpoints.ts         // typed endpoint functions
    types.ts             // OpenF1 응답 타입 (Driver, Lap, Stint, Position, …)
  store/
    timelineStore.ts     // Zustand: globalTime, playbackRate, anchor
    sessionStore.ts      // Zustand: meeting, session, drivers, calibration
    telemetryStore.ts    // Zustand: per-driver buffers (Map<driverNumber, …>)
    leaderboardStore.ts  // Zustand: derived position/interval/lap state
  scheduler/
    poller.ts            // tier별 setInterval orchestrator
    interpolator.ts      // 보간 함수 (linear / catmull-rom)
  components/
    Map/                 // SVG canvas + Markers (imperative)
    Leaderboard/         // table + sparkline
    Playback/            // calendar + scrubber + speed toggle
    Shell/               // header (SOON 워드마크), grid layout
  hooks/
    useGlobalClock.ts    // rAF subscription
    useDriverMarker.ts   // ref-based imperative updater
  utils/
    coordinates.ts       // affine fit + viewBox helpers
    fitting.ts           // bbox compute + outlier guard
```

#### A.2 폴링 스케줄 (예산 ≤ 26 req/min)

| Endpoint | 주기 | 호출/분 | 비고 |
|---|---|---|---|
| `location` (전 드라이버 한 번에) | 6s | 10 | `date>=now-6s` window |
| `intervals` | 6s | 10 | races only |
| `race_control` | 10s | 6 | 깃발·SC·VSC |
| `position` | 10s | 6 | race position 변경 |
| `laps` | 30s | 2 | lap-completion 감지 |
| `stints` | 60s | 1 | 타이어 컴파운드·age |
| `pit` | 60s | 1 | 핏스탑 |
| `weather` | 60s | 1 | 1분 source cadence |
| 예비 헤드룸 | — | ~3 | 재시도·재캘리브레이션 |
| **합계 (정상 race)** | | **~37** | ⚠️ 30 초과 |

⚠️ 위 합계가 30을 넘으므로 라이브 모드에선 일부 다운샘플 필수. 재조정안:

| Endpoint | 주기 | 호출/분 |
|---|---|---|
| `location` | 6s | 10 |
| `intervals` | 6s | 10 |
| `position` | 15s | 4 |
| `race_control` | 15s | 4 |
| `laps` | 30s | 2 |
| `stints` | 60s | 1 |
| `pit` | 60s | 1 |
| `weather` | 120s | 0.5 |
| **합계** | | **~32.5** |

여전히 빠듯 → **practice/quali에선 더 보수적, race에선 `position`/`race_control`을 15s로 묶어 32.5 → 30 한도 직전** 운영. **테스트로 실측 후 조정**(AC2.1 ≤ 26 목표는 안전 마진).

#### A.3 Live ↔ Historical 통합 데이터 흐름

```
┌────────────────────────────────────┐
│  Mode = LIVE  (anchor=now, rate=1x)│
│  ┌──────────┐ poll  ┌────────────┐ │
│  │ poller   │──────▶│ telemetry  │ │
│  │ tier'd   │       │   store    │ │
│  └──────────┘       └─────┬──────┘ │
│                           │        │
│  Mode = PLAYBACK          ▼        │
│  ┌──────────┐ bulk  ┌────────────┐ │
│  │ session  │──────▶│  buffer    │ │
│  │ loader   │ fetch │  (full)    │ │
│  └──────────┘       └─────┬──────┘ │
│                           ▼        │
│              ┌───────────────────┐ │
│              │ globalClock       │ │
│              │ (anchor + rate)   │ │
│              └─────────┬─────────┘ │
│                        ▼           │
│           ┌─────────────────────┐  │
│           │  sample(t) per car  │  │
│           │  ↓ interpolate      │  │
│           │  → svg.transform    │  │
│           │  → React leaderboard│  │
│           └─────────────────────┘  │
└────────────────────────────────────┘
```

핵심: **단일 글로벌 클록**이 모드와 무관하게 모든 시각화의 진실의 원천이다.

---

### B. 서킷 SVG 확보 & 좌표 매핑 전략

#### B.1 SVG 확보 파이프라인 (빌드 타임)

1. `bacinger/f1-circuits` repo를 npm postinstall 또는 별도 스크립트에서 clone (또는 git submodule).
2. `scripts/build-circuits.ts`:
   - 각 GeoJSON LineString 좌표(lon, lat)를 **circuit별 로컬 equirectangular projection**으로 SVG path 변환.
   - circuit metadata(원점, 회전각) 추출하여 `src/assets/circuits/{circuit_key}.svg` + `circuits.json`(매핑 메타) 생성.
   - 출력 SVG는 minimal 스타일(트랙 outline만), `viewBox`는 path bbox + 5% 패딩.
3. Vite 정적 자산으로 import.

#### B.2 런타임 캘리브레이션 (텔레메트리 ↔ SVG)

`bacinger` SVG는 위경도(WGS84) 기반이고 OpenF1 `location`은 임의 단위. 둘은 직접 비교 불가 → **affine fit**으로 일치시킨다.

```ts
// utils/coordinates.ts
type Affine = { a: number; b: number; c: number; d: number; tx: number; ty: number };

// least-squares affine fit: telemetry (x,y) -> svg user-space (sx,sy)
function fitAffine(tel: [number, number][], svg: [number, number][]): Affine {
  // SVD 또는 4-parameter similarity (scale + rotation + translation, no shear)
  // (라이브러리: ml-matrix 또는 직접 구현)
}
```

세션 진입 시 자동 캘리브레이션 절차:

1. 세션 도착 시 driver 1번(또는 첫 가용 드라이버)의 첫 클린 랩(피트 인/아웃 제외) `location` 가져옴.
2. 텔레메트리 폴리라인 bbox + SVG bbox 양쪽 모두에서 균등 샘플링 36개 포인트 추출.
3. 그 포인트 쌍으로 4-parameter similarity fit (scale + rotation + 2D translation, no shear/flip — y축 플립은 별도 부호로 처리).
4. 결과 affine 행렬을 `sessionStore.calibration`에 저장.
5. 모든 마커 위치 계산은 `applyAffine(telXY, calibration)` → SVG user-space로 매핑.

#### B.3 Fallback (SVG fit 실패 / 외부 의존성 zero 시나리오)

- `bacinger`에 해당 circuit이 없거나(2026 신규 circuit) affine fit residual이 임계값(예: 평균 거리 > 10% bbox 대각선) 이상이면:
  - **자체 outline 모드**로 전환: telemetry 1랩 폴리라인 자체를 트랙 outline path로 렌더.
  - 5–7점 이동 평균으로 노이즈 스무딩, Catmull-Rom spline으로 곡선화.
  - viewBox는 텔레메트리 bbox + 5% 패딩.

#### B.4 Y-축 플립

OpenF1 telemetry: y-up (Cartesian). SVG: y-down. 매핑 공식에서 `svg_y = (Y_max - Y_tel) / range * H` 형태로 부호 반전.

#### B.5 마커 렌더 좌표 (rAF imperative)

각 driver마다 SVG `<g>` 요소를 한 번만 마운트하고 ref를 보존. rAF 루프에서:

```ts
function tick() {
  const t = globalClockNow();
  for (const driver of drivers) {
    const xy = interpolatePosition(driver, t);            // telemetry-space
    const [sx, sy] = applyAffine(xy, calibration);        // svg user-space
    driver.markerRef.current.setAttribute(
      'transform', `translate(${sx},${sy})`
    );
  }
  requestAnimationFrame(tick);
}
```

React 리렌더 zero. 라벨(드라이버 번호) 텍스트는 SVG `<text>` 자식, 색상만 변경되는 경우는 별도 selector 구독.

---

### C. 상태 관리 구조 & 부드러운 애니메이션 구현 방안

#### C.1 Zustand 스토어 분할

```ts
// store/timelineStore.ts
interface TimelineState {
  mode: 'live' | 'playback';
  anchorWallTime: number;       // performance.now()와 동기화
  anchorSessionTime: number;    // session-relative ms
  playbackRate: 1 | 2 | 5;
  isPaused: boolean;
  scrubTo: (sessionMs: number) => void;
  setRate: (r: 1 | 2 | 5) => void;
  // derived: globalClockNow() returns current session-time ms
}
```

- **단일 진실원**: 모든 컴포넌트는 `useTimelineStore`의 `globalClockNow()`를 호출해 동기.
- Live 모드는 `anchorSessionTime = now - 3000ms`(OpenF1 지연 보정), `playbackRate=1x`로 구현.

```ts
// store/telemetryStore.ts
interface TelemetryState {
  byDriver: Map<number, {
    samples: Array<{ t: number; x: number; y: number }>; // ring buffer
    lastLap: number;
    sparklineLaps: number[]; // 최근 10랩 ms
    tireCompound: 'SOFT'|'MEDIUM'|'HARD'|'INTER'|'WET';
    tireAgeLaps: number;
    pitStops: number;
  }>;
  appendLocationBatch(rows: LocationRow[]): void;
  appendLap(driver: number, lap: LapRow): void;
}
```

- ring buffer는 200 샘플(약 54초 분량 @ 3.7Hz) 유지 → 보간 윈도우.

#### C.2 보간(Interpolation)

폴링 간 ~6초 갭에서 마커가 끊기지 않도록 매 rAF에 보간:

1. 현재 globalClock 시각 `t`에 대해 driver별 ring buffer에서 `t`를 둘러싼 두 샘플 `s_a (t_a ≤ t)`, `s_b (t_b > t)`를 찾는다.
2. `α = (t - t_a) / (t_b - t_a)`.
3. **1차(선형)**: `x = lerp(s_a.x, s_b.x, α)`. v0.
4. **2차(Catmull-Rom)**: 인접 4점(`s_{a-1}, s_a, s_b, s_{b+1}`)으로 Catmull-Rom — 코너 진입에서 더 자연스러움. v1.
5. `t > t_last`인 경우(미래 외삽): 마지막 속도 벡터로 짧게(≤ 1초) 외삽 후 freeze. 그 이상은 정지(데이터 끊김 표시).

#### C.3 rAF 루프 & 백프레셔

- 단일 rAF 마스터 루프(`useEffect` 마운트에서 시작) — 컴포넌트당 별도 루프 금지.
- 매 프레임 수행:
  1. `globalClockNow()` 계산.
  2. 모든 driver marker ref에 대해 보간 + `transform` 업데이트.
  3. Leaderboard 갱신은 1Hz 별도 `setInterval` (Zustand selector subscribe).
- **30Hz 폴백**: 최근 60프레임 중 dropped(`> 20ms`) 비율 > 10%면 마스터 루프에서 격프레임 skip.

#### C.4 메모리 관리

- 텔레메트리 ring buffer 200 샘플/드라이버 × 20 = 4000 row. 부담 0.
- Playback 모드의 풀 세션 로딩은 chunked: 10분 윈도우씩 lazy fetch + LRU evict(현재 시점 ±15분 외 비움).

#### C.5 Time Synchronization (글로벌 타이머 견고성)

- `anchorWallTime`은 `performance.now()` 기반(시스템 시계 변경 무관).
- 탭 백그라운드 시 rAF 중단 → 복귀 시 `wallTimeDelta`만큼 anchor 보정.
- 모드 전환·스크럽 시 anchor 재계산 1회로 모든 보간이 자동 정렬.
- Live 모드 진입 시 OpenF1 서버 시각과 동기(첫 응답 헤더 `Date` ↔ 클라이언트 `performance.now()`).

---

### D. UI/UX & 브랜딩

#### D.1 SOON 워드마크

- 컴포넌트 `<Wordmark/>`:
  ```jsx
  <span className="font-display font-black tracking-tight">
    S<span className="text-soon-accent">ON</span>{' '}
    <span className="text-soon-muted font-medium">Board</span>
  </span>
  ```
- Tailwind `theme.extend.colors`:
  - `soon-accent`: `#E10600` (F1 racing red) 또는 `#00FF94` (neon green) — v1 디폴트는 racing red, A/B 토글 옵션.
  - 'ON' 텍스트에 미세한 `text-shadow: 0 0 6px currentColor` 네온 글로우.
  - 라이브 모드에선 'ON' 옆 작은 빨간 펄스 닷(`<LiveDot/>`)으로 "On Air" 강조.

#### D.2 다크 팔레트

| 토큰 | 값 | 용도 |
|---|---|---|
| `bg-base` | `#0A0A0B` | 페이지 배경 |
| `bg-elev1` | `#14141A` | 카드/패널 |
| `bg-elev2` | `#1F1F28` | 헤더/구분 |
| `text-primary` | `#F5F5F7` | 본문 |
| `text-muted` | `#9CA3AF` | 보조 |
| `accent-red` | `#E10600` | SOON 'ON', live 인디케이터 |
| `accent-neon` | `#00FF94` | 옵션 액센트 |
| `tire-soft` | `#FF3333` |  |
| `tire-medium` | `#FFD600` |  |
| `tire-hard` | `#FFFFFF` |  |
| `tire-inter` | `#43B02A` |  |
| `tire-wet` | `#0067AD` |  |

#### D.3 레이아웃 (반응형)

```
┌─ FHD (≥1440px) ────────────────────────────────┐
│ Header (SOON Board · session · live dot · clock)│
├─────────────────────────┬───────────────────────┤
│                         │  Leaderboard          │
│   Circuit Map           │  ┌──────────────────┐ │
│   (SVG, ~60%)           │  │ pos·driver·gap   │ │
│                         │  │ tire · sparkline │ │
│                         │  └──────────────────┘ │
├─────────────────────────┴───────────────────────┤
│ Playback bar (calendar btn · scrubber · 1×/2×/5×)│
└──────────────────────────────────────────────────┘

┌─ iPad portrait (768×1024) ──────────────────────┐
│ Header                                          │
├──────────────────────────────────────────────────┤
│   Circuit Map  (full width, ~50% height)        │
├──────────────────────────────────────────────────┤
│   Leaderboard  (full width, scroll)             │
├──────────────────────────────────────────────────┤
│ Playback bar                                    │
└──────────────────────────────────────────────────┘
```

#### D.4 Calendar UI

- 2024/2025/2026 탭 → 각 시즌 그랑프리 카드 그리드.
- 카드 클릭 → 모달로 P1/P2/P3/Sprint/Q/R 세션 선택 → playback 진입.

---

### E. 위험·완화

| 위험 | 영향 | 완화 |
|---|---|---|
| OpenF1이 CORS 헤더 제거 | 모든 데이터 페치 차단 | Cloudflare Worker 프록시 (5분 작업) |
| Rate limit 초과 | 429 폭주 | 토큰버킷 + 지수 백오프 + 폴링 다운샘플 |
| 신규 2026 circuit이 `bacinger` 미수록 | Map fallback | 자체 outline 모드 (B.3) |
| iPad Safari `requestAnimationFrame` 백그라운드 throttle | 마커 멈춤 | visibilitychange 핸들러 + 복귀 시 anchor 보정 |
| `location` lateral 부정확 → 좌우 차로 구분 안 됨 | 시각적 부정확 | centerline-only 표현 (정책상 수용) |
| OpenF1 점검·다운 | 전기능 중단 | 캐시된 마지막 응답 표시 + "데이터 끊김" 배너 |

---

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| Meeting | core domain | `meeting_key`, `year`, `country`, `circuit_short_name` | has many Sessions |
| Session | core domain | `session_key`, `session_type`, `date_start`, `date_end` | belongs to Meeting; has many Drivers |
| Driver | core domain | `driver_number`, `name`, `team_name`, `team_colour`, `headshot_url` | belongs to Session |
| LocationSample | core domain | `t`, `x`, `y`, `driver_number` | belongs to Driver |
| Lap | core domain | `lap_number`, `duration_ms`, `sector_ms[]`, `pit_in`, `pit_out` | belongs to Driver |
| Stint | supporting | `compound`, `lap_start`, `lap_end`, `tyre_age_at_start` | belongs to Driver |
| PitStop | supporting | `lap_number`, `duration_ms` | belongs to Driver |
| Interval | supporting | `gap_to_leader_ms`, `interval_ahead_ms` | belongs to Driver |
| RacePosition | supporting | `position`, `date` | belongs to Driver |
| GlobalClock | core architecture | `mode`, `anchorWallTime`, `anchorSessionTime`, `playbackRate`, `isPaused` | controls all timelines |
| Calibration | core architecture | `affine: {a,b,c,d,tx,ty}`, `residual`, `mode: 'svg'|'fallback'` | per Session |
| MarkerRef | core architecture | `svgGroupRef`, `lastTransform` | per Driver per Session |
| PollingScheduler | supporting | `tiers`, `tokenBucket` | external system: OpenF1 |
| FreshnessSLO | criterion | `p95Ms = 4000`, `targetFps = 60`, `fallbackFps = 30` | global |

---

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------:|----:|--------:|-------:|----------------:|
| 1 | 9 | 9 | – | – | N/A |
| 2 | 11 | 2 (Viewport, Breakpoint) | 0 | 9 | 82% |
| 3 | 14 | 3 (Zustand store, MarkerRef, AnimationLoop) | 0 | 11 | 79% |
| 4 | 14 | 0 | 0 (value-prop 변경은 우선순위만) | 14 | 100% |
| 5 | **14** (canonical) | 0 (Calibration·Polling은 R3에 이미 등장) | 0 | 14 | **100%** |

R4–R5에서 100% 안정 → 도메인 모델 수렴. (Viewport/Breakpoint는 final spec에서 architecture-level token으로 흡수, ontology 테이블에선 14개 핵심 엔티티만 표기.)

---

## Interview Transcript

<details>
<summary>전체 Q&A (Round 0 topology + 5 rounds)</summary>

### Round 0 — Topology Confirmation
**Q:** 이 5개 컴포넌트 토폴로지가 맞나요? 추가/제거/병합/분리하거나 명시적으로 미루고 싶은 컴포넌트가 있나요?
**A:** 5개 그대로 진행 (추천).
**Result:** Data Layer / Leaderboard / Circuit Map / Playback / Shell 5개 active, deferral 없음.

### Round 1 — Live priority
**Q:** "Live"의 우선순위는 어떻게 잡을까요? OpenF1 무료 플랜은 REST polling만 제공하고 실제 중계 대비 약 3–4초 지연이 있습니다.
**A:** Live = Playback (통합된 글로벌 타이머).
**Result:** Goal=0.78, Constraints=0.55, Criteria=0.40 → Ambiguity 40.3%.

### Round 2 — Primary device
**Q:** 주로 사용하실 타겟 디바이스는 무엇이며, 이를 우선으로 최적화해야 하나요?
**A:** 둘 다 1등 (반응형 그리드, FHD + iPad).
**Result:** Goal=0.80, Constraints=0.65, Criteria=0.42 → Ambiguity 35.9%.

### Round 3 — State + render
**Q:** 상태 관리 라이브러리 추천과 마커 렌더링 전략을 승인하시겠어요?
**A:** Zustand + rAF imperative (추천).
**Result:** Goal=0.85, Constraints=0.75, Criteria=0.45 → Ambiguity 30.0%.

### Round 4 — Contrarian: Unique value
**Q:** SOON Board의 핵심 부가가치 — 공식 중계 대비 '이게 내가 켜는 이유'에 가장 가까운 것은?
**A:** 전체 필드 조감 — 20대 동시 서킷 맵 위치 (추천).
**Result:** Goal=0.92, Constraints=0.85, Criteria=0.50 → Ambiguity 22.7%. (백그라운드 리서치 동시 완료)

### Round 5 — SVG license + perf SLO
**Q:** SVG 라이선스 안전책과 성능 acceptance 기준을 승인하시겠어요?
**A:** bacinger MIT 소스 + 60/30Hz 폴백 + P95 신선도 ≤4s (추천).
**Result:** Goal=0.92, Constraints=0.92, Criteria=0.85 → **Ambiguity 10.1%** ✓ 임계치 통과.

</details>

---

## Open Questions (Phase 2 — 구현 시 결정)

이 항목들은 spec 통과를 막을 정도는 아니지만 구현 단계에서 결정되어야 함:

1. **D.1 액센트 컬러:** racing red `#E10600` vs neon green `#00FF94` 둘 다 ON 강조에 적합. v1 디폴트는 racing red로 가되 설정에서 토글 노출 여부?
2. **Calendar 표시 방식:** 단순 카드 그리드 vs 전 시즌 캘린더 뷰(월별)?
3. **드라이버 헬멧 SVG:** OpenF1 `headshot_url`만으로 충분 vs 자체 헬멧 SVG 컬렉션?
4. **Pause / Step 인터랙션:** Playback에서 stop·step-by-frame UI 필요?
5. **세션 캐싱:** 한 번 본 세션의 telemetry를 IndexedDB로 영구 캐시? (네트워크 절약, 그러나 GH Pages 정적 사이트 첫 방문 부담 ↑)
6. **여러 탭 동시 사용:** localStorage로 polling coordinator를 공유해 rate limit 합산?

이 6개는 v1 코어 결정에 영향 없음 — 구현 중 명확해질 가능성 큼.
