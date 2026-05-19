# SO**ON** Board

> F1 Live Timing 동반 대시보드 — 중계 화면 옆 서브 모니터/태블릿에서 20대 드라이버의 전체 필드를 실시간으로 조감.

[![Tests](https://img.shields.io/badge/tests-188%20passing-22c55e)](#)
[![Lint](https://img.shields.io/badge/lint-0%20warnings-22c55e)](#)
[![Bundle](https://img.shields.io/badge/bundle-94KB%20gzip-22c55e)](#)

---

## 무엇인가요

**SOON Board**는 F1 중계를 시청하는 동안 서브 모니터(FHD)나 태블릿(iPad)에서 함께 보는 클라이언트 사이드 SPA입니다. 공식 중계가 못 보여 주는 **'전체 필드 조감'을 핵심 부가가치**로 삼아 20명의 드라이버 위치를 서킷 SVG 위에 동시에 부드럽게 보여줍니다. 라이브 세션과 과거 세션 재생(2024~2026 캘린더)을 단일 글로벌 타이머로 통합합니다.

워드마크의 **`ON`**을 F1 레이싱 레드(`#E10600`)로 강조해 '실시간 온보드'를 표현했습니다.

## 빠른 시작

```bash
nvm use            # Node 18.18+ 사용
npm install
git submodule update --init --recursive   # bacinger/f1-circuits (MIT)
npm run dev        # http://localhost:5173
```

## 스택

- **React 18** + **Vite 5** + **TypeScript 5**
- **Tailwind CSS 3** (다크 모드, 커스텀 토큰 — racing red / tire-* 팔레트)
- **Zustand 4** — 글로벌 타이머 + 텔레메트리 + 세션 상태
- **ml-matrix** — 텔레메트리 ↔ SVG affine fit
- **데이터 소스:** [OpenF1 API](https://openf1.org/) 무료 플랜 (anonymous, ~3초 lag)
- **호스팅:** Vercel (정적, 백엔드 없음, main 브랜치 push 시 자동 배포)

## 핵심 설계 (TL;DR)

| | |
|---|---|
| **Single global clock** | Live 모드는 `anchor=now, rate=1x`인 Playback의 특수 케이스. 한 곳에서만 시간을 관리. |
| **Substrate-first map** | 텔레메트리에서 뽑은 polyline이 항상 좌표 기준 — 외부 SVG는 데코레이션. 신규 서킷도 자동 동작. |
| **rAF imperative markers** | 20대 × 60Hz를 React 리렌더 없이 `setAttribute('transform', …)`로 직접 갱신. |
| **Tiered polling = 30 req/min** | location 6s, intervals 6s, race_control 10s, position 30s, laps 60s, pit/stints/weather 180s. 토큰 버킷으로 3 req/s burst 흡수. |
| **iPad Safari = 30Hz 시작** | UA 감지 후 30Hz, drop rate < 2%면 60Hz 자동 승급. `?fps=60`/`?fps=30` URL 오버라이드. |
| **Memory cap = 1 session** | 세션 전환 시 telemetry 버퍼 flush → iPad Safari ~1GB 탭 캡 보호. |

자세한 의사결정 흐름은 [.omc/specs/deep-interview-soon-board.md](.omc/specs/deep-interview-soon-board.md)와 [.omc/plans/soon-board-consensus-plan.md](.omc/plans/soon-board-consensus-plan.md) 참조.

## 스크립트

```bash
npm run dev                 # Vite 개발 서버
npm run build               # 프로덕션 빌드 (prebuild로 bacinger → SVG 생성)
npm run preview             # 빌드 결과 미리보기 (port 4173)
npm run typecheck           # tsc --noEmit
npm run lint                # ESLint --max-warnings 0
npm test                    # Vitest 단위/통합 (188 tests)
npm run e2e                 # Playwright 스모크
npm run verify:cors         # OpenF1 CORS 헤더 검증
npm run architecture-check  # `mode === 'live'` 리터럴 침입 검사
npm run lighthouse:ci       # Performance ≥ 80 / A11y ≥ 90 (headless Chrome)
```

## 디렉토리

```
src/
  api/         OpenF1 클라이언트, 타입, 토큰버킷, CORS 검증
  store/       Zustand: timeline, session, telemetry, leaderboard
  scheduler/   Poller (M1 LOCKED cadence, M2 pause/resume), interpolator
  utils/       affine fit, viewBox, polyline smoothing, clean-lap picker
  components/
    Map/         CircuitMap, Marker, DecorationLayer (M6 substrate-first)
    Leaderboard/ Row, TireDot, Sparkline (20 LOC hand-rolled)
    Playback/    PlaybackBar, Calendar, SessionPicker, Scrubber, SpeedToggle, LiveDot
    Shell/       AppShell (responsive grid), Header, Wordmark
  hooks/       useMasterRaf, useFrameBudget, useDriverMarker, useGlobalClock
  assets/
    circuits/  40 SVG outlines (bacinger MIT) + circuits.json
scripts/      build-circuits, verify-cors, architecture-check, lighthouse-ci
e2e/          Playwright smoke specs
vendor/
  bacinger-circuits/    git submodule (MIT licensed)
.omc/
  specs/      deep-interview spec (ambiguity 10.1%)
  plans/      consensus plan (Planner → Architect → Critic loop)
  state/      research artifacts
```

## 배포

- main 브랜치에 push될 때마다 Vercel이 자동으로 빌드 + 배포한다 (`vercel.json` framework preset = vite).
- PR마다 preview 배포 URL이 자동 생성된다.
- **최초 1회 설정:** Vercel 프로젝트 **Settings → Git → Git Submodules** 토글을 ON으로. 끄면 `vendor/bacinger-circuits/`가 비어 `prebuild` 단계에서 LICENSE 검증이 실패한다.

## v1 태그 전 수동 게이트

- [ ] **AC7.6b** iPad Safari 실기기 Lighthouse — Performance ≥ 80, Accessibility ≥ 90. 증거 → `.omc/release-evidence/v1/`
- [ ] **AC1.4** 실제 OpenF1 라이브 세션에서 P95 신선도 ≤ 4초 스톱워치 검증

## Credits

- 서킷 outline: [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits) (MIT)
- 데이터: [OpenF1](https://openf1.org/) 무료 플랜
