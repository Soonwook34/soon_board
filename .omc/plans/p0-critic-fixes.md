# P0 Critic 고침 계획 — `.omc/plans/` 일관성·검증 결함 5건

**상태:** `pending approval`
**기준 리포트:** critic 리뷰 (2026-05-22, ad8b7e63494853b9b)
**목표:** critic 판정 `CONDITIONAL-GO` → `GO` 전환을 위한 P0 차단 이슈 5건 해소
**스코프:** `.omc/plans/*.md` 3건 + `docs/deployment-architecture.md` 1건 + `docs/live-streaming-strategy.md` 1건 **편집만**. 소스 코드 변경 없음.

---

## 요구사항 요약

critic 리뷰에서 식별된 P0 차단 이슈 5건을 plan 문서 레벨에서 해결해, 후속 구현 작업이 일관된 SSOT 위에서 시작될 수 있게 한다.

| # | 결함 | 영향 | 고침 위치 |
|---|---|---|---|
| 1 | `DataSource` SSOT 파일 경로 모순 | dashboard 단계 1이 import할 SSOT가 만들어지기 전임 | live-map §10·§7 + dashboard §9 |
| 2 | 단계 0 cross-plan 의존 누락 | 병렬 작업 시 `.github/workflows/ci.yml` destructive 교체가 두 번 일어남 | dashboard §9, live-map §10 |
| 3 | `?now=` production 차단 메커니즘 결함 | `VITE_VERCEL_ENV` 자동 전개 미보장 → 분기 항상 fail-open 또는 fail-closed 가능 | main-page §12 단계 0 + 인수 17 + deployment-architecture §4.1 |
| 4 | OpenF1 CORS 변경 위험 미대비 | CORS 정책 변경 시 즉시 동작 불가, fallback 없음 | 3개 plan §위험 + main-page §5 + live-map §12 |
| 5 | hydration burst와 정상 cadence 직렬성 미보장 | 첫 분 34 req 가능 → 무료 한도 30 req/min 초과 | live-streaming-strategy.md §6 + live-map §12 |

---

## 인수 기준 (testable)

각 P0 항목별로 **편집 후 grep으로 검증 가능한 인수**를 둔다. 별도의 코드 빌드/테스트는 본 plan의 스코프 밖.

### P0-1 인수
- `grep -n "src/map/DataSource.ts" .omc/plans/live-map-implementation.md` → **0건** (모든 등장이 `src/shared/DataSource.ts`로 변경됨)
- `.omc/plans/live-map-implementation.md` 단계 6 본문에 `src/shared/DataSource.ts` 명시
- `.omc/plans/live-map-implementation.md`에 신규 **단계 0.5 (또는 단계 1 직전)** "SSOT 인터페이스 파일 생성 (`src/shared/DataSource.ts`)" 명시 — 단계 6 이전에 단독으로 존재
- `.omc/plans/dashboard-implementation.md` §9 단계 0 박스에 "live-map 단계 0.5 (SSOT 파일) + 단계 6 (LiveDataSource 시간 인덱스) 선행 완료 필수" 명시

### P0-2 인수
- `.omc/plans/dashboard-implementation.md` §9 단계 0 박스에 "main-page §12 단계 0-a/0-b/0-c/0-d/0-e/0-f/0-g/0-h/0-i 모두 선행 필수, 기존 `.github/workflows/ci.yml` destructive 교체는 main-page 작업자가 단독 수행" 명시
- `.omc/plans/live-map-implementation.md` §10 단계 0 박스도 동일 문구 명시
- 세 plan 모두 "단계 0 작업은 main-page 작업자가 단독 수행, dashboard·live-map은 단계 0 완료 인수(`npm run build` 성공 + 새 ci.yml 녹색 통과) 확인 후 진입" 라는 cross-plan 동기화 규약 명시

### P0-3 인수
- `.omc/plans/main-page-implementation.md` 단계 0-b 또는 새 0-b1에 "`vite.config.ts`의 `define`으로 `import.meta.env.VITE_VERCEL_ENV`를 `process.env.VERCEL_ENV`로 명시 주입" step 추가, 예시 코드 포함
- 인수 17 (`main-page-implementation.md:502`)에 "**preview 배포에서 `import.meta.env.VITE_VERCEL_ENV`가 빈 문자열이 아닌 'preview'임을 실측 (브라우저 console에서 확인)**" 추가 acceptance
- `docs/deployment-architecture.md` §4.1의 `vercel.json env` 설명에 "Vite는 `vercel.json env` 자동 전개를 보장하지 않음. `vite.config.ts`에서 `define`으로 명시 주입 필수" 경고 박스 추가
- 단계 0 완료 인수에 "preview 배포 실측"이 포함되어, 단계 0를 통과하려면 이 검증을 수동으로라도 해야 함

### P0-4 인수
- 3개 plan 모두 §위험 표에 "OpenF1 CORS 정책 변경" 행 추가 (영향: 즉시 동작 불가 / 완화: 진입 시 CORS ping + 실패 안내 UI)
- `.omc/plans/main-page-implementation.md` §5 (라이브 화면) 또는 §3 (라우팅)에 "라이브/리플레이 진입 시 OpenF1 ping endpoint(예: `/v1/sessions?session_key=latest&limit=1`) 1회 호출로 CORS 헬스 체크" 정책 명시
- `.omc/plans/live-map-implementation.md` 단계 12 (LiveDataSource) 인수에 "CORS 실패 시 'OpenF1 서비스 일시 중단' 안내 UI 표시 + 정상 폴링 시작하지 않음" 추가
- `.omc/plans/main-page-implementation.md`에 "CORS 실패 UI" 컴포넌트 책임 위치 명시 (예: `src/live/CountdownOverlay.tsx`와 동급의 `src/live/CorsFailedNotice.tsx`)

### P0-5 인수
- `docs/live-streaming-strategy.md` §6 step 2 (현재 "응답으로 8개 ring buffer를 채운 뒤 §3.1 cadence로 정상 폴링 루프 진입")를 "**hydration burst가 모두 완료(8 req 응답 수신)되기 전에는 §3.1 cadence interval 시작 금지. 직렬성 보장.**" 으로 강화
- §6 §6.4 (또는 신규 §6.5)에 "최악 케이스 1분 호출량 = hydration 8 req + cadence (location 6 + position 6 + intervals 4 + race_control 6 + laps 6 + pit 6 + stints 4 + weather 2 ≈ 40 req/min) → 단순 합산 시 한도 초과. 직렬화로 첫 분 호출량은 8 req + 60s 윈도우 중 hydration 완료 후 잔여 시간만큼의 cadence가 발생. 보수적으로 ~30 req 안" 계산 명시
- `.omc/plans/live-map-implementation.md` 단계 12 (LiveDataSource) 인수에 "hydration burst와 정상 cadence가 시간상 직렬임을 단위 테스트로 검증 (mock fetch + fake timer로 hydration 미완 상태에서 cadence interval `setInterval`이 등록되지 않음 확인)" 추가
- `.omc/plans/live-map-implementation.md` 단계 12 코드 책임에 "`LiveDataSource.start()`는 hydration `await Promise.all(hydrationPromises)` 완료 후에만 cadence `setInterval` 등록" 명시

---

## 구현 단계

> **편집 전 전제:** 모든 변경은 plan/docs 문서에 한정된다. CLAUDE.md 디렉티브에 따라 `.omc/**` 및 `docs/**`는 직접 편집 허용. 소스 코드(`src/`, `scripts/`, `vite.config.ts` 등)는 본 plan에서 만들지 않는다.

### 단계 1 — P0-1: DataSource SSOT 경로 통일

1.1. `.omc/plans/live-map-implementation.md:737` 라인 편집
   - 현재: `[src/map/DataSource.ts](../../src/map/DataSource.ts)`
   - 변경: `[src/shared/DataSource.ts](../../src/shared/DataSource.ts)` + `[src/map/PerDriverBuffer.ts](../../src/map/PerDriverBuffer.ts)` 는 유지
   - 한 줄 주석 추가: "(SSOT, §3.1·§7 참조)"

1.2. `.omc/plans/live-map-implementation.md` §10에 **신규 "단계 0.5"** 추가 (단계 1 직전)
   - 제목: "단계 0.5: SSOT 인터페이스 파일 생성"
   - 내용: `src/shared/DataSource.ts` (인터페이스만, 메서드 시그니처 §3.1 그대로). 단계 6의 구현체보다 먼저 만든다.
   - ✅ 인수: dashboard plan이 import할 SSOT 파일이 단계 6 이전에 존재

1.3. `.omc/plans/dashboard-implementation.md:559` "단계 0 (의존)" 박스 보강
   - 현재: "main-page §12 단계 0 — Vite/React/wouter 부트스트랩 ..."
   - 추가 문장: "**또한 [live-map §10 단계 0.5](./live-map-implementation.md) — `src/shared/DataSource.ts` SSOT 인터페이스 파일 + [live-map §10 단계 6](./live-map-implementation.md) — `LiveDataSource` 시간 인덱스 구조 선행 완료 필수.** 본 plan 단계 1은 그 위에서 시작."

1.4. `.omc/plans/dashboard-implementation.md:562` 본문 표현 보강
   - 현재: "`src/shared/DataSource.ts` 인터페이스 ([live-map §3.1] SSOT) 에 본 plan용 6개 메서드가 이미 정의됨 (live-map MVP에 미리 통합) — 본 단계에서는 인터페이스를 수정하지 않고 ..."
   - 추가 문구: "(파일은 live-map §10 단계 0.5에서 생성됨)"

### 단계 2 — P0-2: 단계 0 cross-plan 의존 명시

2.1. `.omc/plans/dashboard-implementation.md:559` 단계 0 박스에 추가 문장 (P0-1과 합쳐 한 박스로 정리)
   - 추가: "**단계 0의 destructive 작업(기존 `.github/workflows/ci.yml` 삭제·교체, `package.json` 신규 생성)은 main-page 작업자가 단독 수행한다. dashboard 작업자는 단계 0 완료 인수(새 ci.yml main 녹색 통과 + `npm run build` 성공 + `vercel.json` SPA fallback preview 동작) 확인 후 진입.**"

2.2. `.omc/plans/live-map-implementation.md:703` 단계 0 박스에 동일 문장 추가

2.3. `.omc/plans/main-page-implementation.md:511` 단계 0 헤더 직후에 cross-plan 책임 명시 한 줄 추가
   - 추가: "**[Cross-plan 책임]** 본 단계 0의 모든 액션(0-a~0-i)은 main-page 작업자가 단독 수행. dashboard·live-map 작업자는 단계 0 완료 인수가 충족된 commit을 base로 단계 1 진입."

### 단계 3 — P0-3: `?now=` production 차단 메커니즘 명시

3.1. `.omc/plans/main-page-implementation.md` 단계 0 (`main-page-implementation.md:511~525`)에 신규 step **0-b1** 추가 (0-b 직후)
   - 내용:
     ```
     - **0-b1.** `vite.config.ts`의 `define`으로 `import.meta.env.VITE_VERCEL_ENV`를 빌드 셸의 `process.env.VERCEL_ENV`로 명시 주입 (critic P0-3). Vercel `vercel.json env` 매핑은 Pages Functions 환경변수용이고 Vite의 `import.meta.env` 인라인은 별도 단계 필요.
       예시:
       ```ts
       // vite.config.ts
       export default defineConfig({
         define: {
           'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV ?? ''),
         },
       });
       ```
     ```

3.2. `.omc/plans/main-page-implementation.md:502` 인수 17 보강
   - 현재 마지막 문장: "단위 테스트로 회귀 방지 + production 실제 배포에서 `?now=2024-01-01` 무시 확인"
   - 추가: "**+ preview 배포 브라우저 console에서 `import.meta.env.VITE_VERCEL_ENV === 'preview'` 실측, production 배포에서 `import.meta.env.VITE_VERCEL_ENV === 'production'` 실측. 빈 문자열이면 단계 0 회귀.**"

3.3. `.omc/plans/main-page-implementation.md:525` 단계 0 완료 게이트 인수 추가
   - 현재: "신규 인수 (단계 0 완료 게이트): 새 `ci.yml`이 main에서 녹색 통과, `npm run build` 성공, `vercel.json` SPA fallback이 preview 배포에서 동작"
   - 추가: "**+ preview 배포에서 `VITE_VERCEL_ENV` 값이 'preview' 문자열로 실측됨**"

3.4. `docs/deployment-architecture.md` §4.1 `vercel.json env` 설명 위치에 **경고 박스** 추가
   - 내용: "⚠️ **Vite + Vercel ENV 인라인 주의**: `vercel.json`의 `env` 블록은 Pages Functions·서버사이드 환경변수용이고, **Vite의 `import.meta.env.VITE_*`는 빌드 시점에 별도 인라인이 필요**하다. `vite.config.ts`의 `define` 옵션으로 `process.env.VERCEL_ENV`를 명시 주입해야 한다. (main-page §12 단계 0-b1)"

### 단계 4 — P0-4: OpenF1 CORS 변경 위험 대응

4.1. `.omc/plans/main-page-implementation.md` §13 위험 표 끝에 행 추가
   - | OpenF1 CORS 정책 변경 (critic P0-4) | 브라우저에서 즉시 동작 불가 (preflight fail) | 진입 시 ping endpoint (예: `/v1/sessions?session_key=latest&limit=1`) 1회 호출로 CORS 헬스 체크. 실패 시 `CorsFailedNotice` 표시 + 정상 폴링 시작 금지. mitigation 트리거 = 백엔드 프록시 도입 검토 (§16) |

4.2. `.omc/plans/dashboard-implementation.md` §10 위험표에 동일 행 추가 (영향 문구는 "대시보드 패널 전체 비활성"으로 조정)

4.3. `.omc/plans/live-map-implementation.md` §11 위험표에 동일 행 추가 (영향: "마커·트랙 렌더 정지")

4.4. `.omc/plans/main-page-implementation.md` §5 (라이브 화면 진입) 또는 §11 (라우팅) 한 줄 추가
   - "**라이브/리플레이 라우트 진입 시 OpenF1 CORS ping (1 req) 선행. 실패 시 `CorsFailedNotice` 컴포넌트로 안내 + 라이브맵·대시보드 마운트 보류. 성공 시 hydration 진입.**"

4.5. `.omc/plans/live-map-implementation.md` 단계 12 (`live-map-implementation.md:781`) 인수에 추가
   - "✅ 신규 인수 (critic P0-4): CORS preflight 실패 mock 시 `LiveDataSource.start()`가 cadence interval을 등록하지 않고 `onCorsFailed` 콜백을 발화"

4.6. `.omc/plans/main-page-implementation.md` §7 (또는 §8) 컴포넌트 트리에 `src/live/CorsFailedNotice.tsx` 추가 명시 (UI 자리)

### 단계 5 — P0-5: hydration burst와 정상 cadence 직렬성

5.1. `docs/live-streaming-strategy.md:155` step 2 강화
   - 현재: "응답으로 8개 ring buffer를 채운 뒤 §3.1 cadence로 정상 폴링 루프 진입"
   - 변경: "**8개 hydration 응답이 모두 수신될 때까지 §3.1 cadence interval (`setInterval`) 등록 금지. 직렬성 보장.** hydration 평균 ~3s 이후 cadence 시작 — 즉, 진입 후 첫 60s 윈도우의 cadence 가동 시간은 ~57s. critic P0-5 mitigation."

5.2. `docs/live-streaming-strategy.md` §6 끝에 **신규 §6.5 "한도 검증 계산"** 추가
   - 내용:
     ```
     ### 6.5 OpenF1 30 req/min 한도 검증

     | 케이스 | 호출량 | 비고 |
     |---|---|---|
     | 직렬화 보장 | 8 (hydration) + ~25 (cadence 57s × 26/60) ≈ 33 → 한도 근처, 30 마진 안 | **mitigation: cadence 26→25로 보수화 검토 (1.3 cross-plan)** |
     | 직렬화 미보장 (현재 실수) | 8 + 26 = 34 → 한도 초과 | step 2 강화로 방지 |
     | hydration 재시도 발생 | 8 + retry 1~3 + cadence → 35~37 | 429 백오프로 자연 한도 진입, retry는 token-bucket 통과 |

     ⚠️ 진입 직후 첫 분만 한도 압박. 두 번째 분부터는 cadence 26 req/min 정상 영역.
     ```

5.3. `.omc/plans/live-map-implementation.md` 단계 12 (`live-map-implementation.md:781`)에 책임 명시 추가
   - 추가 줄: "**구현 강제:** `LiveDataSource.start()`는 `await Promise.all(hydrationPromises)` 완료 직후에만 `setInterval(cadenceTick, cadenceMs)` 등록. hydration 진행 중 cadence 등록 금지. (critic P0-5)"

5.4. `.omc/plans/live-map-implementation.md` 단계 12 인수에 단위 테스트 추가
   - "✅ 신규 인수 (critic P0-5): vitest + fake timer로 hydration 미완 상태에서 `vi.advanceTimersByTime(60000)` 호출 시 cadence fetch가 0건임을 확인. hydration resolve 후 같은 timer 진행 시 cadence fetch 발생 확인."

---

## 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 단계 1.2 신규 "단계 0.5" 도입으로 live-map plan 단계 번호 재정렬 필요 | 단계 6/12/13 등 cross-reference 깨짐 | 단계 번호는 그대로 유지하고 "단계 0.5"는 0과 1 사이에 끼우는 표현으로만 추가 (다른 번호 재할당 없음). cross-reference는 모두 보존. |
| 단계 3.1의 `vite.config.ts` 예시가 실제 동작과 미세 차이 | 후속 구현 시 약간 다른 형태로 작성될 수 있음 | 예시는 가이드용이며 인수는 "VITE_VERCEL_ENV가 preview 빌드에서 'preview'로 실측"이라 코드 형태에 종속되지 않음 |
| 단계 5.2의 한도 계산이 실제 cadence 호출 패턴과 미세 어긋남 | 검증 계산이 잘못 안내 | cadence 26 req/min은 docs/live-streaming-strategy.md §3.1 표 그대로 합산. 호출 패턴 변경 시 §6.5도 함께 갱신 의무 |
| 5개 plan 파일 동시 편집으로 일부 라인 번호가 critic 리포트와 어긋남 | 후속 작업자가 라인 추적 어려움 | 편집은 단계 1~5 순서로 진행. 각 단계 완료 시 grep으로 인수 검증 |

---

## 검증 절차

각 단계 완료 후 다음 명령으로 인수 검증:

```bash
# P0-1
grep -n "src/map/DataSource.ts" .omc/plans/live-map-implementation.md  # 0건 기대
grep -n "단계 0.5" .omc/plans/live-map-implementation.md                # 1건 이상
grep -n "live-map 단계 0.5" .omc/plans/dashboard-implementation.md      # 1건

# P0-2
grep -n "main-page 작업자가 단독 수행" .omc/plans/                       # 3건 (main-page/dashboard/live-map)

# P0-3
grep -n "VITE_VERCEL_ENV" vite.config.ts                                # 본 plan 스코프 밖, 단계 0 구현 시 검증
grep -n "0-b1" .omc/plans/main-page-implementation.md                   # 1건
grep -n "vercel.json env" docs/deployment-architecture.md               # 경고 박스 명시 확인

# P0-4
grep -n "CORS" .omc/plans/*.md docs/*.md                                # 3개 plan + 1개 doc에 새 행/문구
grep -n "CorsFailedNotice" .omc/plans/                                  # 2건 이상 (main-page + live-map)

# P0-5
grep -n "직렬성" docs/live-streaming-strategy.md                        # 1건 이상
grep -n "6.5" docs/live-streaming-strategy.md                           # §6.5 한도 검증 섹션
grep -n "fake timer" .omc/plans/live-map-implementation.md              # 1건 (단위 테스트 인수)
```

전체 grep 통과 = P0 5건 plan 레벨 완료. 그 후 critic 재실행으로 GO 판정 재확인 권장 (별도 작업).

---

## 후속 작업 (본 plan 스코프 밖)

- critic 재실행으로 GO 전환 확인
- P1·P2 항목 처리 (별도 plan 또는 일괄 후속)
- Phase 0 실제 구현 시 P0-3의 `vite.config.ts` define 코드 실작성 + preview 실측
- Phase 단계 12 구현 시 P0-5의 fake timer 단위 테스트 실작성

---

## 승인 요청

이 계획은 5개 plan/docs 파일에 대한 **문서 편집만** 포함하며, 소스 코드 변경 없음. 승인 시 단계 1→5 순서로 편집 수행 후 검증 grep 출력으로 보고합니다.
