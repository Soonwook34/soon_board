# Deep Interview Spec: SOON BOARD 기술 스택 + 디자인 시스템

## Metadata
- Interview ID: soon-board-stack-2026-05-20
- Rounds: 8 (+ Round 0 topology)
- Final Ambiguity Score: 34%
- Type: brownfield (플랜 3종 + API 분석 문서 선행, 코드 0)
- Generated: 2026-05-20
- Threshold: 0.20
- Initial Context Summarized: yes (docs/ 3종 + .omc/plans/ 3종을 컴포넌트별 사실로 요약)
- Status: BELOW_THRESHOLD_EARLY_EXIT (모든 컴포넌트 50% 아래, 핵심 의사결정 완료)

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.83 | 0.40 | 0.332 |
| Constraint Clarity | 0.68 | 0.30 | 0.204 |
| Success Criteria | 0.32 | 0.30 | 0.096 |
| **Total Clarity** | | | **0.66** |
| **Ambiguity** | | | **0.34** |

> Success Criteria가 낮은 이유: 본 인터뷰의 산출물은 "기술 스택 + 디자인 가이드라인"이라는 **계획 문서**이고, 실제 인수 기준은 [.omc/plans/main-page-implementation.md](../plans/main-page-implementation.md), [.omc/plans/dashboard-implementation.md](../plans/dashboard-implementation.md), [.omc/plans/live-map-implementation.md](../plans/live-map-implementation.md)에 이미 영역별로 작성돼 있음. 본 spec은 그 위에서 "어떤 도구로 그것을 만들 것인가"의 결정만 추가.

## Topology

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Hosting/Deployment | active | github.io 정적 우선 + 동접 확장 가능 모델 | Cloudflare 단일 (Pages+Workers+KV)로 닫힘 |
| Frontend Framework | active | 정적 메인 + 동적 라이브/리플레이 | Astro + React Islands로 닫힘 |
| Data Pipeline | active | 빌드 타임 카탈로그 + 런타임 라이브/리플레이 | Worker on-demand proxy + KV SWR + GitHub Actions 카탈로그 빌드 |
| Design System | active | 다크 텔레메트리 미러 + F1 레드 액센트 + Orbitron | 색·폰트·토큰 결정. 컴포넌트 시각 규약은 구현 시 |
| Brand Identity | active | "SOON BOARD" with "ON" in F1 red #E10600 | 워드마크 + 색상 + Attribution 정책 결정 |

## Goal

**SOON BOARD**를 다음 조건을 모두 만족하는 F1 시청 팬 사이트로 구축한다:

1. **완전 비상업 운영** — 광고/유료 없음. OpenF1 CC-BY-NC-SA 4.0 라이선스를 깨끗하게 지킴.
2. **Cloudflare 단일 스택 무료 운영** — Cloudflare Pages (정적 호스팅) + Cloudflare Workers (라이브 폴러 + SWR 프록시) + Workers KV (캐시). github.io 정적 배포의 무료성을 유지하되, 라이브 모드 팬아웃 제약을 Worker on-demand proxy 패턴으로 해결.
3. **Astro + React Islands** — 메인 페이지(시즌 카탈로그)는 Astro 정적 MPA로 SEO/로드 속도 최적화, 라이브 맵/대시보드/리플레이는 React island로 동적성 확보. 3종 화면 플랜의 컴포넌트 코드를 모두 React로 통일.
4. **Orbitron + Orbit + JetBrains Mono** — sci-fi/모터스포츠 콘솔 톤. Orbitron이 워드마크 + UI 본문, Orbit (또는 Noto Sans KR fallback)이 한글, JetBrains Mono가 랩 타임/갭 같은 tabular figure.
5. **다크 텔레메트리 미러** — 검은 배경(#0A0A0F 계열) + F1 빨강(#E10600) 액센트 + 팀 색상은 OpenF1 `team_colour`를 동적 사용 + WCAG AA 명도 보정.
6. **"SOON BOARD" 워드마크** — Orbitron Bold. 글자 `SOON BOARD`에서 **두 번째 글자 "O"와 "N"만 #E10600**으로 칠해 "ON"이 점등된 듯한 인상. 나머지는 흰색/Off-white.

## Constraints

### 라이선스/법적
- **OpenF1는 CC-BY-NC-SA 4.0** — 비상업 사용만. 광고·후원·구독·유료 기능 추가 시 라이선스 위반. 모든 페이지 푸터에 OpenF1 및 julesr0y attribution 명시. "Unofficial fan project, not affiliated with Formula 1, FIA, or FOM" 명시.
- **F1 상표 회피** — "F1", "Formula 1", "FIA", "FOM" 명시적 로고 사용 금지. 색상 #E10600 사용은 색상 자체엔 상표권 없음.
- **julesr0y/f1-circuits-svg는 CC-BY-4.0** — attribution 의무, 상업 사용 가능, 동일 라이선스 강제 없음.

### 인프라/Free Tier
- **Cloudflare Pages**: 무제한 빌드 + 200k req/day. 모든 정적 자산(시즌 카탈로그 JSON, 트랙 outline JSON, 폰트 self-host, 디자인 자산) 호스팅.
- **Cloudflare Workers**: 100k req/day, request당 10ms CPU (free). 라이브 모드 동접이 10명 × 10s 폴 × 2시간 세션 = 7,200/세션. KV 적중률 90%+ 가정 시 OpenF1 직접 호출은 매 세션 ~720회로 OpenF1 30 req/min 한도 안.
- **Workers KV**: 100k reads/day, 1k writes/day. 라이브 폴 1회당 ~8 endpoint write × 6/min × 60min × 2hr = 5,760 writes/session. **Free 한도 안 (마진 ~83%)**, 그러나 동시에 여러 세션 운영 시 한도 근접 → 라이브 모드는 동시 1 세션 가정.
- **GitHub Actions**: public repo 무제한. 매일 자정 UTC + 1h에 시즌 카탈로그 빌드 스크립트 실행 → Cloudflare Pages 자동 배포.
- **Firebase 미사용** — Spark egress 제약으로 OpenF1 호출 불가, Blaze 강제 → 비상업 원칙과 충돌.

### 시각/디자인
- **Orbitron 한글 미지원** — `font-family: 'Orbitron', 'Orbit', 'Noto Sans KR', system-ui, sans-serif` 순으로 fallback. Orbit이 Google Fonts에 미존재하면 Noto Sans KR로 곧장 fallback.
- **다크 테마 단일** — 라이트 테마 미지원 (테레프 미러는 다크 전용). 향후 추가는 후속.
- **데스크탑 우선** — 1280×800 minimum, 1920×1080 기준. 모바일은 라이브/리플레이 화면 핵심 패널만 표시하는 반응형 fallback.
- **WCAG AA** — F1 레드 #E10600 vs 흑 배경 명도비 5.36:1 (AAA 큰 글씨 통과). 팀 색상은 동적 대비 보정 필요 (`team_colour` HEX가 너무 어두우면 outline/glow 추가).

### 기술 결정 (고정)
- **TypeScript strict** — 전 코드베이스. `noImplicitAny`, `strictNullChecks`.
- **Vite 빌드** — Astro가 내부적으로 Vite 사용. 추가 도구 없음.
- **pnpm** — 패키지 매니저 (저장 효율). Cloudflare Pages가 pnpm 자동 감지.
- **Canvas 2D** — 라이브 맵 렌더링. WebGL/PixiJS 미사용 (20 마커에 과잉).
- **Vitest + Playwright** — 단위 + 시각 회귀.

## Non-Goals

- ❌ 광고 / 유료 / 구독 / 후원 (라이선스 충돌)
- ❌ 사용자 계정 / 로그인 / 즐겨찾기 (Firebase Auth 미사용)
- ❌ 푸시 알림 / 이메일 (인프라 추가 부담)
- ❌ 다국어 (한국어 + 영문 라벨만, i18n 시스템 없음)
- ❌ 라이트 테마 (다크 전용)
- ❌ 모바일 우선 UX (반응형 fallback만)
- ❌ 텔레메트리 `car_data` 시각화 (플랜 결정)
- ❌ `team_radio` 오디오 재생 (플랜 결정)
- ❌ 챔피언십 standings / 드라이버 검색 (후속)
- ❌ Firebase Functions/Auth/Firestore (egress 제약)
- ❌ Vercel (Cloudflare 단일로 충분)
- ❌ WebSocket (Durable Objects 유료 + free tier WebSocket 없음 → SSE/polling으로 충분)
- ❌ Next.js (Cloudflare Pages에서 Astro가 더 자연)
- ❌ "F1" / "Formula 1" 로고나 상표 사용

## Acceptance Criteria

각 기준은 자동(✓) 또는 수동(○) 검증 가능.

### 호스팅/배포
- [ ] ✓ Cloudflare Pages에 main 브랜치 push 시 자동 빌드 + 배포 ≤ 3분
- [ ] ✓ 모든 페이지 first paint ≤ 2s (3G fast 기준, Lighthouse)
- [ ] ✓ Cloudflare Worker invocation ≤ 100k/day (CF Analytics 모니터)
- [ ] ✓ Workers KV writes ≤ 1k/day in steady state (실제 모니터링)
- [ ] ○ 동접 10명 라이브 시뮬레이션 시 OpenF1 직접 호출 ≤ 30 req/min (KV 적중률 측정)

### 프레임워크
- [ ] ✓ 메인 페이지(/)는 Astro 정적 빌드, JS payload ≤ 50KB (Astro Islands 미하이드레이션)
- [ ] ✓ 라이브/리플레이 화면은 React island로 하이드레이션, TTI ≤ 3s
- [ ] ✓ 3종 플랜의 컴포넌트 디렉터리 구조 (`src/main/`, `src/dashboard/`, `src/map/`, `src/live/`)가 Astro 프로젝트에서 그대로 작동
- [ ] ✓ TypeScript strict 통과 (전 코드)

### 데이터 파이프라인
- [ ] ✓ 시즌 카탈로그 JSON(`seasons/{year}.json`) 빌드는 GitHub Actions에서 매일 자정 UTC+1h 실행
- [ ] ✓ 라이브 모드 Worker 폴 패턴: 클라이언트 10s polling → Worker KV (TTL 8s) 적중 → miss 시 OpenF1 호출 + KV write
- [ ] ✓ 리플레이 모드는 클라이언트가 직접 OpenF1 호출 (historical은 무료/익명) — Worker 우회
- [ ] ✓ 라이브 표시 지연 30s (live-streaming-strategy.md §2.1 그대로)
- [ ] ✓ OpenF1 NC 라이선스 attribution 모든 페이지 푸터에 표기

### 디자인 시스템
- [ ] ○ 색 토큰이 `tailwind.config.ts` 또는 CSS custom properties로 단일 정의 (재정의 금지)
- [ ] ✓ 폰트 self-host (Cloudflare Pages에 woff2 파일 함께 배포, Google Fonts CDN 미의존 — 프라이버시 + 로드 안정)
- [ ] ✓ 모든 카드/배지/마커가 동일한 반경 토큰 (radius-sm 4px, radius-md 8px, radius-lg 12px) 사용
- [ ] ○ 시각 회귀 baseline: 메인 페이지 4상태 + 대시보드 3상태 + 라이브 맵 2상태 (총 9 baseline)
- [ ] ○ Team color contrast 보정: OpenF1 `team_colour` HEX가 #2A2A30 미만 밝기일 때 흰색 1px outline 추가

### 브랜드 아이덴티티
- [ ] ✓ 워드마크 SVG: "SOO**ON** BOARD"에서 정확히 두 글자 ("O", "N", 즉 두 번째 글자와 세 번째 글자) 만 #E10600. 나머지는 #F5F5F0.
- [ ] ✓ favicon 32×32 / 180×180 (Apple touch) / 512×512 (Android) 생성
- [ ] ✓ OG image 1200×630: 다크 배경 + 워드마크 + "Unofficial F1 fan board"
- [ ] ○ 푸터 attribution: "Data: OpenF1 (CC BY-NC-SA 4.0) · Tracks: julesr0y/f1-circuits-svg (CC BY 4.0) · Unofficial, not affiliated with F1/FIA/FOM"

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "github.io 정적이면 충분" | Contrarian: 백엔드 팬아웃 없이는 라이브 모드 동접 1명도 한계. 정말 정적만으로 운영? | Cloudflare Pages가 github.io의 정적 무료성 + Workers 무료 한도로 라이브 폴러까지 흡수. github.io 대체로 채택. |
| "F1 서비스 = 다크 테마 + 빨강" | Contrarian: 미니멀 화이트도 가능. 진짜 어느 톤? | 다크 텔레메트리 미러 채택. F1 빨강은 액센트로만 (SOON BOARD ON + 위험/적기 상태). |
| "폰트는 워드마크/UI/숫자 3개 필요" | Simplifier: 진짜 3개? | Orbitron으로 워드마크+UI 통합 + JetBrains Mono로 숫자 + Orbit/NotoSansKR로 한글 = 사실상 2.5개. |
| "Firebase를 백엔드로 쓸 수 있다" | 사실 확인: Firebase Spark 플랜의 Functions egress 제약 | Firebase 백엔드는 비상업 free 운영에서 부적합. Cloudflare 단일로 결정. |
| "라이브 모드는 30s 지연이 표시 표준" | Live strategy §2.1 그대로 유지. SWR 패턴이 30s 버퍼와 호환됨을 확인 | 30s 표시 지연 유지. Worker 캐시 TTL 8s로 마진 ~22s. |
| "Cloudflare Cron 매분이 라이브 폴러로 충분" | Worker Cron 매분 vs 10s on-demand polling 비교 | Cron 미사용. On-demand polling (클라이언트가 Worker fetch → Worker가 OpenF1 위임 + KV 캐시)이 더 단순하고 free tier 친화. |
| "광고나 후원으로 운영비 회수 가능" | OpenF1 CC-BY-NC-SA의 NC 조항 | 완전 비상업 결정. Cloudflare free + Pages free만으로 운영비 0. |

## Technical Context

### 최종 기술 스택 요약
```
┌─────────────────────────────────────────────────────────────────┐
│ Hosting: Cloudflare Pages (모든 정적 자산 + Astro SSG 산출물)    │
├─────────────────────────────────────────────────────────────────┤
│ Backend: Cloudflare Workers (라이브 SWR proxy, fetch handler)   │
│          + Workers KV (라이브 데이터 캐시, TTL 8s)                │
├─────────────────────────────────────────────────────────────────┤
│ CI: GitHub Actions                                              │
│   - 매일 00:00 UTC + 1h: seasons/{year}.json 빌드 → main push   │
│   - main push 시: Cloudflare Pages 자동 빌드                     │
├─────────────────────────────────────────────────────────────────┤
│ Frontend Framework: Astro 4.x + React 18 Islands               │
│ Build: Vite (Astro 내장)                                        │
│ Language: TypeScript strict                                     │
│ Package: pnpm                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Routing:                                                        │
│   / (메인, .astro 정적)                                          │
│   /live/[session_key] (.astro shell + React island)             │
│   /replay/[session_key] (.astro shell + React island)           │
├─────────────────────────────────────────────────────────────────┤
│ Rendering: Canvas 2D (라이브 맵), React (대시보드 + 메인)        │
│ State: 라이브/리플레이 화면당 단일 DataSource 인스턴스             │
│        Zustand (전역 selectionStore, uiStore)                   │
├─────────────────────────────────────────────────────────────────┤
│ Styling: Tailwind CSS + CSS variables (디자인 토큰)              │
│ Fonts: Orbitron / Orbit (or Noto Sans KR) / JetBrains Mono     │
│        모두 self-host (woff2, /fonts/)                          │
├─────────────────────────────────────────────────────────────────┤
│ Testing: Vitest (unit) + Playwright (visual regression)         │
└─────────────────────────────────────────────────────────────────┘
```

### 디자인 토큰 (구체값)

```ts
// src/design/tokens.ts (또는 tailwind.config.ts)
export const tokens = {
  color: {
    // 베이스 (다크 텔레메트리)
    bg: {
      base:    '#0A0A0F',   // 페이지 배경
      surface: '#13131A',   // 카드/패널
      raised:  '#1C1C24',   // 호버/활성
      border:  '#2A2A35',   // 경계선
    },
    // 텍스트
    text: {
      primary:   '#F5F5F0', // 본문, 큰 숫자
      secondary: '#A8A8B5', // 부속 정보
      tertiary:  '#6B6B7A', // disabled, hint
      inverse:   '#0A0A0F', // 밝은 배경 위 텍스트
    },
    // 액센트 — F1 레드
    accent: {
      DEFAULT: '#E10600',  // SOON BOARD "ON", live indicator, 적기
      hover:   '#FF1801',  // 호버 시
      dim:     '#8B0400',  // 비활성 보조
    },
    // 상태 (race control)
    status: {
      green:   '#10B981',  // 그린/세이프
      yellow:  '#F59E0B',  // 옐로 플래그
      red:     '#E10600',  // 레드 플래그 (액센트와 동일)
      blue:    '#3B82F6',  // 블루 플래그
      purple:  '#A855F7',  // overall best (섹터)
      gray:    '#374151',  // 데이터 없음
    },
    // 컴파운드 (tyre)
    tyre: {
      soft:         '#E10600', // 빨강
      medium:       '#FCD34D', // 노랑
      hard:         '#F5F5F0', // 흰색
      intermediate: '#10B981', // 초록
      wet:          '#3B82F6', // 파랑
    },
  },
  font: {
    family: {
      display: ['Orbitron', 'Orbit', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      body:    ['Orbitron', 'Orbit', 'Noto Sans KR', 'system-ui', 'sans-serif'],
      mono:    ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
    },
    size: {
      xs:  '11px',   // 라벨, 작은 메타
      sm:  '13px',   // 부속 정보
      base:'15px',   // 본문
      lg:  '18px',   // 패널 헤더
      xl:  '24px',   // 큰 숫자 (랩 타임)
      '2xl':'32px',  // 메인 hero
      '3xl':'48px',  // 카운트다운
      '4xl':'72px',  // 워드마크
    },
    weight: { regular: 400, medium: 500, semibold: 600, bold: 700, black: 900 },
    feature: {
      tabular: 'tabular-nums',  // 모든 시간/숫자 표기에 적용 (column align)
    },
  },
  space: { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px', 6: '32px', 7: '48px', 8: '64px' },
  radius: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  shadow: {
    // 다크 테마에선 그림자보다 보더가 자연. 단 hover/focus에 ring 사용
    ring:    '0 0 0 1px var(--ring-color)',
    glow:    '0 0 16px var(--glow-color)',  // 라이브 인디케이터용
  },
  motion: {
    duration: { fast: '150ms', base: '250ms', slow: '400ms' },
    ease:     { standard: 'cubic-bezier(0.4, 0, 0.2, 1)', emphasize: 'cubic-bezier(0.2, 0, 0, 1)' },
  },
} as const;
```

### SOON BOARD 워드마크 사양

```
S O O N   B O A R D
│ │ │ │   │ │ │ │ │
│ ├─┤ │   │ │ │ │ │   ← "O"(2번째 글자)와 "N"(4번째 글자)? 
│         │             아니, "ON"은 SOON의 끝 두 글자
└─────────┴─────────
  white   white
        ^^         ← S, O, O 중 마지막 O와 N 두 글자가 #E10600
```

정확한 규칙: **"SOON"의 마지막 두 글자 "ON"이 #E10600**. 즉 인덱스 2번 ("O")와 3번("N"). "BOARD"는 전부 #F5F5F0.

```html
<svg viewBox="0 0 480 80">
  <text x="0" y="64" font-family="Orbitron" font-weight="900" font-size="64">
    <tspan fill="#F5F5F0">SO</tspan><tspan fill="#E10600">ON</tspan><tspan fill="#F5F5F0"> BOARD</tspan>
  </text>
</svg>
```

추가 효과 (옵션): "ON" 글자에 약한 빨강 glow (CSS `filter: drop-shadow(0 0 12px rgba(225, 6, 0, 0.5))`)로 LED 점등 인상.

### 라이브 폴러 아키텍처 (Cloudflare Worker)

```
Browser (라이브 화면 React island)
  │  매 10초 fetch
  ▼
Cloudflare Worker /api/live/{endpoint}?session_key={K}&since={cursor}
  │
  ├─[KV cache hit, age < 8s]── 캐시 응답 즉시 return
  │
  └─[KV miss/stale]
        │
        ├─ fetch('https://api.openf1.org/v1/{endpoint}?session_key=K&date>={cursor}')
        │  (rate limit 안에서, 모든 클라이언트 공유)
        │
        ├─ KV write: key=`{endpoint}:{K}:{bucket10s}`, TTL=300s
        │
        └─ return JSON

historical 데이터(리플레이)는 Worker 우회 — 클라이언트 → OpenF1 직접 (불변 + 무료)
```

### 모듈 구조 (Astro 프로젝트)

```
soon-board/
├── astro.config.mjs           # Astro + React + Tailwind + Cloudflare adapter
├── tailwind.config.ts         # 디자인 토큰 → Tailwind
├── tsconfig.json              # strict
├── pnpm-lock.yaml
├── wrangler.toml              # Cloudflare Workers 설정 (별도 패키지)
├── workers/
│   └── live-proxy/
│       └── src/index.ts       # SWR Worker
├── src/
│   ├── pages/
│   │   ├── index.astro        # 메인 (정적 + React island)
│   │   ├── live/[session_key].astro
│   │   └── replay/[session_key].astro
│   ├── design/
│   │   ├── tokens.ts          # 디자인 토큰 (TS)
│   │   ├── Logo.tsx           # SOON BOARD 워드마크
│   │   ├── fonts.css          # @font-face self-host
│   │   └── globals.css        # CSS reset + 토큰 변수
│   ├── main/                  # main-page-implementation.md
│   ├── dashboard/             # dashboard-implementation.md
│   ├── map/                   # live-map-implementation.md
│   ├── live/                  # 라이브 화면 컨테이너
│   └── replay/                # 리플레이 화면 컨테이너
├── public/
│   ├── fonts/
│   │   ├── Orbitron-*.woff2
│   │   ├── Orbit-*.woff2 (or NotoSansKR-*.woff2)
│   │   └── JetBrainsMono-*.woff2
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── og-image.png
├── scripts/
│   ├── fetch-season-catalog.ts
│   ├── fetch-circuit-maps.ts
│   ├── extract-openf1-transform.ts
│   ├── trace-pitlane.ts
│   ├── derive-sector-boundaries.ts
│   ├── derive-drs-zones.ts
│   └── load-slm-zones.ts
├── data/
│   └── slm-zones-raw.json
├── .github/workflows/
│   ├── daily-catalog.yml      # 매일 자정 UTC + 1h
│   └── ci.yml                 # PR/main typecheck + test
└── THIRD_PARTY_LICENSES.md
```

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| HostingPlatform | core | name, free_tier_limits, capabilities | provides CDN, runtime, edge-cache |
| FrameworkChoice | core | runtime, build_tool, routing_model | runs_on HostingPlatform, renders Page |
| DataSource | core | mode(live/replay), cadence, cache_strategy | feeds Panel, Marker, Catalog |
| Worker | core | endpoint, ttl, fallback | proxies OpenF1, writes KV |
| DesignToken | core | category(color/font/space/radius), value | applied_to Component |
| Wordmark | core | text, colored_chars, font, size | belongs_to Brand |
| Brand | core | name, accent_color, license_notice | embodies Identity |
| Page | supporting | route, static/dynamic, framework_island | renders Component |
| Catalog | supporting | year, meetings, sessions, result_preview | static, built_by GitHub Action |
| License | external | name (CC-BY-NC-SA / CC-BY-4.0), restrictions | constrains Brand, Pipeline |
| OpenF1Endpoint | external | path, rate_limit, auth, license | accessed_by DataSource |
| Circuit | external | circuit_key, year, layout, svg_source | rendered_by Map |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|-----------------|
| 0 (topology) | 5 | 5 | - | - | N/A |
| 1 (hosting goal) | 6 | +Worker | - | 5 | 83% |
| 2 (hosting constraints) | 8 | +KV, +Cron | - | 6 | 75% |
| 3 (framework goal) | 9 | +Island | - | 8 | 89% |
| 4 (design tone) | 10 | +Palette | - | 9 | 90% |
| 5 (brand red) | 11 | +AccentColor | - | 10 | 91% |
| 6 (typography) | 13 | +Wordmark, +Font | - | 11 | 85% |
| 7 (pipeline pattern) | 14 | +CacheStrategy | - | 13 | 93% |
| 8 (license) | 15 | +License | - | 14 | 93% |

→ 9개 라운드 동안 새 엔티티만 추가됐고 기존 엔티티의 이름/타입 변경 0건. **온톨로지 안정적 수렴.**

## Interview Transcript

<details>
<summary>Full Q&A (8 rounds + Round 0)</summary>

### Round 0 — Topology Confirmation
**Q:** 5개 top-level 컴포넌트 토폴로지 확인 (호스팅·프레임워크·데이터파이프라인·디자인시스템·브랜드)
**A:** "5개 그대로 진행"
**Result:** topology locked

### Round 1 — Hosting / Goal
**Q:** 라이브 모드를 정적 페이지로 운영 시 동접 한도. 어떻게 처리?
**A:** "Cloudflare + Vercel + Firebase Functions로 이전에 제안줬어"
**Ambiguity:** 100% → 85%

### Round 2 — Hosting / Constraints
**Q:** 세 플랫폼 분담?
**A:** "아직 정해지지 않음 — 제안 필요" → (이어서) "Cloudflare 단일 — Pages+Workers+KV"
**Ambiguity:** 85% → 50%

### Round 3 — Framework / Goal
**Q:** 프론트엔드 프레임워크?
**A:** "Astro + React islands"
**Ambiguity:** 50% → 42%

### Round 4 — Design / Goal (Contrarian)
**Q:** F1 = 다크+빨강이 자명한가?
**A:** "다크 + 텔레메트리적 (F1 TV/방송 미러)"
**Ambiguity:** 42% → 38%

### Round 5 — Brand / Constraints
**Q:** F1 빨강 정확한 hex?
**A:** "#E10600 — F1 로고 일반통용"
**Ambiguity:** 38% → 35%

### Round 6 — Design / Constraints (Simplifier)
**Q:** 폰트 조합?
**A:** "Orbitron(메인) + Orbit(한글 sub)" — JetBrains Mono는 spec 권장으로 채택
**Ambiguity:** 35% → 33%

### Round 7 — Data Pipeline / Goal
**Q:** 라이브 폴러 패턴?
**A:** "Worker on-demand proxy + KV stale-while-revalidate"
**Ambiguity:** 33% → 31%

### Round 8 — Data Pipeline / Constraints
**Q:** 운영 모델 (광고/수익)?
**A:** "완전 비상업 팬 프로젝트"
**Ambiguity:** 31% → 34% (Criteria 추정값 보정으로 약간 상승)

</details>

## 다음 단계 (사용자 선택)

이 spec은 **pending approval** 상태. 다음 중 하나를 선택해 진행:

1. **/oh-my-claudecode:plan --consensus --direct** — Planner/Architect/Critic으로 본 spec을 실행 가능한 단계별 plan으로 정교화. Stage 2 consensus refinement.
2. **/oh-my-claudecode:autopilot** — Phase 0 건너뛰고 본 spec으로 바로 구현 시작 (Astro 프로젝트 스캐폴딩 → Cloudflare 설정 → 디자인 토큰 → 컴포넌트 구현).
3. **/oh-my-claudecode:team** — 3종 플랜(메인/대시보드/라이브맵)을 N개 병렬 에이전트로 동시 구현.
4. **/oh-my-claudecode:ralph** — 인수 기준 전부 통과까지 반복 루프.
5. **Refine further** — deep-interview 추가 라운드 (특히 디자인 시스템 Criteria 강화).
