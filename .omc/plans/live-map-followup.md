# live-map 후속 개선 plan (pending approval)

**Status**: `pending approval` — 사용자 결재 전, 코드 변경 없음.
**Generated**: 2026-05-29
**Sources**: 이 세션 작업 (clock tick / DPR / 마커 재디자인 / multi-year / buildAll merge / rateLimitedFetch) 직후 감사 결과.
**Live-map base plan**: [.omc/plans/live-map-implementation.md](./live-map-implementation.md) (Phase 0-15 거의 완료)

## 사용자 결정 사항

선택된 작업: **A + B + C + D 모두**.
순서 권장: A → C → D → B (안전 → 성능 → 정리 → UX. B 는 가장 위험·큰 작업이라 마지막).

**B 의 제약 (사용자 명시)**: "Replay 재생 UI 만들 때 API 콜 횟수 제한 등을 잘 신경써서 만들어. speed 조절이나 seek 이 쾌적성에 악영향을 준다면 일단 만들지 않도록해". → speed/seek 은 별도 sub-story 로 분리, profiling 후 go/no-go.

---

## A. P0/P1 안전 가드 (estimated 2~3h)

### A1. Canvas state 격리 (markers.ts globalAlpha + shadow 누수)
- **현재 위험**: [src/map/markers.ts:30](../../src/map/markers.ts#L30) 에서 `disconnected` 상태 시 `ctx.globalAlpha=0.5` 후 line 75 에서 1 로 복원. 예외 발생 시 다음 마커가 0.5 alpha 로 그려짐. shadow* 도 fill 직후 cleared 되지만 stroke/text 사이 일관성 없음.
- **Fix**: `drawMarker` 전체를 `ctx.save()` / `ctx.restore()` 로 감싸 trans/alpha/shadow/font/textAlign/baseline 모두 isolate.
- **AC**:
  - 새 테스트: disconnected 마커 그린 직후 `ctx.globalAlpha` 가 1 임을 검증.
  - 새 테스트: drawMarker 호출 후 shadowColor/shadowBlur/shadowOffsetY 가 default 임을 검증.
  - 기존 633+11 회귀 통과.

### A2. canvas.getContext('2d') null 시 사용자 알림
- **현재**: [src/live/LiveMap.tsx:177-178](../../src/live/LiveMap.tsx#L177) `if (!ctx) return;` — 사용자는 "Loading track…" 또는 빈 캔버스만 봄.
- **Fix**: `setError('Canvas 2D context 를 얻을 수 없습니다 (브라우저 미지원).')` 호출 후 return.
- **AC**: jsdom 외부 mocked-null ctx 시 에러 메시지 표시 회귀 테스트.

### A3. Asset fetch timeout
- **현재**: track/pitlane/drivers fetch 가 hang 하면 무한 "Loading track…".
- **Fix**: `AbortController` + `setTimeout(15_000)` 으로 race. timeout 시 명확 에러 + Retry 노출.
- **AC**: fetchImpl 이 영원히 pending 인 mock 시 15s 후 에러 표시. 정상 응답 시는 timeout 발화 안 됨.

### A 종합 위험
- 마커 렌더 hot path → save/restore 의 overhead 측정 필요 (canvas spec 상 미미하지만 60fps × 20 driver = 1200 호출/sec).
- AbortController 가 이미 effect 마지막의 `return () => ctrl.abort()` 와 충돌 없는지 확인.

---

## B. Replay 재생 UI (estimated 0.5~1d, **API rate-limit 제약**)

### B1. Play / Pause (안전, MVP 후보)
- **추가 UI**: 좌상단 작은 toolbar 에 ▶/⏸ 버튼.
- **백엔드**: ReplayDataSource 에 `pause()` / `resume()` 추가 — `tickTimer` 만 멈춤 (fetch 영향 없음, lookahead 는 그대로).
- **API 부하**: ZERO (이미 fetch 된 데이터로 정지 상태 유지).
- **AC**: pause 후 `getDisplayTime()` 고정, resume 후 진행 재개. 기존 645 회귀 통과.

### B2. Speed 조절 (1x / 2x / 4x / 8x) — **conditional GO**
- **백엔드**: `setSpeed()` 이미 존재 — `playbackClock` 증가율만 변경.
- **API 부하**: ⚠️ `ensureLookahead` 의 lookahead = `lookaheadBaseMs × speed` → speed 4x 면 240s lookahead → 4배 windows fetch.
- **사전 검증 필수** (B2 착수 전):
  1. profiling: 4x replay 30s 시 fetch 횟수 vs 1x baseline.
  2. burst spread 가 흡수 가능한지 확인 (현재 spread 334ms 면 8 fetches/2.6s — OK 일 가능성 높음).
  3. 사용자 체감 ≥ 4x 에서 부드러운지 확인 (interpolation 한계).
- **Go criteria**: 사용자 명시 — "speed 조절이 쾌적성에 악영향을 준다면 만들지 마". profiling 결과 fetch 가 throttle 되거나 429 가 늘면 **defer**.
- **Defer fallback**: 1x 만 지원. Pause/resume 만 출시.

### B3. Seek (timeline scrubber) — **most risk, deferred candidate**
- **백엔드**: `setPlaybackClock(t)` 이미 존재 + `ensureLookahead()` 자동 호출 → 새 window fetch.
- **API 부하**: ⚠️ 사용자가 scrubber 를 드래그 (10 events/sec) 하면 매번 ensureLookahead 호출 → fetch burst.
- **필수 mitigation**:
  1. drag 중 setPlaybackClock 호출 debounce 300ms.
  2. seek 도착 후 ensureLookahead 가 in-flight dedup (이미 있음) 으로 흡수.
  3. seek 이전 window cache 는 그대로 (메모리 누수 없음).
- **Go criteria**: debounce + 모든 인접 윈도우가 60% 이내 cache hit. profiling 결과 안전 아니면 **defer**.
- **Defer fallback**: 별도 lap-jump 버튼 (현재 lap, 이전 lap, 이전 5lap) 만 지원 — discrete seek 으로 burst 감소.

### B 종합 정책
- **MVP 출시 기준**: B1 (pause/resume) 만 확정. B2/B3 은 profiling 후 결정.
- **fail-safe**: 새 UI 가 마커 움직임을 끊기게 만들면 즉시 hide (feature flag).

### B AC
- pause 후 `getDisplayTime` 변화 없음 + 마커 위치 고정.
- resume 후 자연스럽게 이어짐 (no jump).
- (조건부) speed 변경 시 fetch 횟수 1x baseline 대비 ≤ 1.5x.
- (조건부) seek 100회 시 429 발생 0건.

---

## C. 성능 최적화 (estimated 0.5d, **profile-first**)

### C1. Profiling 먼저
- **필수 pre-step**: Chrome DevTools Performance 탭에서 60s replay 측정.
  - 지표: per-frame ms, GC events, fetch queue size.
- **Go threshold**: per-frame > 8ms (60fps 의 50%) 이면 C2/C3 진행. 미만이면 skip.

### C2. 정적 트랙 offscreen cache
- **현재**: [src/map/LiveMapRenderer.ts:100](../../src/map/LiveMapRenderer.ts#L100) `renderStaticTrack` 가 매 frame 호출 — polyline N=100~500 points stroke.
- **Fix**: 초기 1회만 offscreen `OffscreenCanvas` 또는 `<canvas>` 에 그린 뒤, frame 마다 `drawImage` 로 blit.
- **위험**: viewport 변경 시 invalidate 필요 (window resize 등). 현재 viewport 는 mount 시 1회 계산이라 거의 invariant.
- **AC**: 기존 LiveMapRenderer 23 tests 통과. Performance benchmark: per-frame ms 감소 측정 (≥ 20%).

### C3. Ring buffer trim 주기화
- **현재**: [src/map/LiveDataSource.ts:311](../../src/map/LiveDataSource.ts#L311) `trimRingBuffer` 가 매 location ingest 마다 호출 — 20 driver × 6/min.
- **Fix**: trim 을 10s setInterval 로 분리. ingest 는 push 만.
- **AC**: 1시간 sustained run 후 메모리 invariant 테스트 (기존 [src/live/__tests__](../../src/live/__tests__) 의 LiveDataSource invariant 테스트) 통과.

### C4. setLineDash 캐싱 (low priority)
- pit-in-progress 마커마다 setLineDash([3,2])/([]). frame 캐시 변수로 직전 상태와 비교 후 변화 시만 호출.
- **Skip 조건**: C1 profiling 에서 setLineDash 가 hot path 가 아니면 생략.

---

## D. Live/Replay 중복 제거 (estimated 0.5d)

### D1. 공유 LocationBuffer 클래스
- **추출 대상**:
  - `insertLocation` (양쪽에 동일 binary search 로직)
  - `parseDate` (양쪽 동일)
  - `toExternal` (양쪽 동일)
  - sentinel filter `|x|+|y|+|z| < 50` (양쪽 동일 const)
- **새 위치**: `src/map/LocationBuffer.ts`
- **공유 후**: LiveDataSource/ReplayDataSource 는 buffer 인스턴스만 보유. ingestLocation 만 own (cursor/listener 다름).

### D2. 위험
- Sentinel threshold 가 PerDriverBuffer (`|x|+|y|` 후 projection) 와 LiveDataSource (`|x|+|y|+|z|` raw) 사이 inconsistent (Explore agent 가 P1 으로 flag). 통합 시 어느 쪽을 SSOT 로 할지 결정 필요. → **plan §4.2 "raw coords sentinel" 따라 raw 채택**.

### D AC
- ~400 LoC 감소 확인.
- 기존 ReplayDataSource (23 tests) + LiveDataSource invariant 모두 통과.
- 새 unit tests for LocationBuffer (insertOrdered, binarySearchPair, sentinelFilter).

---

## 추천 실행 순서

1. **A1 + A2 + A3 묶음** (안전 가드, 2~3h) — 가장 작고 회귀 적음.
2. **C1 profiling** (1h, write-only — 실측). 결과에 따라 C2/C3/C4 go/no-go.
3. **D** (코드 정리, 0.5d) — B 이전에 하면 B 가 깔끔한 API 위에서 작업 가능.
4. **B1 only** (pause/resume, 2h) — 가장 안전.
5. **B2/B3 profiling + 조건부 GO** — 사용자 명시 "쾌적성 악영향이면 만들지 마".

---

## 인증 요건 / 회귀

- 모든 변경 후: `npx vitest run` 645+ tests 통과 + `npx tsc --noEmit` clean.
- A/B/C/D 각 묶음마다 architect 검증 (acceptance criteria 기반).
- 새 컴포넌트 (B 의 toolbar) 는 LiveMap 과 같이 dev server 에서 사용자 시각 검증 필수 ([feedback_dev_server_verification](../../memory/feedback_dev_server_verification.md)).

## 결정 미루기 (deferred / 이 plan 범위 밖)

- Dashboard 6 stub 메서드 — [dashboard-implementation.md](./dashboard-implementation.md) 책임.
- StrictMode 끄기 — production 영향 없음, dev only noise.
- 404 noise — OpenF1 데이터 부재 (sprint weekend `/v1/stints` 등), 이미 graceful handle.
- 자동 disconnected 복구 — 별도 phase.
- Replay 의 lookahead 가 user-seek 으로 인해 cache hit ratio 낮아지면 — B3 의 sub-issue.

## Changelog

- 2026-05-29 generated from /oh-my-claudecode:plan audit. 사용자 picked A+B+C+D, B 는 conditional sub-stories.
- 2026-05-29 실행 1차 완료:
  - **A1+A2+A3**: drawMarker save/restore, getContext null 알림, asset 15s timeout — 모두 적용 + 회귀 추가
  - **C2+C3**: 정적 트랙 offscreen cache, ring buffer trim 10s throttle — 적용 + 회귀
  - **D1**: LocationBuffer 공유 클래스 추출 (`src/map/LocationBuffer.ts`) + 14 unit tests + LiveDataSource/ReplayDataSource ~120 LoC 감소
  - **B1**: ReplayDataSource pause()/resume()/isPaused() + LiveMap toolbar (replay only) — API 부하 ZERO 확인
  - **B2 deferred**: 사용자 명시 "쾌적성 악영향 시 만들지 마" + plan §B2 go criteria = "profiling 결과 fetch ≤ 1.5x baseline". 브라우저 profiling 없이 검증 불가 → 보류. 안전 cap (1x/2x) 만이라도 적용하려면 dev server profiling 후 별도 turn 으로 진행.
  - **B3 deferred**: scrubber 는 drag burst 위험. 안전 fallback (lap-jump 버튼) 도 lap 데이터 UI 노출 필요 → 별도 plan iteration.
  - 결과: 664/664 tests, tsc clean. ralph B2/B3 는 사용자 추후 결정 시 새 plan-followup-2.md 또는 동일 plan resume 으로 진행 가능.
