# 배포 아키텍처 (Deployment Architecture)

> 작성일: 2026-05-22 · 상태: **pending approval**
> 전제: [openf1-api-reference.md](./openf1-api-reference.md), [live-streaming-strategy.md](./live-streaming-strategy.md), [replay-strategy.md](./replay-strategy.md), [live-map-implementation.md](../.omc/plans/live-map-implementation.md), [dashboard-implementation.md](../.omc/plans/dashboard-implementation.md), [main-page-implementation.md](../.omc/plans/main-page-implementation.md).
>
> 본 문서는 위 plan 3종이 **어떤 인프라 위에서 어떻게 빌드·배포·실행되는지**를 정의한다. 코드 구조·API 사실·UI 사양은 위 문서에 위임하고, 여기서는 호스팅·CI·런타임 토폴로지에만 집중한다.

---

## 0. 한눈에 보는 운영 사양

| 항목 | 값 |
|---|---|
| 호스팅 | **Vercel hobby** (무료) — 정적 SPA. 한도: **100 deploys/day, 6,000 build-min/month, 100GB bandwidth/month** (개인 사용 가정에서 충분) |
| 소스 관리 | **GitHub** (단일 레포) |
| 빌드/데이터 파이프라인 | **GitHub Actions** (cron + on-push) |
| 백엔드 서버 | **없음** — 폴러는 사용자 브라우저 |
| 데이터베이스 | **없음** — 정적 JSON + 브라우저 메모리 캐시 |
| OpenF1 인증 | **불필요** (무료/익명 historical + 라이브 윈도우 폴) |
| 동접 가정 | **1명** (개인 사용). 외부 공개 시 §8 백엔드 도입 트리거 |
| 빌드 산출물 | `src/main/data/seasons/{year}.json`, `src/map/trackOutlines/*.json` — main 브랜치에 commit |
| 환경변수/시크릿 | **부재** (모두 익명 호출) |
| 라이선스 | OpenF1: CC-BY-NC-SA 4.0, julesr0y 트랙 SVG: CC-BY-4.0 — 모두 비상업 개인 사용 |

---

## 1. 토폴로지

```
┌───────────────────────────────────────────────────────────────────┐
│  GitHub Repository (single repo)                                  │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ .github/workflows/                                        │   │
│  │   daily-data-refresh.yml   (daily 01:00 UTC, 통합 cron)   │   │
│  │     ├ step: season catalog (public/seasons/)              │   │
│  │     ├ step: race distance  (public/raceDistance.json)     │   │
│  │     └ step: circuit maps   (public/trackOutlines/,        │   │
│  │              일요일에만 실행, 다른 요일은 skip)            │   │
│  │   ci.yml                   (on push: lint·type·test)      │   │
│  └───────────────────────────────────────────────────────────┘   │
│                          │                                        │
│                          ▼ 1회 commit으로 모든 데이터 갱신         │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ public/                            ← Vercel 정적 자산     │   │
│  │   seasons/{year}.json + index.json                        │   │
│  │   trackOutlines/{key}-{yr}.json + index.json              │   │
│  │   raceDistance.json                                       │   │
│  │ src/                                                      │   │
│  │   main/  live/  replay/  map/  dashboard/  shared/        │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬────────────────────────────────────┘
                               │ push to main
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  Vercel hobby                                                     │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │ Build: `vite build` (no Functions, no SSR)                 │  │
│  │ Output: `dist/` (정적 자산: HTML/JS/CSS/JSON 번들)         │  │
│  │ Edge CDN: 전 세계 캐시                                     │   │
│  │ SPA fallback: 모든 경로 → /index.html (wouter가 핸들링)    │   │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  사용자 브라우저 (Vite + React SPA, 동접 1명)                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ MainPage  /  LiveScreen  /  ReplayScreen   (wouter 라우팅) │  │
│  │   └─ DataSource (LiveDataSource / ReplayDataSource)        │  │
│  │       └─ Poller — OpenF1 REST 직접 폴 (26 req/min 라이브)  │  │
│  │       └─ Buffer — in-memory ring (30s) / Map cache (replay)│  │
│  └──────────────────────────────────┬─────────────────────────┘  │
└─────────────────────────────────────┼─────────────────────────────┘
                                      │ HTTPS GET (CORS 허용)
                                      ▼
                            ┌───────────────────────────┐
                            │ OpenF1 API (api.openf1.org)│
                            │ 무료/익명, 30 req/min      │
                            └───────────────────────────┘
```

---

## 2. Repo 구조

```
soon_board/
├── .github/
│   └── workflows/
│       ├── daily-data-refresh.yml     # 통합 cron (season catalog + race distance + maps)
│       └── ci.yml                     # lint·type·test on push
│
├── docs/                              # 사양·전략 문서
│   ├── openf1-api-reference.md
│   ├── live-streaming-strategy.md
│   ├── replay-strategy.md
│   └── deployment-architecture.md     ← 본 문서
│
├── .omc/plans/                        # 구현 계획
│   ├── live-map-implementation.md
│   ├── dashboard-implementation.md
│   └── main-page-implementation.md
│
├── scripts/                           # GitHub Actions에서 실행 (브라우저 X)
│   ├── fetch-season-catalog.ts        # 시즌 메타 + result_preview → public/seasons/
│   ├── fetch-race-distance.ts         # OpenF1 laps max → public/raceDistance.json
│   ├── fetch-circuit-maps.ts          # julesr0y SVG → polyline → public/trackOutlines/
│   ├── extract-openf1-transform.ts    # OpenF1 X/Y ↔ SVG affine
│   └── trace-pitlane.ts               # pit + location → 핏레인
│
├── public/                            # Vite가 빌드 시 dist/ 루트로 복사 (해시 없는 정적 자산)
│   ├── seasons/                       ← Actions 산출물 (committed)
│   │   ├── index.json                 # 가용 시즌 목록 + generated_at
│   │   └── {year}.json
│   ├── trackOutlines/                 ← Actions 산출물 (committed)
│   │   ├── index.json                 # 가용 (key, year) 인덱스 + license
│   │   ├── {key}-{year}.json          # 메인 트랙
│   │   └── pitlane_{key}-{year}.json  # 핏레인 polyline
│   └── raceDistance.json              ← Actions 산출물 (completed race lap counts)
│
├── src/
│   ├── main.tsx                       # ReactDOM root
│   ├── App.tsx                        # wouter Router + 라우트 3개
│   ├── style/
│   │   ├── tokens.ts                  # 다크 모드 디자인 토큰 (전 plan 공유)
│   │   └── global.css                 # CSS reset + body 다크 배경
│   ├── main/                          # main-page-implementation.md §10
│   ├── live/
│   │   ├── LiveScreen.tsx
│   │   └── CountdownOverlay.tsx
│   ├── replay/
│   │   └── ReplayScreen.tsx
│   ├── map/                           # live-map-implementation.md §7
│   ├── dashboard/                     # dashboard-implementation.md §6
│   └── shared/                        # DataSource 인터페이스, 공용 훅
│
├── index.html                         # Vite entry
├── vercel.json                        # SPA fallback rewrite
├── vite.config.ts                     # Vite + React 플러그인
├── tsconfig.json
├── package.json
├── THIRD_PARTY_LICENSES.md            # OpenF1 + julesr0y attribution
└── README.md                          # 프로젝트 개요 + 비상업 개인 사용 명기
```

---

## 3. GitHub Actions Workflow

### 3.1 `daily-data-refresh.yml` (통합 daily cron)

3종 데이터(시즌 카탈로그·race distance·서킷 맵)를 **하나의 workflow + 1회 commit**으로 갱신. circuit maps는 일요일에만 실행(요일 조건).

```yaml
name: Daily Data Refresh
on:
  schedule:
    - cron: '0 1 * * *'    # 매일 01:00 UTC (OpenF1 자정 갱신 + 1h)
  workflow_dispatch:        # 수동 트리거 허용
permissions:
  contents: write
concurrency:                # critic M2: workflow_dispatch 남용 + cron 중첩 방지
  group: data-refresh
  cancel-in-progress: false  # 진행 중인 cron은 끝까지, 새 트리거는 큐잉
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci

      # 1) 시즌 카탈로그 — main-page-implementation.md §3
      - name: Fetch season catalog
        run: npx tsx scripts/fetch-season-catalog.ts

      # 2) race distance — dashboard-implementation.md §2.2
      - name: Fetch race distance
        run: npx tsx scripts/fetch-race-distance.ts

      # 3) circuit maps — live-map-implementation.md §1.3 (일요일에만)
      - name: Check weekday for circuit maps
        id: weekday
        run: |
          if [ "$(date -u +%u)" = "7" ]; then
            echo "run=true" >> "$GITHUB_OUTPUT"
          else
            echo "run=false" >> "$GITHUB_OUTPUT"
          fi
      - name: Fetch circuit maps (Sunday only)
        if: steps.weekday.outputs.run == 'true'
        run: |
          npx tsx scripts/fetch-circuit-maps.ts
          npx tsx scripts/extract-openf1-transform.ts
          npx tsx scripts/trace-pitlane.ts

      # 4) 통합 commit
      - name: Commit if changed
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add public/seasons/ public/raceDistance.json public/trackOutlines/
          git diff --staged --quiet || git commit -m "data: daily refresh"
          git push
```

**운영 특성:**
- **소요 시간:** 시즌 카탈로그 ~1시간(25 req/min 스로틀) + race distance ~수 분 + maps(일요일만) ~30분 ≈ 일평균 1시간, 일요일 ~1.5시간.
- **실패 처리:** step 단위 atomic. 한 step 실패해도 다른 step의 변경분은 commit 시도 됨. 실패 step은 `continue-on-error: true` 옵션으로 명시 가능 (§9-7 위험 반영).
- **commit 1회:** Vercel 재배포도 1회만 트리거 → build minute 절약.
- **julesr0y 자산 fetch:** pinned commit SHA로 HTTPS GET. git submodule 미사용.
- **알림:** 개인 사용 → GitHub Actions 기본 이메일만.

**429 / abuse 차단 방어 (critic C2):** OpenF1은 단일 메인테이너 + rate limiting 부재로 알려져 있고 (openf1-api-reference §3·§5.4), GitHub Actions hosted runner의 단일 IP에서 25 req/min을 ~1.5시간 연속 폴 → abuse로 차단당할 가능성. scripts 공통 정책:
1. **각 endpoint 호출에 token-bucket 25 req/min** (rate limiter). 단순 setInterval 또는 `bottleneck` 라이브러리.
2. **429 응답 시 exponential backoff + jitter** (1s → 2s → 4s → ... max 60s, jitter ±25%). `Retry-After` 헤더가 있으면 그 값 우선.
3. **최대 5회 재시도 후 fail-soft** — 해당 entry는 skip, 산출물에는 이전 값 유지. 산출물 자체는 부분 commit (atomic은 §3.1 마지막 "Commit if changed" step이 처리).
4. **OpenF1 다운(5xx 연속) 감지** — 30분 동안 5xx 비율 50% 초과면 workflow 전체 abort (다음 day 재시도). GitHub Actions 이메일로 알림.
5. **로그**: 각 step 끝에 `requests_total`, `429_count`, `5xx_count`, `skipped_entries` 카운터를 GitHub Actions summary에 노출 (디버깅 + cron 후 사용자 확인).

이 정책은 `scripts/_lib/openf1Client.ts` (공통 fetch wrapper)에 구현되어 fetch-season-catalog·fetch-race-distance·fetch-circuit-maps 모두 동일 backoff를 따른다.

**index.json atomic 갱신 (critic C3):** 3종 산출물(`public/seasons/index.json`, `public/trackOutlines/index.json`)이 부분 실패 시 stale 또는 dangling 상태가 되면 런타임 fetch가 404 → 무한 stall. 정책:
1. **각 index.json은 디렉토리의 모든 산출물이 성공한 직후에만 갱신.** 한 entry라도 실패하면 그 entry는 인덱스에 추가하지 않고 기존 entry를 유지.
2. **Tmp 파일 + atomic rename**: `index.json.tmp` 에 쓰고 `fs.renameSync` 로 교체 (POSIX atomic). 부분 write 상태가 절대 commit에 들어가지 않음.
3. **commit은 디렉토리 단위 atomic**: `git add public/seasons/`·`git add public/trackOutlines/` 처럼 디렉토리 단위로 staging. 한 산출물 + 인덱스가 짝지어진 채로 commit (split commit 금지).
4. **부분 step 실패 시 영향**: 예를 들어 maps step이 실패하면 trackOutlines/는 손대지 않음 → 이전 index.json + 이전 산출물 그대로 보존 → 런타임은 영향 없음. season catalog는 성공해도 maps의 변경분이 없으니 trackOutlines 디렉토리에 staged 변경 없음.
5. **로그**: 각 index 갱신 후 `entries_added`, `entries_skipped` 카운터 출력.

이 정책 역시 공통 wrapper 또는 각 script의 마지막 단계에서 처리한다.

**Main 브랜치 보호 정책 (critic M3):** 본 workflow는 `permissions: contents: write` + `git push origin main` 으로 직접 push한다. 다음 중 하나로 설정한다:
- **(a) main 보호 비활성** (개인 사용 MVP 기본 권장) — PR 리뷰·status check 강제 없음. 사용자는 직접 push도 자유.
- **(b) main 보호 켬 + Actions bot exception** — "Restrict who can push to matching branches"에서 `github-actions[bot]` 을 allowlist에 추가. PR review 요건은 그대로 강제 가능. 추가 설정: "Do not allow bypassing the above settings"는 **꺼야** Actions bot push 허용.

본 MVP는 (a) 기본 가정. 외부 공개 시 (b)로 전환 권장.

### 3.2 `ci.yml` (on push/PR)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint        # eslint
      - run: npm run typecheck   # tsc --noEmit
      - run: npm test            # vitest
      - run: npm run build       # vite build (배포 호환성 확인)
```

- Vercel이 이미 push마다 빌드를 돌리므로 중복 같지만, **PR 단계에서 lint/test/typecheck**를 확보하는 것이 목적.

---

## 4. Vercel 설정

### 4.1 `vercel.json`

```json
{
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/live/:key*",    "destination": "/index.html" },
    { "source": "/replay/:key*",  "destination": "/index.html" }
  ],
  "env": {
    "VITE_VERCEL_ENV": "$VERCEL_ENV"
  }
}
```

- **rewrites (critic M7):** SPA fallback을 **SPA 라우트(`/live/:key*`, `/replay/:key*`)에만 좁혀서** 적용. 루트(`/`)는 Vite 빌드의 `index.html`이 그대로 서빙, 정적 자산(`/seasons/*.json`, `/trackOutlines/*.json`, `/raceDistance.json`)은 file-system 매칭으로 정상 404 가능. 이전의 `/(.*)`은 존재하지 않는 JSON path를 index.html 200으로 가로채 `JSON.parse` 실패 위험.
- **env:** Vercel `VERCEL_ENV` (production/preview/development) 를 `VITE_VERCEL_ENV`로 노출 — production gate(`?now=...` 차단 등, critic M6)에 사용.
- ⚠️ **Vite + Vercel ENV 인라인 주의 (critic P0-3):** `vercel.json`의 `env` 블록은 Pages Functions·서버사이드 환경변수 매핑용이고, **Vite의 `import.meta.env.VITE_*`는 빌드 시점에 별도 인라인이 필요**하다. `vite.config.ts`의 `define` 옵션으로 `process.env.VERCEL_ENV`를 명시 주입해야 한다. ([main-page §12 단계 0-b1](../.omc/plans/main-page-implementation.md)) 누락 시 preview 빌드도 production 빌드도 `import.meta.env.VITE_VERCEL_ENV`가 빈 문자열로 인라인되어 production gate가 항상 fail-open 또는 fail-closed가 된다.
- **Functions 미사용:** 본 MVP는 정적 자산만. Vercel Functions/Edge Functions/Cron Jobs 미사용 (hobby 제한 자원 절약).
- **클라이언트 fetch 방어:** 만약 잘못된 path로 fetch하면 404 응답이 정상적으로 와야 함. `catalogStore`·`trackOutlinesFetcher`·`raceDistance` fetcher는 `response.ok` 체크 + `Content-Type: application/json` 검사 + JSON.parse 실패를 graceful 처리.

### 4.2 환경 변수

**없음.** 모든 OpenF1 호출이 익명이라 토큰·시크릿 없음. 추후 유료 OAuth 전환 시(외부 공개 단계) Vercel 환경변수로 `OPENF1_TOKEN` 추가.

### 4.3 Preview 환경

- PR을 열면 Vercel이 preview URL 생성. 자동.
- preview에서는 `?now=...` 시간 시뮬레이션 쿼리 활성 (main-page-implementation.md §16-5).

### 4.4 Vercel hobby 한도 예산 (critic M2)

| 자원 | hobby 한도 | 예상 사용량 | 마진 |
|---|---|---|---|
| Production deploys | 100/day | cron 1 + 개발 push 평균 5~10 | 90+ |
| Build minutes | 6,000/month | 매 deploy ~1분 × 30~50/month ≈ 30~50분 | ~99% 여유 |
| Bandwidth (egress) | 100GB/month | 정적 SPA + JSON, 개인 1명, < 1GB/month 예상 | 99% 여유 |
| Edge requests | 무제한 (hobby) | — | — |

- `workflow_dispatch` 수동 트리거 남용 시 (예: 100회 연속 실행) 100 deploys/day 한도 위협. concurrency group으로 동시 실행은 방지(§3.1)되나 직렬 누적은 막지 못함. 사용자는 일일 수동 트리거 횟수를 모니터링.
- 첫 진입 시 시즌 JSON·trackOutlines·raceDistance·OpenF1 시계열 호출이 모두 외부 도메인(`api.openf1.org`)이라 Vercel bandwidth에 잡히지 않음 → bandwidth는 정적 자산 + 코드 번들에만 소비.

---

## 5. 데이터 흐름 — 정적 vs 동적

| 데이터 | 소스 | 빌드 시점 | 런타임 fetch |
|---|---|---|---|
| 시즌 카탈로그 (`meetings`/`sessions`/`result_preview`) | OpenF1 | **`daily-data-refresh.yml` daily** → `public/seasons/*.json` + `index.json` commit | 페이지 진입 시 `fetch('/seasons/index.json')` + 현재 시즌 1개 + 백그라운드 재검증 |
| Race distance (서킷·연도별 총 lap) | OpenF1 `laps.lap_number` max | **`daily-data-refresh.yml` daily** → `public/raceDistance.json` commit | 페이지 진입 시 `fetch('/raceDistance.json')` 1회 |
| 트랙 polyline · affine · 핏레인 | julesr0y SVG + OpenF1 location | **`daily-data-refresh.yml` 일요일 step** → `public/trackOutlines/*.json` + `index.json` commit | 라이브/리플레이 진입 시 `fetch('/trackOutlines/index.json')` + 해당 (key, year) 2종 |
| 드라이버 메타 (`drivers`) | OpenF1 | 없음 | 세션 진입 시 1회 |
| 라이브 시계열 (`location`/`position`/...) | OpenF1 | 없음 | **브라우저 직접 폴** (26 req/min) |
| 재생 시계열 | OpenF1 | (옵션) 인기 세션 사전 적재 | **브라우저 60s 윈도우 폴** (~3 req/min @ 1x) |
| 라이선스 | 정적 | 빌드 산출물 | 없음 (THIRD_PARTY_LICENSES.md 페이지 표시) |

---

## 6. 라이선스 · Attribution

### 6.1 사용 자산

- **OpenF1 API** — CC-BY-NC-SA 4.0. **비상업 개인 사용**, 출처 표시 의무.
- **julesr0y/f1-circuits-svg** — CC-BY-4.0. 상업 가능하나 본 프로젝트는 OpenF1 라이선스에 종속되어 비상업 제약 유지.

### 6.2 Attribution 위치 (critic M8)

1. **README.md** — 프로젝트 첫 줄에 "이 프로젝트는 OpenF1 (CC-BY-NC-SA 4.0) 및 julesr0y/f1-circuits-svg (CC-BY-4.0)를 사용하는 개인용 비상업 프로젝트입니다."
2. **`THIRD_PARTY_LICENSES.md`** — 두 라이선스 전문 + 소스 링크.
3. **`src/shared/Footer.tsx` 단일 컴포넌트** — 모든 페이지(`/`, `/live/:key`, `/replay/:key`) 하단에 1회 렌더 (App.tsx 라우터 바깥). 4개 요소 모두 포함:
   - "Track maps © julesr0y/f1-circuits-svg (CC BY 4.0)"
   - "Data © OpenF1 (CC BY-NC-SA 4.0)"
   - "Not affiliated with Formula 1, FIA, or FOM"
   - `generated_at: {ISO 8601}` (시즌 카탈로그의 가장 오래된 시점 — stale 감지)
   - 폰트 작게(`tokens.text.muted`), 한 줄 또는 두 줄. 다크 모드 토큰 사용
4. **금지:** `src/map/attribution.ts` 같은 도메인별 attribution 컴포넌트를 만들지 말 것 — 분산되면 일관성 깨짐. live-map의 트랙 라이선스도 Footer.tsx 한 곳에서만.

---

## 7. 로컬 개발

```
npm install
npm run dev                  # vite dev server (localhost:5173)
npm run fetch:catalog        # public/seasons/ 로컬 갱신 (GitHub Actions와 동일 스크립트)
npm run fetch:race-distance  # public/raceDistance.json 로컬 갱신
npm run fetch:maps           # public/trackOutlines/ 로컬 갱신
npm run refresh-data         # 위 3개를 daily-data-refresh.yml 과 동일한 순서로 일괄 실행
npm run build                # vite build → dist/
npm run preview              # 빌드 결과 로컬 서빙
npm test                     # vitest
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
```

- `?now=2024-03-02T15:00:00Z` 쿼리는 dev 모드에서 활성 (시간 시뮬레이션, main-page-implementation.md §16-5).
- OpenF1 호출은 익명이라 별도 `.env` 없음.

---

## 8. 향후 확장 트리거 — 백엔드 도입 시점

다음 조건 중 하나라도 충족되면 본 MVP를 넘어서는 백엔드 인프라가 필요해진다.

| 트리거 | 영향 | 후속 조치 |
|---|---|---|
| **URL을 다른 사람에게 공유 / SNS 노출** | 동접 N명 × 26 req/min → OpenF1 한도 초과 | 백엔드 폴러 + WebSocket 팬아웃 (live-streaming-strategy.md §8.3) |
| **다중 사용자가 다양한 historical 세션 재생** | 캐시 적중률 낮아 폴 부하 | 백엔드 LRU + Redis 윈도우 캐시 (replay-strategy.md §5 향후 확장) |
| **OpenF1 MQTT/유료 데이터 사용** | 토큰을 클라이언트에 둘 수 없음 (공식 보안 권고) | 백엔드 도입 + Vercel 환경변수 `OPENF1_TOKEN` |
| **상업적 사용** | OpenF1 CC-BY-NC-SA 4.0 위반 | 라이선스 협의 또는 데이터 소스 교체 |
| **IndexedDB 영구 캐시 필요** (replay 자주 재방문) | 메모리 캐시로 부족 | `idb` 라이브러리 도입 (replay-strategy.md §5.3, 본 MVP 스코프 밖) |

각 트리거의 구체적 대응안은 해당 plan 문서의 "향후 확장" 섹션 참조.

---

## 9. 운영 한계 (개인 사용 MVP 기준)

- **페이지를 닫으면 라이브 30s 버퍼 소실** — 재진입 시 ~1초 워밍업 필요 (live-streaming-strategy.md §6).
- **재생 세션 재방문 시 캐시 미적중** — 탭 닫으면 메모리 캐시 소실. 재방문 시 다시 폴 (replay-strategy.md §5.3).
- **오프라인 사용 불가** — 모든 동작이 OpenF1 실시간 호출에 의존. 정적 시즌 카탈로그는 캐시되나 라이브/재생은 불가.
- **OpenF1 장애 시 즉시 영향** — SLA 없는 단일 메인테이너 프로젝트. 30s 버퍼로 흡수 가능한 짧은 장애만 안전 (live-streaming-strategy.md §7).
- **시즌 카탈로그 stale 가능성** — GitHub Actions가 실패하면 다음 day 빌드까지 stale. 페이지에 `generated_at` 표시로 알림 (main-page-implementation.md §13).

---

## 10. 참고

- [openf1-api-reference.md](./openf1-api-reference.md) — OpenF1 API 사실, 라이선스, rate limit
- [live-streaming-strategy.md](./live-streaming-strategy.md) — 라이브 30s 버퍼, 브라우저 폴러
- [replay-strategy.md](./replay-strategy.md) — 재생 60s 윈도우, 메모리 캐시
- [live-map-implementation.md](../.omc/plans/live-map-implementation.md) — 라이브맵 렌더링 + 트랙 데이터 파이프라인
- [dashboard-implementation.md](../.omc/plans/dashboard-implementation.md) — 대시보드 패널 + 시간 정렬
- [main-page-implementation.md](../.omc/plans/main-page-implementation.md) — 메인 페이지 + 시즌 카탈로그
- Vercel hobby 한도 — <https://vercel.com/docs/limits/overview>
- GitHub Actions 무료 한도 — public repo 무제한, private repo 2000분/월
