# Consensus Plan: SOON BOARD 기술 스택 + 디자인 시스템 구현 (pending approval)

> 작성일: 2026-05-20 · 최종 갱신: 2026-05-21 · 상태: **pending approval (consensus 합의 완료, v2.3)**
> 입력 spec: [.omc/specs/deep-interview-soon-board-stack.md](../specs/deep-interview-soon-board-stack.md)
> 모드: `--consensus --direct` · RALPLAN-DR short mode (greenfield 스캐폴딩, 비파괴)
> 합의 경로: Planner draft → Architect REQUEST REVISION (7) → Planner v2 → Critic APPROVE WITH IMPROVEMENTS (8) → Planner v2.1 → 사용자 정정 (req/min + Orbit + CF 가이드) → Planner v2.2 → 사용자 정정 (**cache key alignment** — 클라이언트별 cache window 어긋남 방어) → Planner v2.3 → **pending approval**

**v2.2 주요 변경 (Architect + Critic + 사용자 정정 누적):**
1. `workers/live-proxy/` 별도 패키지 → **Pages Functions** (`apps/web/functions/api/live/[endpoint].ts`) 단일 배포 단위로 통합
2. KV 주축 → **`caches.default` (Cache API) 주축** + KV는 last-known-good fallback (write 1/min)
3. 폰트 — **Orbitron + Orbit (한글, Google Fonts 실재 확인) + JetBrains Mono** (spec 그대로)
4. `prerender` polarity 정정 (shell static = `prerender = true`) + Astro `output: 'hybrid'`
5. AC-13 load test → logic test + AC-13b 실제 prod smoke 추가 (**26 req/min, 8 endpoint 합산** — docs §3.1 그대로)
6. Phase 0에 **OpenF1 reachability probe** + **font/Formula1-* 가드** 추가
7. 시각 회귀 Playwright `container:` CI에 명시 + catalog cron empty-response guard + `_headers` CSP
8. Cache API 명시적 SWR (`ctx.waitUntil(refresh)`) + capacity-denial 구체 메커니즘 + 폰트 크기 예산
9. Cloudflare 운영 가이드 문서 follow-up (`docs/cloudflare-onboarding.md`)

---

## 0. Requirements Summary

SOON BOARD를 다음 조건 하에 구축한다 (spec §Goal + v2 결정 반영):
- **Cloudflare 단일 스택** (Pages + Pages Functions + Cache API + KV-fallback) — github.io 정적의 무료성 + 라이브 폴러 팬아웃 제약 해결
- **Astro 4.x (`output: 'hybrid'`) + React 18 Islands** — 메인 정적 MPA + 라이브/리플레이 React island. shell은 `export const prerender = true`로 정적 prerender
- **Pages Function + Cache API SWR (`s-maxage=10, stale-while-revalidate=20` + 핸들러 내 `ctx.waitUntil(refresh)`)** — 라이브, **historical 직호출** — 리플레이
- **GitHub Actions 매일 catalog 빌드** — `seasons/{year}.json` → main push → Cloudflare 자동 배포
- **다크 텔레메트리 미러 + #E10600 액센트** — Orbitron (영문) + Orbit (한글, Google Fonts 실재 확인) + JetBrains Mono
- **완전 비상업** — OpenF1 CC-BY-NC-SA + julesr0y CC-BY-4.0 attribution

기존 3종 플랜 ([main-page-implementation.md](./main-page-implementation.md), [dashboard-implementation.md](./dashboard-implementation.md), [live-map-implementation.md](./live-map-implementation.md))은 본 plan의 **하위 계획**으로 통합 — 화면별 구현 디테일은 그대로 유지, 본 plan은 그 위의 **스캐폴딩·통합·배포** 레이어만 추가.

---

## 1. RALPLAN-DR Summary (Short Mode)

### Principles

1. **Free tier로 운영 가능한 범위 안에서만 결정한다** — Cloudflare Workers 100k req/day, KV 100k r/d & 1k w/d, Pages 200k req/day 한도가 모든 설계의 hard ceiling.
2. **라이선스를 코드보다 먼저** — OpenF1 NC + julesr0y BY가 모든 페이지/CI/README에 일관 attribution. 비상업 원칙을 깨는 디자인 변경은 거부.
3. **빌드 타임에 가능한 것을 런타임에 옮기지 않는다** — 시즌 카탈로그·트랙 outline·affine transform·DRS/sector zone은 빌드 타임 산출물로 커밋. 런타임 OpenF1 호출은 라이브 30s 윈도우와 리플레이 60s 윈도우에 한정.
4. **3종 화면 플랜의 컴포넌트 구조를 변경하지 않는다** — 본 plan은 호스팅/스택/디자인 토큰만 추가하고, [src/main/](../../src/main/), [src/dashboard/](../../src/dashboard/), [src/map/](../../src/map/)의 모듈 구조는 기존 플랜 그대로.
5. **수치 인수기준은 spec과 기존 플랜의 그것을 그대로 상속** — 본 plan은 새로운 인수기준을 만들지 않고, 단계별 통과 게이트만 추가.

### Decision Drivers (Top 3)

1. **운영비 $0/월 유지** — Cloudflare free + GitHub free + 자체 도메인 없음(.pages.dev 사용) → 인프라 비용 0원. Drives away: Vercel Pro, Firebase Blaze, Durable Objects, paid Workers plan.
2. **라이브 모드 동접 확장 가능성** — Pages Function + Cache API SWR로 단일 OpenF1 폴 → N 클라이언트 fan-out. 동접 1명/10명/30명 모두 OpenF1 outbound **26 req/min 일정** (8 endpoint 합산, [docs §3.1](../../docs/live-streaming-strategy.md), 무료 30 req/min 한도 87%). Drives away: 클라이언트 직접 폴링 (옵션 C/Round 1).
3. **메인 페이지 SEO + 라이브 화면 부드러움 동시 달성** — Astro static + React island. Drives away: React SPA 전체(SEO 약함), SvelteKit(생태계 작음), 순수 정적(라이브 동적성 부족).

### Viable Options

#### Option A (CHOSEN): Astro + Cloudflare Pages Functions 단일 배포 (모노레포 1패키지)

**구조 (v2 — Worker 별도 패키지 제거):**
```
soon-board/  (pnpm workspace 루트)
└── apps/
    └── web/                      # Astro 앱 (src/, public/, functions/, astro.config.mjs)
        └── functions/
            └── api/
                └── live/
                    └── [endpoint].ts   # Cloudflare Pages Function
```

**Pros:**
- 단일 배포 단위 (Pages 빌드 1회 = SPA + Functions). 별도 wrangler 학습/배포 절차 불필요
- Pages Function이 `/api/live/*` 라우트를 같은 도메인에서 처리 → CORS 불필요
- `caches.default` (edge Cache API) 사용 가능 → **write 쿼터 무관**, 무제한 SWR per-PoP
- KV는 last-known-good fallback에 한정 사용 (선택, write < 60/day)
- 메인 페이지 정적 빌드 → Lighthouse 95+ 가능
- React 컴포넌트는 `client:only` 또는 `client:visible`로 island 하이드레이션
- 기존 3종 플랜의 React 코드를 그대로 가져옴

**Cons:**
- Pages Functions는 per-PoP 캐시(글로벌 KV 아님) → 첫 사용자 fan-out이 edge별로 발생 (cold start 1회/PoP). 동접 N이 같은 PoP에 모이면 OpenF1 호출 1회로 fan-out, 다른 PoP면 그 PoP에서 다시 1회. 실측 필요 (AC-13b)
- Pages Functions 100k req/day 제한은 Workers와 동일

**Architect 검토 반영:** 초안의 `workers/live-proxy/` 별도 패키지 안은 (a) `*.pages.dev/api/live/*` route binding 불가, (b) KV 1k writes/day 쿼터 초과(10s bucket × 8 endpoint × 6/min × 60min × 2hr = 5,760 writes/session) 두 가지 hard fail이 있어 폐기. Pages Functions + Cache API로 두 문제 동시 해결.

#### Option B: Pure React SPA (Vite) + Cloudflare Pages

**Pros:**
- Astro 학습 곡선 0
- 라우팅이 단순 (React Router 하나)

**Cons:**
- 메인 페이지가 SPA → JS payload 큼, SEO 약함, first paint 느림
- Astro vs 순수 React의 정적 이득(약 60% 페이로드 절감) 포기
- spec의 "Astro + React Islands" 결정과 충돌 → invalidated

#### Option C: Astro 단일 + 클라이언트 직접 폴링 (Worker/Function 없음)

**Pros:**
- 모든 것이 정적 호스팅 (배포 단순)
- Worker/Function 학습 0

**Cons:**
- 라이브 모드 동접 1~2명 제한 (OpenF1 429 즉시) → spec의 Round 1 결정(동접 확장)과 충돌
- 클라이언트 직접 폴링 → 사용자 IP에서 OpenF1로 직접 → 분산 부하 + NC 라이선스 회색 영역
- → invalidated by decision driver #2 (라이브 동접 확장)

#### Option D: 정적 호스팅 + GitHub Actions cron snapshot publisher (Architect steelman, v2.1 승격)

**구조:**
- Pages Functions 없음. `/api/live/*` 라우트도 없음.
- GitHub Actions cron이 매 60초 OpenF1 폴 → `data/live/{session_key}.json` 으로 main에 push → Cloudflare Pages 자동 빌드 → CDN에서 모든 클라이언트에게 fan-out.
- 클라이언트는 정적 `/data/live/{session_key}.json`을 polling.

**Pros:**
- 클래스 1 단순도 (Pages 정적 호스팅 + GitHub Actions cron 둘 다 무료 무한)
- KV / Functions 한도 모두 무관 → 동접 ~수천명까지 CDN이 흡수
- Cloudflare 의존도 최소 (Cloudflare가 ToS suspension 해도 Netlify/GHPages로 hot-swap 가능)
- OpenF1 호출 횟수 고정 (분당 8 endpoint × 1 = 8 req/min, free 한도의 27%)

**Cons:**
- **라이브 표시 지연 ~60s 이상** (cron 1분 + GitHub 빌드 ~30s + Pages 빌드 ~60s + CDN propagation = 2~3분) → spec의 30s 표시 지연 결정과 충돌
- GitHub Actions runner가 매분 켜지면 GitHub free tier 2000분/월 한도의 ~30%/일 사용 → 일찍 소진 위험
- 매분 main에 push → git history가 매우 시끄러움 + Pages 빌드 매분 트리거 → 빌드 분당 한도(월 500분) 침해 우려
- 세션 종료 후 즉시 멈춰야 함 — cron이 빈 응답을 계속 push하면 git history 오염

**Cons 완화 방안:**
- 빌드 분당 한도: GitHub Actions에서 빌드 트리거 비활성화하고 직접 `wrangler pages publish data/live/`로 Pages CDN에만 push (빌드 0)
- Git history 오염: `data/live/`는 별도 `gh-pages-live` 브랜치, main commit 안 함
- 빈 응답: 빌드 스크립트가 OpenF1 응답이 빈 배열이면 commit skip + workflow no-op

**Why Option A still wins (Option D 비교):**
- 표시 지연 30s → 2-3분으로 늘어남이 spec의 결정과 직접 충돌 (Round 7에서 사용자가 30s 채택)
- 그러나 **Option D는 v2.1 시점에서 가장 강력한 fallback 옵션** — Option A가 prod에서 무너지면(예: CF egress가 OpenF1에서 차단, 또는 CF ToS suspension) 그 시점에 hot-swap 가능
- 따라서: Option A를 1차로 채택하되, **Option D 변형을 `docs/migration-fallback.md`에 문서화** (§6 Follow-ups #7 이미 포함)

**Why Option A:** 세 드라이버 + spec Round 7(30s 표시 지연)을 모두 통과하는 유일한 옵션. Option B는 SEO/payload, Option C는 동접 확장, Option D는 30s 표시 지연 결정에서 각각 탈락. Option D는 fallback으로 보존.

---

## 2. Acceptance Criteria

### Infrastructure & Deployment
- [ ] **AC-1** `pnpm install` from clean clone → 모든 워크스페이스 install < 60s
- [ ] **AC-2** `pnpm --filter web build` → Astro 빌드 산출물 `apps/web/dist/` + `apps/web/functions/` 컴파일, 총 크기 < 5MB (트랙 outline JSON 포함), gzip < 1.5MB
- [ ] **AC-3** Cloudflare Pages 자동 배포: main push → 빌드 완료 ≤ **3min (CF dashboard 측정, 빌드 트리거 latency는 CF 관리 영역이라 포함하지 않음)**, Pages Functions 자동 등록
- [ ] **AC-4** Pages Functions endpoint `/api/live/[endpoint]` 가 Pages 앱과 **동일 도메인**(`<project>.pages.dev`)에서 응답. 별도 wrangler 배포 불필요. CORS 헤더 불필요 (same-origin).
- [ ] **AC-5** Pages Functions 환경변수 0개 (OpenF1 historical은 익명 무료, 라이브용 인증은 사용 안 함 — spec 결정). KV namespace binding (선택, fallback용)은 1개 (`LIVE_FALLBACK`)
- [ ] **AC-5b** **Pre-flight: OpenF1 reachability probe from Cloudflare egress** — Phase 0에서 `scripts/probe-openf1.ts`를 `wrangler dev --remote`로 1회 실행, 200 응답 + 비어 있지 않은 JSON 확인. 실패 시 Phase 2 진입 금지 + 후속 fallback 검토 (User-Agent 변경, 다른 endpoint 시도)
- [ ] **AC-5c** **Trademark contamination guard**: `apps/web/public/fonts/` 및 repo 어디에도 `Formula1-*.ttf` / `Formula1-*.otf` / `Formula1-*.woff*` 패턴 파일이 존재하면 CI 빌드 실패. `scripts/check-trademark-files.ts`가 PR마다 실행

### Astro + React Islands
- [ ] **AC-6** `/` (메인) — Astro 정적 페이지. React island는 `<Countdown client:load />` 등 동적 부분만. JS payload (모든 client-bound `.js` 파일) **gzip 후 ≤ 50KB** (Hero island + GP 그리드 island 합산, Brotli 측정값은 별도 기록만)
- [ ] **AC-7** `/live/[session_key]` — Astro shell + `<LiveScreen client:only="react" />`. shell HTML < 5KB, React bundle lazy
- [ ] **AC-8** `/replay/[session_key]` — Astro shell + `<ReplayScreen client:only="react" />`. shell HTML < 5KB
- [ ] **AC-9** TypeScript strict 통과 (`pnpm typecheck` 0 errors)
- [ ] **AC-10** 3종 화면 플랜의 모듈 디렉터리 (`src/main/`, `src/dashboard/`, `src/map/`, `src/live/`, `src/replay/`) 가 그대로 작동

### Data Pipeline (Live) — v2: Cache API 주축

- [ ] **AC-11** Pages Function `/api/live/[endpoint]` 핸들러: 쿼리 `session_key`, `since` 파라미터 받음. **Cache API 적중 시 ≤ 30ms response (edge cache)**, miss 시 ≤ 500ms (OpenF1 호출 포함). `unstable_dev`가 아닌 `wrangler pages dev --remote` 로 실측
- [ ] **AC-12** **Cache API (`caches.default`) + bucket-aligned cache key.** Cache key URL에 `bucket={Math.floor(Date.now() / ENDPOINT_BUCKET[endpoint]) * ENDPOINT_BUCKET[endpoint]}` 쿼리 파라미터 포함. Endpoint별 bucket size = docs §3.1 cadence 정확히 일치 (location/position 10s, race_control/intervals 15s, laps/pit 30s, stints/weather 60s). 모든 클라이언트가 같은 bucket에 들어오면 같은 cache key → 100% cache hit within bucket. Bucket 전환 시점에만 1회 OpenF1 호출. write 쿼터 미해당 (KV 미사용).
- [ ] **AC-12c** **클라이언트 측 bucket-aligned polling cadence.** [apps/web/src/map/LiveDataSource.ts](../../apps/web/src/map/LiveDataSource.ts) 가 endpoint별 polling을 `setTimeout(poll, nextBucket - now + 100ms)` 패턴으로 정렬. 모든 클라이언트가 0/10/20/30s 정각 (+ 100ms 마진) 에 폴 → bucket 첫 클라이언트만 miss → 후속 폴 전부 hit. 단위 테스트: 10 가상 클라이언트 1분 시뮬레이션 → 클라이언트당 OpenF1 fetch는 정확히 endpoint cadence (location 6번, weather 1번) 일치
- [ ] **AC-12d** **Same-isolate thundering herd 방어 (in-memory).** Bucket 전환 시점에 같은 PoP 안의 N 동시 cache miss → 각 isolate 내 `Map<cacheKey, Promise<Response>>` 으로 in-flight fetch dedup. 같은 isolate에서 두 번째 요청은 첫 fetch Promise를 await → OpenF1 호출은 isolate당 1회로 합쳐짐. **KV write 미사용** (KV 한도 보존). Cross-isolate / cross-PoP race window는 cache.put 완료 전 ~50-200ms 윈도우에 한정 → 실 OpenF1 호출은 worst-case isolate count × PoP count × bucket transitions ≈ docs cadence × 2-3 (50-80 req/min). OpenF1 429 발생 시 KV fallback (last-known-good)으로 graceful degrade. 단위 테스트: 1 bucket 전환 시 같은 isolate에 동시 100 요청 → OpenF1 fetch 1회 검증.
- [ ] **AC-12e** **OpenF1 429 graceful handling.** OpenF1가 30 req/min 한도 초과로 429를 반환하면 (a) 즉시 KV `LIVE_FALLBACK`에서 last-known-good 응답 + `X-Soonboard-Source: kv-fallback-429` 헤더 (b) `X-Soonboard-Stale-Reason: rate_limited` 메타 추가 (c) 클라이언트는 다음 bucket까지 대기 (자체 backoff 불필요, polling cadence 그대로). 동접 폭증 시에도 자연 회복.
- [ ] **AC-12b** **KV는 last-known-good fallback에 한정.** OpenF1 응답 실패 시(429/5xx/timeout) `LIVE_FALLBACK` KV에서 가장 최근 성공 응답 반환. KV write는 endpoint × session_key 당 **최소 120s 간격으로 throttle** (writes/session = 8 endpoint × 30/hr × 2hr = 480/세션). 1k/day 한도의 48%.
- [ ] **AC-13** **(Logic test, not load test)** `vitest` + `@cloudflare/workers-types` mock으로 Pages Function 핸들러 로직 검증:
  - cache hit 분기에서 OpenF1 fetch 0회
  - cache miss 분기에서 OpenF1 fetch 1회 + Cache API put 1회
  - OpenF1 500 응답 시 KV fallback 1회 read + 503 응답
  - throttled KV write가 60s 이내 중복 호출 시 write skip
- [ ] **AC-13b** **(Real-prod smoke)** Phase 6에서 실제 `<project>.pages.dev`에 배포 후 `scripts/smoke-live.ts` 실행: 10 클라이언트 simulator가 [live-streaming §3.1](../../docs/live-streaming-strategy.md) 의 cadence 그대로 (location/position 10s, race_control/intervals 15s, laps/pit 30s, stints/weather 60s) 8 endpoint 모두 폴 — 클라이언트당 분당 26 polls.
  - **OpenF1 outbound (SWR fan-out 핵심):** 동접 1명 = 26 req/min. **동접 10명 = 26 req/min (동일)**. 무료 30 req/min 한도의 **87%** 사용. 동접 수와 무관하게 일정함을 확인.
  - **Function invocations:** 10 클라이언트 × 26 polls/min × 60min = **15,600 invocations/hour**. 2시간 세션 = 31,200. Worker 100k/day의 31%. 동접 30명 2시간 세션 = 93,600 (한도 93%).
  - **Cache hit ratio 측정:** > 90% (10s s-maxage 안에서 클라이언트들 폴이 자주 hit). CF Analytics `Cache Status: HIT` ratio
- [ ] **AC-14** Pages Functions CPU time (CF Analytics dashboard 1시간 윈도우 측정): **P50 < 5ms, P95 < 8ms** (10ms free limit의 80% 이내). 초과 시 핸들러 로직 단순화 또는 fallback Option D 검토. Phase 6 게이트
- [ ] **AC-15** 라이브 표시 지연 측정: 클라이언트가 본 새 sample의 `date`와 **클라이언트의 monotonic clock** (`performance.now()` + 페이지 로드 시 `Date.now()` 동기 1회) 차이가 **표본 100건 평균 30~45s, P95 < 60s** ([live-streaming-strategy.md §2](../../docs/live-streaming-strategy.md)). 실 라이브 세션 부재 시 FastF1 historical replay → `scripts/replay-as-live.ts`로 OpenF1 응답을 시간 가속 없이 재생해 emulator로 사용

### Data Pipeline (Replay & Catalog)
- [ ] **AC-16** GitHub Actions workflow `.github/workflows/daily-catalog.yml` 매일 01:00 UTC 실행 → `data/seasons/{year}.json` 갱신 → PR 또는 직접 main commit
- [ ] **AC-17** Catalog 빌드 스크립트가 OpenF1 30 req/min 한도 안에서 4 시즌 모두 빌드 < **60min (GitHub Actions runner wall clock 측정, `time` 또는 workflow `started_at` ~ `completed_at`)**. 시즌당 ≤ 15분
- [ ] **AC-18** 리플레이 모드 클라이언트는 OpenF1 직접 호출 (Worker 우회). historical은 무료/익명이므로 NC 라이선스 OK. 클라이언트 측 `User-Agent` 헤더에 `SOON-BOARD/fan-project (https://soon-board.pages.dev)` 명시

### Design System
- [ ] **AC-19** [apps/web/src/design/tokens.ts](../../apps/web/src/design/tokens.ts) 가 spec의 토큰 그대로 export. `tailwind.config.ts`가 이를 import해 단일 진실 원천 유지
- [ ] **AC-20** 폰트 self-host: [apps/web/public/fonts/](../../apps/web/public/fonts/) 에 **Orbitron(400/700/900) + Orbit (400/700) + JetBrains Mono(400/500)** woff2. (사용자 확인: [Orbit](https://fonts.google.com/specimen/Orbit) 은 Google Fonts에 실재. Designer: Studio Triple. spec의 폰트 결정 그대로 유지)
- [ ] **AC-20b** **폰트 총 크기 예산: `apps/web/public/fonts/` ≤ 1.0MB** (Orbitron 3 weights ~150KB + Orbit 2 weights ~한글 subset 따라 가변, latin+korean subset ≤ ~700KB 가정 → 빌드 시 실측 + lock + 한계 초과 시 unicode-range 분리). JetBrains Mono 2 weights ~80KB. 총 ≤ 1MB 보수 추정. 빌드 시 fonts.lock.json에 실측치 기록
- [ ] **AC-21** [apps/web/src/design/Logo.tsx](../../apps/web/src/design/Logo.tsx) — "SOON BOARD"에서 "ON"(인덱스 2,3) 만 `fill="#E10600"`. 시각 회귀 baseline 1개
- [ ] **AC-22** WCAG AA contrast: 페이지 배경 `#0A0A0F` vs `#F5F5F0` 텍스트 명도비 ≥ 16.5:1, `#E10600` 액센트 vs `#0A0A0F` ≥ 5.36:1 (큰 글씨 AAA)
- [ ] **AC-23** Team color contrast 보정: OpenF1 `team_colour` 응답을 darkness 검사 → `getRelativeLuminance(hex) < 0.05` 일 때 흰색 1px outline 자동 추가 ([apps/web/src/design/teamColorContrast.ts](../../apps/web/src/design/teamColorContrast.ts))

### Brand & Attribution
- [ ] **AC-24** 페이지 푸터(모든 라우트): "Data: OpenF1 (CC BY-NC-SA 4.0) · Tracks: julesr0y/f1-circuits-svg (CC BY 4.0) · Unofficial, not affiliated with Formula 1, FIA, or FOM."
- [ ] **AC-25** [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md) 에 OpenF1 + julesr0y 라이선스 전문 + 소스 URL
- [ ] **AC-26** favicon (32×32, 180×180, 512×512) + OG image (1200×630) 정적 자산 [apps/web/public/](../../apps/web/public/) 에 커밋
- [ ] **AC-27** `<head>`의 `<meta name="description">`, `<meta property="og:*">` 가 메인/라이브/리플레이 각각 다르게

### Testing & CI
- [ ] **AC-28** `pnpm test` (Vitest) → 단위 테스트 0 fail
- [ ] **AC-29** `pnpm test:visual` (Playwright) → 시각 회귀 9 baseline (메인 4 + 대시보드 3 + 라이브 맵 2) 0 diff
- [ ] **AC-30** `.github/workflows/ci.yml` — PR/main push에 typecheck + unit + 빌드 검증 < 5min
- [ ] **AC-31** Cloudflare Pages "Preview deployments" PR마다 자동, 댓글에 URL 노출

---

## 3. Implementation Steps

### Phase 0: 모노레포 + 기본 구조 + Pre-flight 검증 (1.5일)

#### 0.1 pnpm workspace 초기화 (v2.1 — workspace 명시)
- 파일: [pnpm-workspace.yaml](../../pnpm-workspace.yaml), [package.json](../../package.json)
- **`pnpm-workspace.yaml` 정확한 내용:**
  ```yaml
  packages:
    - "apps/*"
    - "scripts"
  ```
  (`scripts/`는 **단일 package**이며 자체 [scripts/package.json](../../scripts/package.json) 필요 — `name: "@soon-board/scripts"`, type: module, vitest devDep)
- 루트 `package.json`에 공유 dev-deps (typescript, vitest, playwright, eslint, prettier) + 워크스페이스 명령 alias:
  ```json
  "scripts": {
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm --filter web build",
    "probe:openf1": "pnpm --filter @soon-board/scripts run probe:openf1",
    "check:trademark": "pnpm --filter @soon-board/scripts run check:trademark"
  }
  ```
- 검증: `pnpm install` 성공, `pnpm typecheck` (빈 상태) 통과, `pnpm --filter @soon-board/scripts test --grep empty-response` 가 워크스페이스를 정확히 인식

#### 0.2 TypeScript + Tooling
- [tsconfig.base.json](../../tsconfig.base.json) (strict, ESNext, bundler), 각 패키지가 extends
- [.eslintrc.json](../../.eslintrc.json), [.prettierrc](../../.prettierrc)
- [.gitignore](../../.gitignore) (이미 `chore: .gitignore` 커밋 있음 — 추가 항목만 보강: `apps/*/dist/`, `apps/*/.astro/`, `.wrangler/`)
- 검증: AC-1, AC-9 (빈 상태)

#### 0.3 GitHub Actions CI 골격 + Playwright Docker pinning
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — PR/main: pnpm install → typecheck → test → build
- **`container: mcr.microsoft.com/playwright:v1.48.0-jammy`** 명시 (시각 회귀 baseline 안정성 위해 OS/브라우저 폰트 렌더 고정)
- 검증: AC-30, AC-31 (빈 단계라도 그린)

#### 0.4 Pre-flight #1: OpenF1 reachability probe (Cloudflare egress 차단 검출)
- [scripts/probe-openf1.ts](../../scripts/probe-openf1.ts) — 최소 Pages Function 1개를 임시 배포해 Cloudflare egress IP에서 OpenF1 호출 성공 확인
  - `fetch('https://api.openf1.org/v1/sessions?year=2024', { headers: { 'User-Agent': 'SOON-BOARD/fan-project +https://soon-board.pages.dev' } })`
  - 200 + non-empty array assertion
  - 차단 검출 시: User-Agent 변경 / `Origin` 헤더 시도 / OpenF1 maintainer에게 contact 결정
- 검증: AC-5b (Phase 2 진입 전 hard gate)

#### 0.5 Pre-flight #2: Trademark contamination 가드
- [scripts/check-trademark-files.ts](../../scripts/check-trademark-files.ts) — repo 전체에서 `Formula1-*` 패턴 파일 검색 (font, 이미지, 로고 PSD 등)
- CI workflow에 step 추가: 매치 발견 시 `exit 1`
- README에 명시: "F1 trademarked assets (Formula1 typeface, F1 logo) must NOT be committed to this repo for license compliance"
- 검증: AC-5c (PR마다)

---

### Phase 1: Astro 앱 스캐폴딩 (1일)

#### 1.1 Astro + React + Tailwind 설치 (v2.1 — Astro adapter blocker 해결)
- [apps/web/package.json](../../apps/web/package.json) — `astro@^4`, `@astrojs/react`, `@astrojs/cloudflare`, `@astrojs/tailwind`, `react@^18`, `react-dom@^18`
- [apps/web/astro.config.mjs](../../apps/web/astro.config.mjs):
  - **`output: 'hybrid'`** (Critic blocker 수정 — `static`은 `@astrojs/cloudflare` adapter와 비호환. hybrid는 각 페이지를 기본 prerender하되 명시적 opt-out 가능 + adapter가 `functions/`를 1급 인식)
  - `adapter: cloudflare()`
  - `integrations: [react(), tailwind()]`
- **Prerender 명시 (필수, 모든 페이지):**
  - `apps/web/src/pages/index.astro` → 파일 상단 `export const prerender = true` (정적 메인)
  - `apps/web/src/pages/live/[session_key].astro` → `export const prerender = true` (shell만 정적 HTML 산출, React island가 클라이언트에서 동적 처리)
  - `apps/web/src/pages/replay/[session_key].astro` → `export const prerender = true`
- Pages Functions 라우트(`/api/live/*`)는 `apps/web/functions/`에서 별도 처리 — adapter와 무관, Cloudflare Pages가 native하게 인식
- [apps/web/tailwind.config.ts](../../apps/web/tailwind.config.ts) — `tokens.ts` import
- [apps/web/public/_headers](../../apps/web/public/_headers) — Cloudflare Pages 자동 적용. 최소 정책:
  ```
  /*
    Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; font-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.openf1.org; frame-ancestors 'none'
    Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
    Referrer-Policy: same-origin
    X-Content-Type-Options: nosniff
  ```
  - `unsafe-inline`은 Tailwind 초기엔 필요 (CSS-in-JS dynamic styles). 후속 PR에서 nonce 기반으로 hardening
- 검증: `pnpm --filter web dev` 로컬 서버 → `/`에 빈 페이지. `pnpm --filter web build` → `dist/live/[session_key]/index.html`이 정적 shell HTML, `dist/_worker.js` (adapter SSR fallback, 본 plan에선 사용 안 함) 둘 다 산출 확인. Pages Functions은 빌드 후 `dist/_functions/api/live/[endpoint].js`로 산출

#### 1.2 디자인 토큰 모듈
- [apps/web/src/design/tokens.ts](../../apps/web/src/design/tokens.ts) — spec §Technical Context의 객체 그대로
- [apps/web/src/design/globals.css](../../apps/web/src/design/globals.css) — CSS reset (modern), `@layer base` 에 토큰 변수 export (`--color-bg-base`, …), `font-feature-settings: 'tnum'` 전역
- [apps/web/src/design/fonts.css](../../apps/web/src/design/fonts.css) — `@font-face` self-host 선언
- 검증: AC-19, AC-22 (자동: contrast 계산 단위 테스트)

#### 1.3 폰트 self-host (v2.2 — Orbit 확정, spec 그대로 유지)
- 스크립트: [scripts/fetch-fonts.ts](../../scripts/fetch-fonts.ts) — 다음 3개 폰트를 Google Fonts CSS API에서 woff2 URL 파싱 → 다운로드 → [apps/web/public/fonts/](../../apps/web/public/fonts/) 저장
  - **Orbitron** (400 / 700 / 900) — 영문 워드마크 + UI. 총 ~150KB
  - **Orbit** (400 / 700) — 한글. [Google Fonts 등록 확인](https://fonts.google.com/specimen/Orbit). Designer: Studio Triple. SIL OFL 1.1. 한글 subset (`subset=korean`) 사용. 총 ~700KB 예상 (빌드 시 실측)
  - **JetBrains Mono** (400 / 500) — 데이터 숫자. 총 ~80KB
- 빌드 시 hash + 파일명 + 실측 크기를 `apps/web/public/fonts/fonts.lock.json`에 기록 (재현성 + AC-20b 검증)
- [apps/web/src/design/fonts.css](../../apps/web/src/design/fonts.css) `@font-face` declarations 자동 생성, `font-display: swap` + `unicode-range: U+AC00-D7AF, U+1100-11FF, U+3130-318F` (한글) 명시
- **빌드 시 폰트 크기 assertion**: 총합이 1.0MB 초과 시 build warn (1.5MB 초과 시 fail)
- **`font-family` 토큰 갱신:** `tokens.ts`의 `font.family.body`를 `['Orbitron', 'Orbit', 'system-ui', 'sans-serif']` (spec 그대로)
- 검증: AC-20, AC-20b

#### 1.4 SOON BOARD 워드마크 컴포넌트
- [apps/web/src/design/Logo.tsx](../../apps/web/src/design/Logo.tsx) — `<svg viewBox="0 0 480 80">` 내부에 spec §SOON BOARD 워드마크 사양의 `<text>` 그대로
- Storybook 없이 [apps/web/src/pages/__design.astro](../../apps/web/src/pages/__design.astro) (dev only) 에 토큰 + 워드마크 미리보기
- 검증: AC-21 (Playwright 단일 baseline)

#### 1.5 라우트 골격 + 푸터
- [apps/web/src/pages/index.astro](../../apps/web/src/pages/index.astro) — 메인 페이지 placeholder
- [apps/web/src/pages/live/[session_key].astro](../../apps/web/src/pages/live/[session_key].astro)
- [apps/web/src/pages/replay/[session_key].astro](../../apps/web/src/pages/replay/[session_key].astro)
- [apps/web/src/design/Footer.astro](../../apps/web/src/design/Footer.astro) — AC-24의 attribution 문자열
- [apps/web/src/layouts/BaseLayout.astro](../../apps/web/src/layouts/BaseLayout.astro) — `<head>` (meta, fonts.css), `<Footer />`
- 검증: AC-7, AC-8, AC-24

---

### Phase 2: Pages Functions 라이브 프록시 (0.5일 — v2에서 대폭 축소)

#### 2.1 Pages Function endpoint
- [apps/web/functions/api/live/[endpoint].ts](../../apps/web/functions/api/live/[endpoint].ts) — Cloudflare Pages Function. 모듈 형식:
  ```ts
  export const onRequestGet: PagesFunction<Env> = async (ctx) => { ... }
  interface Env { LIVE_FALLBACK?: KVNamespace; }
  ```
- 빌드 시 Astro의 `@astrojs/cloudflare` 어댑터가 자동으로 `functions/`를 `_worker.js`로 통합 (또는 wrangler가 native Pages Function으로 인식 — Astro 설정에 따라)
- KV binding은 Cloudflare Pages dashboard에서 `LIVE_FALLBACK` namespace 연결 (1회 수동)

#### 2.2 SWR 로직 (v2.3 — bucket-aligned cache key + thundering herd 방어)

**Critic 지적 (v2.1):** `caches.default`는 `stale-while-revalidate` 헤더를 자동 honor 안 함 — 핸들러 코드에서 명시적 stale 판정 + `ctx.waitUntil(refresh)` 필요.

**사용자 지적 (v2.3):** Cache-Control 단독으로는 클라이언트별 cache window 어긋남 발생 → 같은 데이터에 분당 6회 이상 OpenF1 호출 가능. **Bucket-aligned cache key**로 모든 클라이언트가 같은 cache entry 조회.

- 입력: `GET /api/live/:endpoint?session_key=&since=`
- **Endpoint별 bucket size (docs §3.1 cadence 정확히 일치):**
  ```ts
  const ENDPOINT_BUCKETS: Record<string, number> = {
    location:     10_000,
    position:     10_000,
    race_control: 15_000,
    intervals:    15_000,
    laps:         30_000,
    pit:          30_000,
    stints:       60_000,
    weather:      60_000,
  };
  ```
- **Bucket-aligned cache key + 3-단계 분기 (fresh → stale → miss):**
  ```ts
  const bucketMs = ENDPOINT_BUCKETS[endpoint] ?? 10_000;
  const bucket = Math.floor(Date.now() / bucketMs) * bucketMs;
  const cacheKeyUrl = new URL(ctx.request.url);
  cacheKeyUrl.searchParams.set('bucket', String(bucket));
  const cacheKey = new Request(cacheKeyUrl.toString(), ctx.request);

  const FRESH_MS = bucketMs;        // bucket 내 무조건 fresh
  const STALE_MS = bucketMs * 3;    // 그 이후 2× bucket 동안 stale-while-revalidate
  const cache = caches.default;
  const cached = await cache.match(cacheKey);

  if (cached) {
    const generatedAt = Number(cached.headers.get('X-Soonboard-Generated-At') ?? 0);
    const age = Date.now() - generatedAt;

    if (age < FRESH_MS) {
      // Fresh hit: 즉시 응답
      return cached;
    }
    if (age < STALE_MS) {
      // Stale hit: 즉시 응답 + 백그라운드 refresh
      ctx.waitUntil(refreshAndCache(ctx, cacheKey, cache, endpoint));
      return withHeader(cached, 'X-Soonboard-Source', 'stale');
    }
    // Too stale → miss로 처리
  }

  // Cache miss or too-stale: same-PoP thundering herd 방어 + synchronous fetch
  return await fetchWithLock(ctx, cacheKey, cache, endpoint);
  ```
- **`fetchWithLock()` — same-isolate thundering herd 방어 (v2.3 in-memory Map, KV 미사용):**
  ```ts
  // Module-level (isolate-scoped, GC가 evict하기 전까지 유지)
  const IN_FLIGHT = new Map<string, Promise<Response>>();

  async function fetchWithLock(ctx, cacheKey, cache, endpoint) {
    const key = cacheKey.url;
    const existing = IN_FLIGHT.get(key);
    if (existing) {
      // 같은 isolate에서 동시 fetch 진행 중 — 그 Promise 공유 (OpenF1 호출 합쳐짐)
      return (await existing).clone();
    }
    const promise = refreshAndCache(ctx, cacheKey, cache, endpoint).finally(() => {
      IN_FLIGHT.delete(key);
    });
    IN_FLIGHT.set(key, promise);
    return (await promise).clone();
  }
  ```
  **특성:**
  - KV write 0 (한도 보존)
  - 같은 isolate 내 100 동시 요청 = OpenF1 fetch 1회
  - Cross-isolate / cross-PoP: race window ~50-200ms (cache.put 완료 전) 동안 중복 fetch 가능. Worst case worker per-PoP isolate count(~수 개) × PoP count(요청 분포) → docs cadence의 2-3배 OpenF1 호출 가능. 30 req/min 한도 초과 시 AC-12e의 429 graceful 동작
- `refreshAndCache()` 구현:
  ```ts
  async function refreshAndCache(ctx, cacheKey, cache) {
    try {
      const upstream = await fetch(`https://api.openf1.org/v1/${endpoint}?${params}`, {
        headers: { 'User-Agent': 'SOON-BOARD/fan-project +https://soon-board.pages.dev' },
        cf: { cacheTtl: 0 }   // 우리가 명시적으로 캐시 관리
      });
      if (!upstream.ok) throw new Error(`OpenF1 ${upstream.status}`);
      const body = await upstream.text();
      const response = new Response(body, {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=10',    // CDN/브라우저 힌트만, 진짜 SWR은 위 코드가 담당
          'X-Soonboard-Generated-At': String(Date.now()),
          'X-Soonboard-Source': 'origin',
        }
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      ctx.waitUntil(maybeWriteFallback(ctx.env.LIVE_FALLBACK, cacheKey, body));
      return response;
    } catch (err) {
      // OpenF1 실패 → KV fallback
      const fallback = await ctx.env.LIVE_FALLBACK?.get(cacheKey.url);
      if (fallback) {
        return new Response(fallback, {
          headers: { 'Content-Type': 'application/json', 'X-Soonboard-Source': 'kv-fallback' }
        });
      }
      return new Response(JSON.stringify({ error: 'upstream_unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', 'X-Soonboard-Source': 'error' }
      });
    }
  }
  ```
- `maybeWriteFallback()` — **120s throttle (v2.3 — KV 1k/day 한도 보존):**
  ```ts
  const LAST_KV_WRITE = new Map<string, number>();   // isolate-local
  async function maybeWriteFallback(kv, cacheKey, body) {
    if (!kv) return;
    const k = cacheKey.url;
    const last = LAST_KV_WRITE.get(k) ?? 0;
    if (Date.now() - last < 120_000) return;         // skip — 120s 안 중복 차단
    LAST_KV_WRITE.set(k, Date.now());
    await kv.put(k, body, { expirationTtl: 3600 });
  }
  ```
  → 8 endpoint × 30/hr × 2hr = 480 writes/session/PoP = 한도 1k/day의 48% 사용
- 검증: AC-11, AC-12 (bucket-aligned key), AC-12b (120s KV throttle), AC-12c (client-side aligned polling), AC-12d (in-memory thundering herd dedup), AC-12e (429 graceful), AC-14

#### 2.3 핸들러 로직 테스트 (logic-only, not load test)
- [apps/web/src/functions/__tests__/live-endpoint.test.ts](../../apps/web/src/functions/__tests__/live-endpoint.test.ts) — Vitest + `@cloudflare/workers-types` 모의 객체:
  - Cache hit branch: OpenF1 fetch 0회 검증
  - Cache miss + OpenF1 200: fetch 1회, Cache.put 1회
  - Cache miss + OpenF1 500 + KV fallback 존재: fetch 1회, KV.get 1회, 200 응답 with fallback 헤더
  - Cache miss + OpenF1 500 + KV miss: 503 응답
  - 60s 내 중복 호출 시 KV.put skip
- 검증: AC-13

#### 2.4 실제 prod smoke (Phase 6.3로 미룸)
- 실 배포된 Pages Function에 10 클라이언트 polling × 60min 실행
- Cloudflare Analytics에서 OpenF1 outbound + Functions invocation 모니터
- 검증: AC-13b

#### 2.5 보안 헤더 (CORS 불필요 — same-origin)
- Pages Function 응답에 `X-Content-Type-Options: nosniff`, `Cache-Control` (위 §2.2 그대로). CORS 헤더 없음 (`/api/live/*`는 같은 도메인이므로)
- Rate limit은 free tier Pages Functions에 자체 미내장 → CF dashboard의 "Bot Fight Mode" 활성화로 대신
- 검증: AC-31

---

### Phase 3: 메인 페이지 (3일) — main-page-implementation.md 통합

#### 3.1 시즌 카탈로그 빌드 스크립트
- [scripts/fetch-season-catalog.ts](../../scripts/fetch-season-catalog.ts) — main-page-implementation.md §3.1 그대로 구현
- 출력: [apps/web/src/data/seasons/](../../apps/web/src/data/seasons/) 에 `2023.json` ~ `2027.json`
- 25 req/min 스로틀 (`p-limit` 또는 자체 token bucket)
- 검증: AC-2 (크기), AC-17 (시간)

#### 3.2 GitHub Actions: daily-catalog (v2 — empty-response guard 추가)
- [.github/workflows/daily-catalog.yml](../../.github/workflows/daily-catalog.yml) — cron `0 1 * * *` (01:00 UTC, OpenF1 자정 갱신 1h 후)
- pnpm install → fetch-season-catalog.ts → `git diff` 확인 → 변경 있으면 commit + push (PR 옵션은 후속)
- **Empty-response guard (Architect 위험 #6):** 빌드 스크립트가 OpenF1에서 빈 응답/에러를 받으면 (a) 기존 JSON 유지 (덮어쓰기 금지) (b) workflow가 fail 처리 (c) GitHub Action 알림. 빈/에러 응답이 main에 commit되는 것을 차단
- 검증: AC-16

#### 3.3 catalogStore + uiStore
- [apps/web/src/main/stores/catalogStore.ts](../../apps/web/src/main/stores/catalogStore.ts) — Zustand
- [apps/web/src/main/stores/uiStore.ts](../../apps/web/src/main/stores/uiStore.ts) — URL sync (search params)
- 검증: main-page-implementation.md §11 인수 11번 (URL 보존)

#### 3.4 메인 페이지 React island
- [apps/web/src/main/MainPage.tsx](../../apps/web/src/main/MainPage.tsx) — `client:load` (또는 `client:visible`로 grid는 lazy)
- 하위 컴포넌트: `Hero`, `SeasonPicker`, `GpGrid`, `GpCard`, `ExpandedSessions`, `SessionCard`, `StatusBadge`, `Countdown`, `SearchFilter`, `ResultPreviewTooltip`
- 모두 main-page-implementation.md §10 구조 그대로
- 검증: main-page-implementation.md §11 인수 전체

#### 3.5 메인 페이지 시각 회귀
- Playwright: 4 baseline (past-only / live-active / upcoming-only / cancelled)
- 검증: AC-29 (4/9)

---

### Phase 4: 라이브 맵 (5일) — live-map-implementation.md 통합

#### 4.1 트랙 outline 빌드 파이프라인
- [scripts/fetch-circuit-maps.ts](../../scripts/fetch-circuit-maps.ts) — julesr0y SVG fetch + polyline 추출 (live-map §1.3.1)
- [scripts/extract-openf1-transform.ts](../../scripts/extract-openf1-transform.ts) — affine transform 추출 (live-map §1.3 step 6)
- [scripts/trace-pitlane.ts](../../scripts/trace-pitlane.ts) (live-map §1.3.2)
- [scripts/derive-sector-boundaries.ts](../../scripts/derive-sector-boundaries.ts) (live-map §1.3.3)
- [scripts/derive-drs-zones.ts](../../scripts/derive-drs-zones.ts) (live-map §1.3.4)
- [scripts/load-slm-zones.ts](../../scripts/load-slm-zones.ts) (live-map §1.3.5)
- 출력: [apps/web/src/map/trackOutlines/](../../apps/web/src/map/trackOutlines/)
- 검증: live-map §9 인수 9번 (크기), 14번 (섹터), 15번 (DRS), 16번 (SLM)

#### 4.2 `src/map/` 코어 모듈
- live-map-implementation.md §7 디렉터리 구조 그대로 (`LiveMapRenderer.ts`, `DataSource.ts`, `LiveDataSource.ts`, `ReplayDataSource.ts`, `PerDriverBuffer.ts`, `pathProjection.ts`, `arcLength.ts`, `interpolation.ts`, …)
- 단, `LiveDataSource.ts`는 OpenF1 직접 호출 대신 **Pages Function `/api/live/*` endpoint** 호출로 통합
- **(v2.3 추가) Bucket-aligned polling cadence** — `LiveDataSource` 가 endpoint별로 다음과 같이 폴 스케줄링:
  ```ts
  function alignedPoll(endpoint: keyof typeof ENDPOINT_BUCKETS) {
    const interval = ENDPOINT_BUCKETS[endpoint];
    const now = Date.now();
    const nextBucket = Math.ceil(now / interval) * interval;
    const delay = nextBucket - now + 100;  // +100ms 마진 (bucket 경계 직후, 서버 측 bucket entry가 안정화될 시간)
    setTimeout(() => {
      void fetchEndpoint(endpoint).finally(() => alignedPoll(endpoint));
    }, delay);
  }
  ```
  → 모든 클라이언트가 0/10/20/30s + 100ms 정각에 폴 → bucket entry 첫 클라이언트만 cache miss → 같은 bucket의 후속 클라이언트 폴은 100% hit. **AC-12c 인수 기준.**
- 검증: live-map §9 전체

#### 4.3 시각 회귀
- 2 baseline (live + replay)
- 검증: AC-29 (6/9)

---

### Phase 5: 대시보드 (5일) — dashboard-implementation.md 통합

- dashboard-implementation.md §6 디렉터리 구조 그대로
- DataSource 확장 (getLatestBefore, getAllBefore, getCompletedLapsBefore, ...) — dashboard §4.2
- 라이브 화면 컨테이너 [apps/web/src/live/LiveScreen.tsx](../../apps/web/src/live/LiveScreen.tsx) 가 LiveMap + Dashboard 결합
- 리플레이 화면 컨테이너 [apps/web/src/replay/ReplayScreen.tsx](../../apps/web/src/replay/ReplayScreen.tsx)
- 카운트다운 오버레이 [apps/web/src/live/CountdownOverlay.tsx](../../apps/web/src/live/CountdownOverlay.tsx) — main-page §5
- 검증: dashboard §8 전체, 3 baseline (Phase 4와 합쳐 AC-29 9/9)

---

### Phase 6: 최종 통합 + 배포 검증 (2일)

#### 6.1 Cloudflare Pages 프로젝트 생성 + Functions binding
- GitHub repo 연결 → Build command `pnpm --filter web build`, Build output `apps/web/dist`, Root dir `.`
- **KV namespace `LIVE_FALLBACK` 생성 + Pages Functions binding 등록** (CF dashboard, 1회 수동)
- 환경변수 0개
- Preview deployments PR마다 자동
- 검증: AC-3, AC-4, AC-31

#### 6.2 ~~Worker 배포~~ → 통합됨 (v2)
- Pages Functions는 `apps/web/functions/`가 빌드에 자동 포함되어 별도 배포 불필요
- `pnpm --filter web build` 1번으로 메인 + Functions 모두 산출

#### 6.3 End-to-end 검증 (real-prod smoke)
- 라이브 시뮬레이션: `scripts/smoke-live.ts`로 10 가상 클라이언트 × 60min × 8 endpoint 폴(docs §3.1 cadence 그대로) → CF Analytics에서 **OpenF1 outbound ≤ 26 req/min** (한도 30/min의 87%) + Functions CPU P50 < 5ms / P95 < 8ms 확인
- 실제 라이브 세션 부재 시: `scripts/replay-as-live.ts`로 2024 Bahrain Race를 시간 가속 없이 재생 → "live emulator" 데이터를 OpenF1 응답인 양 Pages Function에 주입 (지연 비교 가능)
- 리플레이: 2024 Bahrain GP Race → 시크 / 배속 변경 (클라이언트 직접 OpenF1 호출)
- 검증: AC-13b, AC-14, AC-15

#### 6.4 라이선스 점검
- THIRD_PARTY_LICENSES.md 완성
- 모든 페이지 푸터 attribution 시각 회귀로 확인
- README.md 에 "Unofficial fan project" 명시
- 검증: AC-24, AC-25

---

## 4. Verification Steps

각 Phase 종료 시 명시적 게이트 통과 확인:

| Phase | 게이트 | 명령 |
|---|---|---|
| 0 | 워크스페이스 install + typecheck + OpenF1 probe + trademark guard | `pnpm install && pnpm typecheck && pnpm probe:openf1 && pnpm check:trademark` |
| 1 | Astro dev 서버 + 워드마크 시각 회귀 + 정적 prerender 산출물 | `pnpm --filter web dev` + `pnpm test:visual --grep wordmark` + `pnpm --filter web build && ls dist/live/[session_key].html` |
| 2 | Pages Functions logic test | `pnpm --filter web test --grep live-endpoint` |
| 3 | 메인 페이지 시각 회귀 4종 + catalog cron 빈 응답 가드 단위 테스트 | `pnpm test:visual --grep main` + `pnpm --filter @soon-board/scripts test --grep empty-response` |
| 4 | 라이브 맵 시각 회귀 2종 | `pnpm test:visual --grep map` |
| 5 | 대시보드 시각 회귀 3종 | `pnpm test:visual --grep dashboard` |
| 6 | Cloudflare Pages preview URL에서 E2E + smoke (CF Analytics) | `pnpm smoke:live` (실 deploy 대상) + CF dashboard 수동 확인 |

전체 인수 기준 33개 (v2에서 AC-5b, AC-5c, AC-12b, AC-13b 추가됨) 중 ≥ 30개 통과 시 Phase 6 종료. 미통과 항목은 후속 PR로.

---

## 5. Risks and Mitigations (v2 — Architect 검토 반영)

| 위험 | 영향 | 완화 |
|---|---|---|
| ~~KV writes 1k/day vs 5,760 writes/session~~ → **해결됨 (v2)** | — | **Cache API 주축으로 전환**. KV는 fallback only + 60s throttle → < 60 writes/day |
| ~~`*.pages.dev/api/live/*` route binding 불가~~ → **해결됨 (v2)** | — | **Pages Functions로 전환** (same-origin, route binding 불필요) |
| ~~prerender polarity 오류 (`= false`)~~ → **해결됨 (v2)** | — | **`export const prerender = true`** 명시 (shell static, island client-only) |
| Pages Functions 100k req/day 한도가 동접 ≥ 30명에서 초과 | 라이브 폴 거부 | **구체 메커니즘 (v2.1):** (a) **CF Analytics GraphQL API** (`pagesFunctionsInvocationsAdaptiveGroups`) 를 매 5분 GitHub Actions cron으로 폴링 → `data/health/capacity.json` 에 직전 24h request count 기록. (b) Pages Function 자체가 시작 시 `LIVE_FALLBACK.get('capacity_state')` 읽어 `denied` 면 즉시 503 + "at capacity" 응답. (c) 한도 80% (80,000/day) 도달 시 GitHub Action이 `capacity_state=denied` 를 KV에 write → Function 자체 거부 모드로 전환. (d) UI는 503 + 헤더로 감지해 카운트다운 오버레이 표시. 구현: [apps/web/functions/api/live/[endpoint].ts](../../apps/web/functions/api/live/[endpoint].ts) 핸들러 prelude + [.github/workflows/capacity-check.yml](../../.github/workflows/capacity-check.yml). NC 운영이므로 유료 plan 전환 거부 |
| Cache API per-PoP 분산성 | 서로 다른 PoP의 사용자가 OpenF1 호출 추가 발생 (PoP × 호출) | 동접 시뮬레이션 시 같은 region 트래픽만 측정 (AC-13b). 글로벌 분산은 KV fallback이 보완 |
| `apps/web/public/fonts/Formula1-*.ttf` 등 trademark 자산 commit 위험 | F1/FOM 상표/저작권 침해 + NC 원칙 무력화 | **Phase 0.5 contamination guard** (AC-5c) — PR마다 패턴 검색, 매치 시 CI fail. `.gitignore`에 패턴 추가. README에 금지 사유 명시 |
| Cloudflare egress IP가 OpenF1에서 차단/UA 거부 | Pages Function이 모두 실패 → 라이브 비활성 | **Phase 0.4 reachability probe** (AC-5b) — Phase 2 진입 전 hard gate. 차단 시 UA 변경 또는 OpenF1 maintainer contact. 최종 fallback: 클라이언트 직접 호출 (NC 회색지대 명시) |
| GitHub Actions catalog cron이 OpenF1 에러/빈 응답을 main에 commit | seasons/{year}.json이 stale/빈으로 deploy → Pages 빌드 후 빈 카탈로그 | **Empty-response guard** (Phase 3.2): 스크립트가 빈/에러 응답 받으면 기존 JSON 유지, workflow fail. 빈 JSON commit 차단 |
| Playwright 시각 회귀 baseline이 OS/브라우저 폰트 렌더 차이로 불안정 | CI 깜빡임 | CI workflow에 **`container: mcr.microsoft.com/playwright:v1.48.0-jammy`** 명시 (Phase 0.3), 픽셀 임계치 0.5% 허용 |
| `scripts/load-slm-zones.ts` 의 `data/slm-zones-raw.json` 출처 불명 | FOM 자료 derive 시 NC 라이선스 누설 | live-map-implementation.md 미해결 §15-11 그대로 — Phase 4.1 SLM 빌드 전 사용자에게 출처 채널 재확인. 출처 불확실 시 SLM zone 표시 비활성 (placeholder만) |
| `unstable_dev` 기반 load test (AC-13)가 prod KV/Cache 동작 미반영 | 의미 없는 그린 → prod에서 한도 초과 | **AC-13을 logic test로 강등** + **AC-13b 실 prod smoke** 추가 (Phase 6.3, CF Analytics로 outbound 측정) |
| `output: 'static'` + `prerender = true`인데 Pages Function이 dynamic 요청 받음 | 빌드 또는 런타임 충돌 | Astro `static` output은 SSG only이지만 `functions/` 디렉터리는 별도 Cloudflare Pages 메커니즘으로 처리됨 (어댑터와 무관). Phase 1.1 빌드 검증에서 확인 |
| OpenF1 라이선스 변경(SA 조항 강화) | 본 plan의 비상업 운영도 침해 가능 | 정기 monitoring 절차 — 분기 1회 OpenF1 라이선스 페이지 diff 확인 (수동 issue로 트래킹) |
| Cloudflare 계정 ToS 위반으로 일방적 suspension | 사이트 다운 | **Migration plan documentation** (후속 PR): `docs/migration-fallback.md` 에 (a) Netlify/Vercel free tier 대체 매핑 (b) GitHub Pages + GitHub Actions cron 변형 — Architect의 steelman 옵션 (c) DNS 전환 절차 |
| 라이브 30s 표시 지연을 사용자가 "느리다"고 오해 | UX 신뢰 저하 | UI에 "LIVE -30s" 인디케이터 + 호버 시 "Streaming delayed by ~30s for stability" 툴팁 (live-streaming §8.3 stateBadges) |
| 모노레포가 솔로 개발에 과한 복잡도 | 빠른 변경 어려움 | v2에서 워크스페이스 1개(apps/web) + scripts/만 → workers/ 제거로 단순화 |

---

## 6. ADR (Architectural Decision Record)

### Decision (v2)
**Astro 4.x + React 18 Islands 위에 Cloudflare Pages + Pages Functions + Cache API 단일 스택을 두고, pnpm 워크스페이스(apps/web 단일 + scripts/) 모노레포로 운영한다.** OpenF1 라이브 모드는 Pages Function이 `caches.default` 기반 SWR로 fan-out하며 KV는 last-known-good fallback만 담당. 리플레이는 클라이언트 직접 호출. 모든 정적 자산(시즌 카탈로그, 트랙 outline, 폰트)은 빌드 타임에 커밋되어 Pages에서 서빙.

**v1 → v2.2 누적 차이:**
- 별도 `workers/live-proxy/` 패키지 제거 → Pages Functions로 통합 (배포 1 unit)
- KV 주축 → Cache API 주축 (write 쿼터 무관)
- KV는 fallback only (1k writes/day의 6% 이하 사용)
- 폰트는 **spec 그대로 Orbitron + Orbit + JetBrains Mono** (Orbit Google Fonts 실재 확인됨)
- Astro `output: 'hybrid'` + `prerender = true` 명시 (shell 정적, island client-only)
- 라이브 OpenF1 outbound 정확값: **26 req/min** (docs §3.1)

### Drivers
1. 운영비 $0/월 (Cloudflare free + GitHub free + .pages.dev 무료 도메인)
2. 라이브 동접 확장 가능성 (Worker가 OpenF1 폴을 단일화)
3. 메인 페이지 SEO + 라이브 부드러움 동시 달성 (Astro static + React island)

### Alternatives Considered
- **B: Pure React SPA (Vite) + Cloudflare Pages** — invalidated by driver #3 (SEO/payload)
- **C: Astro 단일 + 클라이언트 직접 폴링 (Worker 없음)** — invalidated by driver #2 (동접 확장)
- **D: Vercel + Firebase + Cloudflare CDN** — 사용자 Round 2에서 명시적 거부 후 Cloudflare 단일 채택
- **E: Durable Objects 유료 + 진짜 WebSocket** — invalidated by driver #1 (비용 $5/mo)

### Why Chosen
세 드라이버를 동시에 통과하는 유일한 옵션. 단일 클라우드 벤더로 운영 부담 최소화. Astro의 hybrid output이 메인(static) + 라이브/리플레이(island)를 하나의 빌드로 처리.

### Consequences (v2)
- **Pro:** 빌드 산출물 1 unit (Pages = SPA + Functions), 인프라 비용 0원, 라이선스 안전, Cache API write 쿼터 미해당
- **Con:** Cloudflare 벤더 락-인. Pages Functions 100k req/day 한도 도달 시 동접 ~30명에서 막힘 (비상업 원칙상 수용). Cache API per-PoP라 글로벌 분산 fan-out은 KV fallback에 의존
- **Future:**
  1. 비상업 원칙 유지하면서 더 큰 동접 필요 시 → OpenF1 derive를 GitHub Actions cron으로 옮겨 Cache API 의존도 ↓ (라이브 표시 지연 ~1분으로 늘어남, Architect steelman 옵션)
  2. Cloudflare ToS 위반 / 일방적 suspension 대비 → `docs/migration-fallback.md` (Netlify/Vercel/GHPages 매핑) 후속 PR

### Follow-ups (v2.2)
1. **Cloudflare 계정 생성** (사용자 1회 작업, Phase 6.1 전제) — free plan으로 회원가입 + 결제 정보 미등록 확인 (의도치 않은 Blaze 전환 차단)
2. Cloudflare Pages 프로젝트 생성 + GitHub repo 연결 (Phase 6.1) — 사용자 1회 작업
3. `LIVE_FALLBACK` KV namespace 생성 + Pages Functions binding 등록 (Phase 6.1) — CF dashboard
4. **[apps/web/.dev.vars.example](../../apps/web/.dev.vars.example)** 작성 — 로컬 Pages Functions dev (`wrangler pages dev`) 가 읽는 secrets 템플릿. 현재 secret 0개지만 향후 추가 시 reference 유지
5. OpenF1 reachability probe — Phase 0.4 hard gate
6. Trademark contamination guard — Phase 0.5 CI step
7. 시각 회귀 baseline 9개 생성 (Phase 1.4 + 3.5 + 4.3 + 5) — 단계별 누적
8. Real-prod smoke (AC-13b) — Phase 6.3, CF Analytics 모니터
9. `docs/migration-fallback.md` 후속 PR (Cloudflare ToS suspension 대비, Option D 변형 문서화)
10. SLM zone 출처 채널 재확인 — Phase 4.1 진입 전 사용자 컨펌
11. **CSP nonce 기반 hardening 후속 PR** — Phase 1.1의 `style-src 'self' 'unsafe-inline'` 을 nonce 기반으로 전환 (Tailwind 동적 스타일 호환 확인 필요)
12. **Capacity-denial workflow 구현** — `.github/workflows/capacity-check.yml` + Pages Function prelude에 KV `capacity_state` 체크 로직 추가
13. **(NEW v2.2) [docs/cloudflare-onboarding.md](../../docs/cloudflare-onboarding.md) 작성** — Cloudflare 처음 쓰는 사용자(본 프로젝트 운영자) 를 위한 step-by-step 가이드. 다음 섹션 포함:
    - **계정 생성 + 결제 정보 미등록 확인** (Spark 강제 회피)
    - **`wrangler` CLI 설치 + 로그인** (`pnpm dlx wrangler login`)
    - **Pages 프로젝트 생성 절차** (GitHub repo 연결 → 빌드 명령 → 환경변수 → preview deployments 활성화)
    - **Workers KV namespace 생성** (`wrangler kv:namespace create LIVE_FALLBACK`) + Pages dashboard에서 Functions binding 등록
    - **로컬 개발 환경** (`wrangler pages dev apps/web/dist --kv LIVE_FALLBACK` 명령, `.dev.vars` 패턴)
    - **Pages Functions 디렉터리 구조 + 라우트 규칙** (`apps/web/functions/api/live/[endpoint].ts` → `/api/live/<endpoint>`)
    - **모니터링: CF dashboard에서 Functions invocations / KV operations / Pages bandwidth 확인** + 한도 도달 시 알림 설정
    - **배포 / 롤백 / 사용자 정의 도메인** (`.pages.dev` 무료 vs custom domain DNS 절차)
    - **서빙(production) 가이드:** 빌드 산출물이 Pages CDN에서 어떻게 서빙되는지, Function 응답이 어떻게 캐싱되는지, 정적 자산 + Function 라우트 분기 규칙
    - **장애 대응:** OpenF1 다운 / KV 한도 초과 / Function CPU 초과 시 어떤 UI 동작이 발생하는지 + 어떤 dashboard 카운터를 봐야 하는지
    - **migration-fallback.md 와의 관계:** Cloudflare suspension 시 어떻게 다른 CDN으로 이전할 것인지
    - 작성 시점: **Phase 6.1 직전 또는 함께** (사용자가 실제로 CF 계정을 만들 때 동시에 진행)

---

## 7. 구현 우선순위 + 산정 (v2 — 총 ~17일 솔로 작업; Phase 2 -0.5일 감축, Phase 0 +0.5일 증가로 net 0)

| Phase | 범위 | 일수 | 의존성 |
|---|---|---|---|
| 0 | 모노레포 + tooling + **OpenF1 probe + trademark guard** | 1.5 | 없음 |
| 1 | Astro 스캐폴딩 + Orbitron/Orbit 폰트 + 디자인 토큰 + 로고 + `_headers` | 1 | 0 |
| 2 | **Pages Functions 라이브 프록시 (Cache API 주축)** | 0.5 | 0 |
| 3 | 메인 페이지 + GitHub Actions catalog (empty-response guard 포함) | 3 | 1 |
| 4 | 라이브 맵 (트랙 outline + 보간 + 렌더) | 5 | 1, 2 |
| 5 | 대시보드 + 라이브/리플레이 화면 | 5 | 1, 2, 4 |
| 6 | 통합 배포 + E2E + real-prod smoke + 라이선스 점검 | 2 | 모두 |

병렬 가능: Phase 2 (Pages Function) ‖ Phase 3 (메인) ‖ Phase 4 시작 부분(트랙 outline 빌드). 솔로 개발이면 순차, /team으로 병렬화 가능.

---

## 8. 명시적으로 본 plan의 스코프 밖

- 기존 3종 화면 플랜의 인수기준/위험 표 — 그쪽에 이미 있음. 본 plan은 그것을 상속만 함.
- 도메인 구입 (.com 등) — `.pages.dev` 서브도메인으로 충분
- Analytics (Plausible/Umami 등) — NC 원칙 위해 0
- 백엔드 데이터베이스 — Cloudflare D1/Firestore 사용 안 함 (사용자 계정/즐겨찾기 미지원)
- 모바일 앱 (PWA) — 후속
- 다국어 (i18n) — 한국어 라벨 + 영문 데이터만

---

## 9. Changelog

### 2026-05-20 v1 (Planner draft, deprecated)
- 초안 작성. Architect 검토 결과 REQUEST REVISION (7 항목).

### 2026-05-20 v2 (Architect 피드백 반영, Critic 검토 대기 중)

**Architect의 7 항목 + 부가 위험을 모두 반영:**

1. **AC-12 자기모순 해결** — 10s bucket × 60s TTL 문제 제거. Cache API (`caches.default`) 주축으로 전환, `s-maxage=10 stale-while-revalidate=20` 헤더. KV write 쿼터 무관.
2. **Worker route 토폴로지 수정** — `workers/live-proxy/` 별도 패키지 제거. **Pages Functions** (`apps/web/functions/api/live/[endpoint].ts`)로 통합. Same-origin → CORS 불필요.
3. **Trademark contamination 가드 추가** (AC-5c) — `Formula1-*` 파일 CI 검출 + fail. Phase 0.5 + `.gitignore` 보강.
4. **"Orbit" → Pretendard Variable** — Google Fonts 부재 확인 후 dead-code 제거. AC-20 단일 분기.
5. **prerender polarity 정정** — Phase 1.1에 `export const prerender = true` 명시. 위험 표에서 ✗ 표 행 폐기.
6. **AC-13 logic test로 강등** + **AC-13b real-prod smoke** 추가. `unstable_dev` 한계 명시.
7. **Phase 0.4 OpenF1 reachability probe** (AC-5b) — CF egress 차단 검출 hard gate.

**Architect의 부가 위험 반영:**
8. CI workflow에 **Playwright Docker container pin** (`mcr.microsoft.com/playwright:v1.48.0-jammy`)
9. Catalog cron에 **empty-response guard** (Phase 3.2) — 빈/에러 응답 main 차단
10. **`_headers` CSP + Permissions-Policy** (Phase 1.1) — 정적 사이트 최소 보안
11. **`docs/migration-fallback.md` 후속 PR** (Follow-ups #7) — Cloudflare suspension 대비
12. **SLM zone 출처 재확인** (Follow-ups #8) — NC 라이선스 누설 가능성 차단
13. **Verification 명령 표 갱신** — Phase 0/2 명령 변경 반영
14. **Phase 산정 표 갱신** — Phase 2 0.5일 감축, Phase 0 0.5일 증가, net 0

### 2026-05-21 v2.1 (Critic 피드백 반영, consensus 합의 완료)

**Critic의 8 개선 항목 + would-be-nice 3 항목 모두 반영:**

1. **(BLOCKER) Astro adapter mismatch 해결** — Phase 1.1을 `output: 'static'` → **`output: 'hybrid'`** 로 변경. `@astrojs/cloudflare` adapter는 hybrid에서 각 페이지의 `prerender = true` 명시를 1급 처리. 빌드 산출물 path 확인 명시 추가.
2. **(MAJOR) SWR 의미론 정정 (§2.2)** — `caches.default`는 `stale-while-revalidate` 헤더를 auto-honor 안 함. 핸들러 코드에 **3-단계 분기 (fresh / stale / miss)** + `ctx.waitUntil(refreshAndCache)` 명시 구현 추가. `X-Soonboard-Generated-At` 헤더 기반 staleness 판정.
3. **(MAJOR) Option D (steelman) 1차 alternative로 승격** — §1에 Option D (정적 + GitHub Actions cron snapshot publisher) 추가. Pros/Cons + Option A가 여전히 우위인 근거 (spec Round 7의 30s 표시 지연 결정) + Option D를 fallback 옵션으로 보존.
4. **Stale v1 prose 정리** — "Worker", "Orbit", "KV SWR TTL 8s" 잔재 3 군데 모두 v2 용어로 치환.
5. **AC numeric thresholds 강화** — AC-3 (CF 빌드 latency 제외), AC-6 (gzip 명시), AC-14 (P50 < 5ms, P95 < 8ms), AC-15 (표본 100건, monotonic clock, P95 < 60s), AC-17 (시즌당 ≤ 15분).
6. **Capacity-denial 메커니즘 구체화** — CF Analytics GraphQL polling + KV `capacity_state` + Function prelude 체크. 파일/주기/카운터 명시. AC-12 위험 항목에 반영.
7. **AC-20b 폰트 크기 예산 신설** — Pretendard **Variable → static 400/700** 로 전환 (1.3MB → 500KB), 총 fonts/ ≤ 1.8MB.
8. **Workspace 정의 명시** — `pnpm-workspace.yaml` 정확한 내용 + `scripts/package.json` (`@soon-board/scripts`) 패키지화. Phase 3.2 catalog cron 테스트 명령 정정.

**Would-be-nice 적용:**
9. `apps/web/.dev.vars.example` 후속 (Follow-ups #4)
10. Cloudflare 계정 생성을 Phase 6.1 prerequisite로 명시 (Follow-ups #1)
11. CSP `'self'` + `unsafe-inline` 초기 + nonce-based hardening 후속 (Follow-ups #11)
12. Capacity-denial workflow 구현 항목 (Follow-ups #12)

**상태:** Critic이 v2.1로의 개선을 요구한 8개 항목 모두 적용. Architect의 7 항목과도 일관됨. **합의 도달.**

### 2026-05-21 v2.2 (사용자 정정 반영, pending approval)

**사용자 지적 3 항목:**

1. **(중요) 라이브 모드 분당 req 계산 오류 정정** — v2.1에서 AC-13b에 "OpenF1 outbound ≤ 6 req/min" 으로 기술했으나, [docs/live-streaming-strategy.md §3.1](../../docs/live-streaming-strategy.md) 의 무료 플랜 폴링 예산은 **8 endpoint 합산 26 req/min** (무료 30 req/min 한도의 87%). 6 req/min은 `location` 단일 endpoint cadence였음. AC-13b를 정정:
   - OpenF1 outbound: **26 req/min** (동접 1명/10명/30명 모두 동일 — SWR fan-out의 핵심 의미)
   - Function invocations: 10 클라이언트 × 26 polls/min × 60min = 15,600/hr
   - **이 수치가 spec/docs의 결정과 일관됨** (사용자 요구 수준 유지)

2. **(중요) Orbit 폰트 Google Fonts에 실재 — Pretendard로 바꾼 결정 철회** — 사용자가 [https://fonts.google.com/specimen/Orbit](https://fonts.google.com/specimen/Orbit) 확인. spec의 폰트 결정 그대로 복원:
   - AC-20: Orbitron + **Orbit** + JetBrains Mono
   - AC-20b: 폰트 총 예산 ~1.0MB (Pretendard Variable 1.3MB보다 작음, build assertion 1.5MB)
   - Phase 1.3: Orbit subset=korean + `unicode-range` 분리

3. **(가이드) Cloudflare 가이드 문서 follow-up #13 추가** — 사용자가 Cloudflare 처음 쓰는 입장에서 step-by-step 운영 가이드 필요. [docs/cloudflare-onboarding.md](../../docs/cloudflare-onboarding.md) 를 Phase 6.1 직전/함께 작성. 계정 생성·wrangler·KV·Pages Functions·로컬 dev·모니터링·서빙·장애대응·migration 포함

**상태:** v2.2로 pending approval. Architect 7 + Critic 8 + 사용자 3 = 18 항목 반영.

### 2026-05-21 v2.3 (사용자 정정 — cache key alignment + thundering herd 방어)

**사용자 지적:** v2.2의 Cache API SWR이 **클라이언트별 cache window 어긋남**을 방어하지 못함. 클라이언트가 시간 정렬되지 않은 시각(2s, 15s, 17s 등)에 폴 → 같은 endpoint를 분당 6회 이상 OpenF1 호출 발생 가능 (worst-case 모든 폴이 miss).

**분석 결과:**
- HTTP `Cache-Control` / Cloudflare Cache API는 응답 시점 기준 신선도만 정의 → 클라이언트 시각 무관, 정렬 안 함
- Fastly/Varnish의 "request collapsing"은 Cloudflare Cache API에 없음
- **Bucket-aligned cache key + bucket-aligned polling cadence**가 정통 해결책

**적용 (v2.3):**

1. **(AC-12 보강) Bucket-aligned cache key** — Cache key URL에 `bucket={Math.floor(Date.now() / ENDPOINT_BUCKET[endpoint]) * ENDPOINT_BUCKET[endpoint]}` 쿼리 추가. Endpoint별 bucket size = docs §3.1 cadence 정확히 일치 (location/position 10s, race_control/intervals 15s, laps/pit 30s, stints/weather 60s). 같은 bucket의 모든 요청은 같은 cache key → 100% hit within bucket.

2. **(AC-12c 신설) 클라이언트 측 bucket-aligned polling** — `setTimeout(poll, nextBucket - now + 100ms)` 패턴으로 모든 클라이언트가 0/10/20/30s + 100ms 정각에 폴. Bucket 첫 클라이언트만 cache miss → 후속 폴 100% hit.

3. **(AC-12d 신설) Same-isolate thundering herd 방어** — Module-level `Map<cacheKey, Promise<Response>>` 으로 in-flight fetch dedup. KV write 0 (원래 KV lock 안은 분 단위 write가 free tier 1k/day 초과로 폐기). 같은 isolate 100 동시 요청 = OpenF1 1회. Cross-PoP race window는 cache.put ~50-200ms 안의 한정된 중복.

4. **(AC-12e 신설) OpenF1 429 graceful** — Cross-PoP thundering herd가 30 req/min 한도를 일시 초과해도 429 → KV fallback last-known-good 즉시 응답 (`X-Soonboard-Source: kv-fallback-429`). 클라이언트는 다음 bucket까지 자연 backoff.

5. **§2.2 SWR 코드 갱신** — Bucket 계산 + in-memory dedup Map + 429 fallback 분기 통합.

6. **§4.2 LiveDataSource** 에 클라이언트 측 alignedPoll 패턴 추가.

**KV write 예산 재확인 (v2.3):**
- Lock writes 0 (in-memory)
- Fallback writes: 60s throttle × 8 endpoint = 8 writes/min × 120min = 960/session/PoP ❌ 한도 1k/day 초과 위험
- → fallback throttle을 **120s로 상향** (writes/min 4 → 4/min × 120 = 480/session, 한도 48%). 라이브 세션 직후엔 last-known-good이 2분 전 데이터지만 OpenF1 다운 시 fallback이므로 허용 가능.

**상태:** v2.3 pending approval. Architect 7 + Critic 8 + 사용자 4 = 19 항목 반영. 어떤 mutation도 발생하지 않음.

(향후 사용자가 execution skill — team/ralph/autopilot — 을 명시적으로 호출할 때까지 정지)
