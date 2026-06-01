# OpenF1Client (browser) 중앙 API handler — 구현 계획

> 작성일: 2026-06-01 · 상태: **pending approval**
> 목적: 브라우저 측 모든 OpenF1 호출을 단일 client 로 통합해 429/burst 를 근본 해결하고 dashboard 단계의 fetch 분산 부담을 제거한다.
> 전제: [openf1-api-reference.md](../../docs/openf1-api-reference.md), [live-streaming-strategy.md](../../docs/live-streaming-strategy.md), [replay-strategy.md](../../docs/replay-strategy.md), [dashboard-implementation.md](./dashboard-implementation.md).

---

## 0. Why (현재 문제)

세션 진입 직후 발생하는 burst:

```
T+0ms     pingOpenF1            → /v1/sessions?session_key=latest    ①
T+0~50ms  LiveMap asset         → /v1/drivers?session_key=...        ②
T+0ms     ReplayDS sparse[0]    → /v1/laps?...                       ③
T+334ms   sparse[1] /v1/weather                                      ④
T+668ms   sparse[2] /v1/race_control                                 ⑤
T+1002ms  sparse[3] /v1/pit                                          ⑥
T+1336ms  sparse[4] /v1/stints                                       ⑦
T+1670ms  sparse[5] /v1/session_result                               ⑧
T+2004ms  ensureLookahead → DENSE × N windows × 3 endpoints 동시 fire ⑨..
```

| 원인 | 위치 |
|---|---|
| `ensureLookahead()` burst spread 없음 | [ReplayDataSource.ts:284-303](../../src/map/ReplayDataSource.ts#L284-L303) |
| ping + drivers + sparse[0] 동시 발사 | [LiveScreen.tsx](../../src/live/LiveScreen.tsx) + [LiveMap.tsx:123](../../src/live/LiveMap.tsx#L123) + [ReplayDataSource.ts:127](../../src/map/ReplayDataSource.ts#L127) |
| StrictMode dev 이중 mount → 모든 호출 ×2 | React 18 dev only |
| 호출자 5개가 서로 모르고 spread 각자 관리 | 분산 책임 |

5개 호출자 (corsPing, LiveMap drivers, LiveDataSource, ReplayDataSource, revalidateSeason) 가 서로의 in-flight 모름 → 누가 누가 spread 해도 합쳐서 burst.

---

## 1. Requirements Summary

브라우저 측 OpenF1 호출 5 sites 를 모두 `OpenF1Client` 싱글톤으로 routing. Client 가 토큰 버킷·우선순위 queue·in-flight dedup·429/5xx backoff·abort·observability 를 단독 책임. DataSource 인터페이스 ([src/shared/DataSource.ts](../../src/shared/DataSource.ts)) 와 dashboard plan 의 `getLatestBefore` / `getAllBefore` / `getCompletedLapsBefore` / `getStintForLap` / `getAggregateBefore` 계약은 **무변경**. Client 는 그 아래 fetch 레이어.

---

## 2. Acceptance Criteria

각 항목 모두 자동 verifiable (vitest 또는 manual browser check).

### 2.1 Core client behavior
- AC1: `OpenF1Client.fetch({path, params})` 는 토큰 버킷 (default `ratePerSecond=3`, `bucketCapacity=1`) 을 통과해야 발사. 기본 capacity=1 → 동시 10개 호출 시 발사 시각 간격 ≥ 334ms (test: fake timer). capacity>1 옵션 시에는 첫 N개 burst → 이후 334ms 간격
- AC2: 같은 (path, params canonicalized) 의 동시 호출은 in-flight Promise 1개 공유 (10개 호출 → 1개 fetch)
- AC3: 429 응답 시 `Retry-After` 헤더 honor + exponential backoff (base × 2^attempt, cap), 최대 3회 retry — `rateLimitedFetch` 시맨틱 보존
- AC4: 5xx 응답 시 동일 backoff. 4xx (429 제외) 는 즉시 reject (재시도 없음)
- AC5a (solo abort): 1명 caller, 다른 dedup share 없음 — abort signal 발화 시 in-flight fetch 즉시 cancel + caller reject AbortError
- AC5b (dedup share — 1명만 abort): 3명 caller 공유, 1명 abort — 그 caller 만 reject AbortError, 나머지 2명은 fetch 결과 정상 수신. in-flight 는 계속
- AC5c (dedup share — 마지막 abort): 모든 caller 가 abort — in-flight fetch 도 cancel. inflight map cleanup + metrics 정상 decrement
- AC5d (backoff sleep abort): 429 backoff sleep 중 abort — sleep 즉시 깨우고 retry 진행 안 함, AbortError reject

### 2.2 Priority queue
- AC6: 우선순위 3등급 — `'high'` (location/position/intervals: 라이브 사용자가 직접 보는 데이터 + **drivers**: 사용자가 "Loading track…" 에서 block 됨), `'normal'` (laps/stints/pit/weather/race_control), `'low'` (ping, revalidateSeason)
- AC7: queue 가 비-비어있을 때 higher priority 가 항상 먼저 발사 (FIFO 내 priority)
- AC7a (dedup priority promotion): low 가 queue 대기 중, 같은 dedup key 로 high 가 join 하면 dispatch 우선순위는 max(priorities)=high. in-flight 단계로 넘어간 후에는 re-prioritize 불가 (이미 발사됨)
- AC7b (FIFO tiebreaker preserved): 같은 priority 내에서는 enqueue 순서 보존. LiveDataSource hydration 의 LIVE_CADENCE 순서 (location→position→intervals→…) 가 maintained — enqueue 코드가 그 순서로 client.fetch() 호출하면 자동 보존

### 2.3 Observability
- AC8: `client.getMetrics()` 가 `{totalRequests, in429, in5xx, retries, queueDepth, inflight}` 반환
- AC9: `onRequestEvent(cb)` 콜백 — `{kind: 'send'|'retry'|'ok'|'fail', url, status?, attempt?, waitMs?}` 발화 (dev console logging 용)
- AC10: 429/5xx 발생 시 — **dev 환경 (`import.meta.env.DEV`) 만** `console.warn(...)` (prod 는 console noise 방지, HUD/onRequestEvent 콜백으로 진단). critic MIN3 반영

### 2.4 Integration
- AC11: `corsPing.ts` 가 client 사용 — 직접 `fetch` 호출 0건
- AC12: `LiveMap.tsx` drivers fetch 가 client 사용 (priority='high' — user 가 "Loading track…" 에서 block)
- AC13: `LiveDataSource.ts` hydration + cadence 모두 client 사용. `hydrationTokenIntervalMs` 옵션 **제거** (client 가 owns)
- AC14: `ReplayDataSource.ts` sparse + dense + lookahead 모두 client 사용. `requestSpreadMs` 옵션 **제거**. `rateLimitedFetch` import **제거**
- AC15: `revalidateSeason.ts` 가 client 사용 (priority='low')
- AC16: `src/map/rateLimitedFetch.ts` **삭제** (client 에 흡수)
- AC17: 다음 8개 테스트 파일이 client mock 으로 마이그레이션 — 각자 `fetchImpl` 주입하던 패턴은 `createMockOpenF1Client()` 1곳으로 단순화:
  - `src/map/__tests__/LiveDataSource.test.ts` · `LiveDataSourceTabResume.test.ts` · `LiveDataSourceMemory.test.ts` · `ReplayDataSource.test.ts`
  - `src/live/__tests__/LiveMap.test.tsx` · `corsPing.test.ts`
  - `src/main/stores/__tests__/revalidateSeason.test.ts`
  - `src/map/__tests__/rateLimitedFetch.test.ts` (삭제)

### 2.5 End-to-end behavior
- AC18: 브라우저에서 `/replay/{key}` 진입 → 첫 10초 동안 console 429 count = 0 (manual verify, 로컬 dev StrictMode 포함)
- AC19: lookahead 가 한꺼번에 6 req (2 windows × 3 endpoints) 발사돼도 client queue 가 3 req/s 로 분산 — 첫 6 req 완료까지 wall-clock ≥ 1.67s (test 또는 manual)
- AC20: 664 기존 테스트 전부 pass + tsc clean + lint clean

---

## 3. Design

### 3.1 Public API

```typescript
// src/shared/openf1Client.ts (NEW)

export type RequestPriority = 'high' | 'normal' | 'low';

export interface OpenF1Params {
  [key: string]: string | number | boolean;
}

export interface FetchOptions {
  path: string;                    // e.g. '/v1/laps'
  params?: OpenF1Params;           // e.g. { session_key: 12345 }
  priority?: RequestPriority;      // default 'normal'
  signal?: AbortSignal;            // caller abort
  dedupeKey?: string;              // override auto-canonical key
}

export interface OpenF1ClientMetrics {
  totalRequests: number;
  in429: number;
  in5xx: number;
  retries: number;
  queueDepth: number;
  inflight: number;
}

export type RequestEvent =
  | { kind: 'send'; url: string; priority: RequestPriority }
  | { kind: 'retry'; url: string; status: number; attempt: number; waitMs: number }
  | { kind: 'ok'; url: string; status: number; ms: number }
  | { kind: 'fail'; url: string; status?: number; error?: string };

export interface OpenF1ClientOptions {
  baseUrl?: string;                       // default 'https://api.openf1.org'
  fetchImpl?: typeof fetch;               // test seam
  ratePerSecond?: number;                 // default 3 (refill rate)
  bucketCapacity?: number;                // default 1 — burst limit (strict 334ms spacing). 2~3 으로 올리면 첫 N개 burst 후 spacing
  maxConcurrent?: number;                 // default 6 (in-flight cap)
  maxRetries?: number;                    // default 3
  backoffBaseMs?: number;                 // default 1000
  backoffMaxMs?: number;                  // default 30_000
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;  // test seam — abort 가능
  /** test seam — bucket refill 의 setTimeout 도 injectable. fake timer 호환. default 내부 setTimeout */
  schedule?: (cb: () => void, ms: number) => () => void;
}

export class OpenF1Client {
  constructor(opts?: OpenF1ClientOptions);
  fetch(opts: FetchOptions): Promise<Response>;
  fetchJson<T>(opts: FetchOptions): Promise<T>;
  getMetrics(): OpenF1ClientMetrics;
  onRequestEvent(cb: (e: RequestEvent) => void): () => void;
  /** test only */
  _resetForTest(): void;
}

/** 모듈-스코프 싱글톤 (production). 테스트는 new OpenF1Client(...) 직접 사용. */
export const openF1Client: OpenF1Client;
```

### 3.2 Internals

#### Token bucket
- `ratePerSecond=3` (refill rate, 토큰 1개당 ~334ms 추가) + `bucketCapacity=1` (default — 최대 보유 토큰 수)
- 토큰 없으면 queue 에서 대기
- **기본 capacity=1**: 동시 N 호출 시 첫 1개 즉시 + 나머지 N-1 개는 334ms 간격 (AC1 의 ≥ 334ms 보증)
- capacity 를 2~3 으로 설정하면 첫 N개 burst → 이후 334ms 간격. 이는 OpenF1 의 ~3-5 req/s burst limit 활용용 — default 는 보수적으로 1
- refill 은 `schedule` 옵션으로 inject 가능 (vitest fake timer 호환)

#### Priority queue (3 separate FIFOs)
- 등급: `high > normal > low`
- dequeue 시 비어있지 않은 가장 높은 priority 의 head 발사
- 같은 priority 내에서는 enqueue 순서 (FIFO 보존 — LIVE_CADENCE 순서 보존 핵심)

#### In-flight dedup + priority promotion
- key = `${path}?${sortedParamsCanonical}` (numbers→string, booleans→`'true'`/`'false'`, alphabetic sort, operator suffix `date>=` 별개 key)
- **Queue 단계 dedup**: 같은 key 가 queue 에 있고 새 caller 가 다른 priority 로 join 시 — queue entry 가 `max(priorities)` 로 **promote**. 가장 높은 우선순위로 dispatch (AC7a).
  - 예: low 로 enqueue → high 가 같은 key 로 join → 그 entry 는 high tier 에서 dispatch
- **In-flight 단계 dedup**: 이미 fetch 발사된 경우 priority 변경 불가. 새 caller 는 단순히 결과 share (이미 늦음)
- 모든 dedup caller 가 같은 Promise 받음 (single fetch, multi-resolver)

#### Abort decision table

dedup 공유 중일 때 caller 의 abort 가 어떻게 처리되는지:

| Caller 상태 | In-flight 상태 | 결과 |
|---|---|---|
| 1명만 caller, queue 에서 대기 | 미발사 | queue 에서 제거, caller reject `AbortError`, metrics queueDepth-- |
| 1명만 caller, in-flight | fetch 중 | fetch 의 underlying AbortSignal 전파 → fetch reject, caller reject `AbortError`, inflight map cleanup |
| 다명 share, 1명만 abort | 미발사 (queue) | 그 caller 의 subscription 만 제거. queue entry 는 다른 caller 가 남아있으면 유지. caller reject `AbortError`, 나머지 정상 |
| 다명 share, 1명만 abort | in-flight | 그 caller subscription 만 제거. in-flight fetch 계속. caller reject `AbortError`, 나머지 fetch 결과 정상 수신 |
| 모든 share caller abort | in-flight | ref-count == 0 → fetch 의 AbortSignal 전파, inflight map 정리, metrics inflight-- |
| caller, in-flight 가 backoff sleep 중 | sleep 중 | sleep 즉시 깨움 (AbortSignal-aware sleep), retry 진행 안 함, caller reject `AbortError` |

#### Backoff
- `rateLimitedFetch.ts` 의 `computeWaitMs` 로직 그대로 이식. `Retry-After` (numeric / HTTP date) honor, 없으면 `base × 2^attempt` cap (`backoffMaxMs=30s`)
- backoff sleep 은 AbortSignal-aware — abort 시 즉시 깨움 (AC5d)

#### Metrics + logging
- counter (totalRequests/in429/in5xx/retries) 와 gauge (queueDepth/inflight) 분리. queue/inflight 변화 시점에 gauge 갱신
- 429/5xx 발생 시:
  - **dev (`import.meta.env.DEV`)**: `console.warn(\`[openF1Client] ${kind} ${status} ${url} attempt=${n} wait=${ms}ms\`)`
  - **prod**: 발화 안 함 (사용자 console noise 방지). 대신 `onRequestEvent` 콜백으로 HUD/외부 logger 가 수신 가능
- (AC10 prod console.warn 정책 변경 — critic M.MIN3 반영)

#### Event subscription
- `onRequestEvent(cb)` — `cb` 는 동기 호출 (event loop 즉시). HUD 등이 React state 업데이트 시 batch 처리 가능

#### Module singleton lifecycle (HMR + StrictMode 대응)
- `export const openF1Client = new OpenF1Client(...)` — module-scope 싱글톤
- Vite HMR 재로드 시: 새 module instance 가 만들어지면서 기존 inflight Promise 가 orphan 될 수 있음. dev 한정 issue (prod build 영향 없음). 임시 mitigation: HMR `accept` 안 함 — 변경 시 full reload (Vite 기본)
- React StrictMode 이중 mount: dedup map 이 module-scope 라 같은 key 의 두 번째 호출은 자동 share — burst 안 됨

### 3.3 Concurrency model

```
caller → enqueue(priority, fetchOptions)
       ↓
   [priority queue]  ← waiting for token
       ↓
   bucket.take() (async)
       ↓
   dedup check (key in inflight?)
       ↓ yes → share Promise
       ↓ no  → fetch(url, {signal}) → on 429/5xx → sleep(waitMs) → loop (≤ maxRetries)
       ↓
   resolve to all subscribers
```

In-flight cap (`maxConcurrent=6`) — token bucket 만으로는 slow OpenF1 응답 시 in-flight 가 누적될 수 있어 safety net 으로 동시 in-flight 6개 cap.

### 3.4 Dedup key canonicalization

- Sort params keys alphabetically
- Numbers → string (`session_key=12345`)
- Booleans → `'true'`/`'false'`
- 같은 path 다른 params 는 별개 key. operator suffix (`date>=`, `date<=`) 도 별개 key (역사적 윈도우 다름).

---

## 4. Implementation Steps

### Step 1 — Client 신규 작성 + 단위 테스트 (2일, 기존 추정 1.5일 → ↑0.5)
- 파일: `src/shared/openf1Client.ts` (~400 LOC — token bucket + priority queue + dedup + abort + backoff + metrics + events 합치면 실측 ~400)
- 테스트: `src/shared/__tests__/openf1Client.test.ts` (~500 LOC, 26+ test cases)
- 테스트 항목 (AC 1-10, AC5a-d, AC7a-b cover):
  - token bucket 분산 (fake timer, capacity=1)
  - bucket capacity > 1 burst 동작 (AC1 capacity 옵션)
  - in-flight dedup (10개 동시 호출 → 1개 fetch)
  - dedup priority promotion (low queued → high join → high tier 에서 dispatch) — AC7a
  - 429 backoff + Retry-After (numeric + HTTP date)
  - 5xx backoff
  - 4xx 즉시 reject
  - AC5a (solo abort, queue 단계)
  - AC5b (dedup share, 1명 abort — 나머지 정상)
  - AC5c (모든 share abort → in-flight cancel)
  - AC5d (backoff sleep 중 abort)
  - 우선순위 queue (high 가 먼저 발사)
  - FIFO 보존 (같은 priority enqueue 순서) — AC7b
  - metrics counter
  - request events (sync 발화 + leak 없음)
- Verify: `npx vitest run src/shared/__tests__/openf1Client.test.ts`

### Step 1.5 — `createMockOpenF1Client` test util + 8개 테스트 마이그레이션 골격 (1일, **신규**)
- 파일: `src/shared/__tests__/createMockOpenF1Client.ts` — 공유 mock factory
- 8개 테스트 파일 (AC17 list) 의 mock import 전환 — 실제 assertion 변경은 Step 2-6 에서 각 호출자 마이그레이션과 함께
- Verify: tsc clean + 기존 mock 사용 site 가 새 utility 로 routed

### Step 2 — corsPing 마이그레이션 (0.5일)
- [src/live/corsPing.ts](../../src/live/corsPing.ts)
  - `pingOpenF1()` 가 `openF1Client.fetch({path: '/v1/sessions', params: {session_key: 'latest'}, priority: 'low'})` 사용
  - 5s timeout AbortController 유지
  - 기존 fetchImpl prop 은 client mock seam 으로 대체 (테스트 호환)
- 테스트 업데이트: `corsPing.test.ts` 가 client mock 사용

### Step 3 — LiveMap drivers fetch 마이그레이션 (0.5일)
- [src/live/LiveMap.tsx:123](../../src/live/LiveMap.tsx#L123)
  - `driversUrl` 직접 fetch → `openF1Client.fetchJson({path: '/v1/drivers', params: {session_key}, priority: 'normal', signal: ctrl.signal})`
  - `OPENF1_BASE` 상수 제거 (client 가 소유)
- 테스트 업데이트: `LiveMap.test.tsx` mock client

### Step 4 — LiveDataSource 마이그레이션 (1일)
- [src/map/LiveDataSource.ts](../../src/map/LiveDataSource.ts)
  - `fetchImpl` 옵션 + `rateLimitedFetch` 직접 호출 제거
  - 모든 hydration/cadence 호출이 `client.fetchJson(...)` 사용
  - `hydrationTokenIntervalMs` 옵션 **제거** (client 가 ownership) + breaking change 명시 (옵션 사용처 없음 — 테스트 외)
  - **LIVE_CADENCE 순서 보존** (location→position→intervals→race_control→laps→pit→stints→weather): hydration 시 LIVE_CADENCE 배열 순서대로 `client.fetchJson()` 호출 → 같은 priority 내 FIFO 가 보존됨 (AC7b)
  - location/position/intervals 은 priority='high', 나머지는 priority='normal' (AC6)
- 테스트 업데이트: `LiveDataSource*.test.ts` (~3 파일) client mock 사용

### Step 5 — ReplayDataSource 마이그레이션 (1일)
- [src/map/ReplayDataSource.ts](../../src/map/ReplayDataSource.ts)
  - `fetchImpl` + `rateLimitedFetch` + `requestSpreadMs` + `sleep` 옵션 제거
  - sparse 6개 → `client.fetchJson(..., priority='normal')` × 6 (병렬 enqueue, client 가 분산)
  - dense lookahead → `client.fetchJson(..., priority='high')` (location/position) / `'normal'` (intervals)
  - `ensureLookahead` 의 `Promise.all` 그대로 유지 — client 가 알아서 분산
  - 내부 `cache` Map + `inflight` Map 은 유지 (window-level dedup, client 의 path-level dedup 과 다른 layer)
- 테스트 업데이트: `ReplayDataSource.test.ts` client mock

### Step 6 — revalidateSeason 마이그레이션 (0.25일)
- [src/main/stores/revalidateSeason.ts](../../src/main/stores/revalidateSeason.ts)
  - `client.fetchJson({path: '/v1/sessions', params: {year}, priority: 'low', signal})`
  - 5s timeout AbortController 유지
- 테스트 업데이트

### Step 7 — rateLimitedFetch 삭제 + dashboard addendum (0.25일)
- [src/map/rateLimitedFetch.ts](../../src/map/rateLimitedFetch.ts) **삭제**
- [src/map/__tests__/rateLimitedFetch.test.ts](../../src/map/__tests__/rateLimitedFetch.test.ts) **삭제** (client 테스트가 동등 cover)
- [.omc/plans/dashboard-implementation.md](./dashboard-implementation.md) §5 architecture 다이어그램 위에 한 paragraph 추가:
  ```markdown
  > **2026-06 update — OpenF1Client 도입**: 모든 브라우저 OpenF1 호출은 `src/shared/openf1Client.ts` 싱글톤을 통해 routing 된다 (token bucket 3 req/s + priority queue + dedup + 429 backoff). LiveDataSource/ReplayDataSource 는 fetch 디테일을 client 에 위임하며, DataSource 인터페이스와 panel 코드는 변경 없음. 자세한 내용은 [openf1-client.md](./openf1-client.md) 참고.
  ```

### Step 8 — Integration verify + browser smoke (0.5일)
- 전체 테스트 + tsc + lint pass
- 브라우저 dev (`npm run dev`) 에서:
  - `/replay/{key}` 진입 → console 10초간 429 count = 0
  - Network tab → 같은 URL 중복 호출 0건 (dedup 검증)
  - 메인페이지 → 라이브 진입 → 뒤로 가기 → 다른 세션 → 429 없음

---

## 5. Migration map (call site 별)

| 파일 | 변경 전 | 변경 후 |
|---|---|---|
| `src/shared/openf1Client.ts` | 없음 | 신규 (싱글톤 + 클래스) |
| `src/live/corsPing.ts` | `fetchImpl(url, {mode:'cors',signal})` | `client.fetch({path, params, priority:'low', signal})` |
| `src/live/LiveMap.tsx` | `fetcher(\`${OPENF1_BASE}/v1/drivers?...\`, {signal})` | `client.fetchJson({path:'/v1/drivers', params, signal})` |
| `src/map/LiveDataSource.ts` | hydration token bucket 자체 구현 + `rateLimitedFetch` | client 위임. `hydrationTokenIntervalMs` 옵션 삭제 |
| `src/map/ReplayDataSource.ts` | `requestSpreadMs` + `rateLimitedFetch` + manual spread | client 위임. `requestSpreadMs` 옵션 삭제 |
| `src/main/stores/revalidateSeason.ts` | `fetchImpl(url, {signal})` | `client.fetchJson({...priority:'low'})` |
| `src/map/rateLimitedFetch.ts` | 존재 | **삭제** |
| `src/map/__tests__/rateLimitedFetch.test.ts` | 존재 | **삭제** |

---

## 6. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Client 가 새 bottleneck 가 됨 — slow OpenF1 응답이 queue backlog 누적 | Mid | High | `maxConcurrent=6` safety cap + metrics 노출 → dev 시 monitoring. queue 가 무한 늘면 dev 에서 `console.warn` |
| AbortSignal + dedup 의 ref-count 버그로 다른 caller 의 fetch 가 abort 됨 | Mid | High | 전용 단위 테스트 (AC5) — 3 caller dedup 중 1명만 abort 시 나머지 2명 결과 정상 수신 |
| StrictMode dev 이중 mount 시 모든 호출이 dedup 되어 1번만 발사되어야 하는데 `_resetForTest` 등으로 잘못 비워질 위험 | Low | Mid | dedup map 은 module-singleton scope. test 만 `_resetForTest` 호출 (E2E 에서는 호출 안 함) |
| `hydrationTokenIntervalMs` / `requestSpreadMs` 제거가 외부 옵션 — 사용자 코드 깨질 위험 | Very Low | Low | 두 옵션 모두 internal (LiveMap/ReplayScreen 외 사용처 없음, default 만 사용). PR description 에 breaking 명시 |
| Replay seek/speed 변경 시 lookahead burst 가 client queue 를 가득 채워 location (high priority) 가 막힘 | Mid | Mid | priority queue 가 정확히 이걸 해결. 단 priority='normal' 의 queue 가 너무 깊어지면 backlog → metrics 로 감지. dashboard 단계에서 speed=4x 시 재평가 |
| 테스트 mock seam 변경 (11개 파일) 중 1-2개에서 covering case 손상 | High | Low | step 1 에서 client mock util `createMockOpenF1Client()` 작성 → 모든 테스트가 일관 사용 |
| 우선순위 starvation — low 가 영원히 안 발사됨 | Low | Low | 실 운용에서 low 발사처는 ping (세션 진입 1회) + revalidate (메인페이지 1회). high 가 26 req/min steady-state 라 low 발사 안 될 일 없음. starvation 발생 시 priority aging 추가 검토 (현재는 over-engineering) |
| client 가 abort 받았는데 in-flight 가 비-abort 가능한 await 중 → memory leak | Low | Low | 모든 await 가 `sleep(ms, {signal})` 으로 abort 지원. test 로 검증 |
| **R9: 브라우저 탭 background throttling** — `setTimeout` 이 1Hz 로 clamp → 토큰 bucket refill 멈춤. 탭 복귀 시 queue 누적분 burst | Mid | Mid | (a) `visibilitychange` 리스너로 background 진입 시 cadence interval pause, foreground 복귀 시 resume. LiveDataSource 의 기존 `LiveDataSourceTabResume.test.ts` 패턴 차용. (b) bucket refill 도 visibility 신호로 일시 정지 |
| **R10: Vite HMR singleton orphan** — module 재로드 시 새 `openF1Client` instance, 기존 in-flight Promise orphan | Low | Low | dev 한정. prod build 영향 없음. mitigation: HMR `accept` 안 함 → full reload (Vite default) |
| **R11: Metrics ring buffer 무한 성장** — 60s sliding window 인데 명시적 eviction 정책 없으면 long-running 세션에서 leak | Low | Mid | §13.3 에 eviction 정책 명시 — 새 event push 시 `timestamp < now - 60s` 인 entry 삭제. max size cap = `ratePerSecond × 60 + safety = 200`. AC26 가 leak 검증 |

---

## 7. Verification Steps

### Automated
1. `npx vitest run` — 664 + new 약 25 = 690+ 전부 pass
2. `npx tsc --noEmit` — 0 errors
3. `npm run lint` — 0 errors

### Manual (browser dev)
4. `npm run dev` 후 Chrome
5. 메인페이지 → 임의 세션 클릭
6. DevTools console 10초간 monitoring → `429 Too Many Requests` 0건
7. DevTools Network → `/v1/laps?session_key=...` 1건만 (중복 0)
8. 뒤로 → 다른 세션 진입 → 429 없음
9. (있다면) StrictMode 더블 mount 확인 — React DevTools 또는 console log 로 mount 2회지만 fetch 는 dedup 된 1회만

---

## 8. Sequencing (dashboard 와의 관계)

```
[현재]
  → Step 1-8 (OpenF1Client, ~5일)
  → dashboard plan §5 addendum (Step 7 의 일부)
  → [Dashboard 구현 시작 — dashboard-implementation.md §10 단계 1-N]
```

Dashboard plan 본문 (§1-§9) 은 client 도입 후에도 **무변경 사용**. DataSource 인터페이스가 변하지 않으므로 panel 코드 작성 시 client 존재 인지 불필요.

**Dashboard 단계에서 client 가 추가로 받을 수 있는 work** (이번 plan 의 scope 아님, 후속):
- panel-level abort 통합 (panel unmount 시 in-flight cancel)
- 만약 dashboard 가 새 endpoint 추가하면 client 의 priority 매핑만 업데이트

---

## 9. Out of scope

- `scripts/_lib/openf1Client.ts` (node CLI) — 환경 다름 (`node-fetch` + retry-after + bottleneck), 별개 유지
- Service Worker / IndexedDB cache — Phase 3 후순위
- WebSocket 실시간 stream 어댑터 — deployment-architecture.md 미래 work
- ETag / Cache-Control 기반 HTTP cache layer — 현재 OpenF1 응답이 cacheable header 안 보냄

---

## 10. Estimated effort

| Step | Effort |
|---|---|
| Step 1 — Client + 단위 테스트 | **2일** (critic: 250 → 400 LOC, AC5a-d/AC7a-b 추가) |
| Step 1.5 — `createMockOpenF1Client` test util + 8 파일 migration 골격 | **1일** (신규, critic M4) |
| Step 2 — corsPing | 0.5일 |
| Step 3 — LiveMap drivers | 0.5일 |
| Step 4 — LiveDataSource | 1일 |
| Step 5 — ReplayDataSource | 1일 |
| Step 6 — revalidateSeason | 0.25일 |
| Step 7 — 삭제 + addendum | 0.25일 |
| Step 8 — verify + browser smoke | 0.5일 |
| Step 9 — Debug HUD (§13) | 0.5일 |
| Step 10 — LiveMap buffering overlay + stream badge + 429 banner | 0.5일 |
| Step 11 — LiveScreen (현재 변경 없음, critic M7 반영) | 0일 |
| **Total (v1)** | **~7.5일** (이전 5일 → 7.5일, critic Step 1.5 + LOC 조정 + Step 11 cancel) |

---

## 11. ADR (Architecture Decision Record)

- **Decision**: 브라우저 측 모든 OpenF1 fetch 를 `src/shared/openf1Client.ts` 싱글톤 (token bucket 3 req/s + priority queue + dedup + 429/5xx backoff + abort + observability) 으로 routing.
- **Drivers**:
  1. 현재 429 burst 가 dev 경험을 망치고 있고, 5개 분산 호출자로 인해 부분 fix 가 비효율
  2. Dashboard 가 fetch surface 확장 없이 query 빈도만 늘릴 예정 — client 도입이 dashboard 진입에 영향 0
  3. 단일 chokepoint 가 future observability/cache/auth 의 자연스러운 hook point
- **Alternatives considered**:
  - **A. 현재 plan 의 ensureLookahead 만 spread 적용** — 가장 작은 변경. 4개 다른 호출자의 burst 는 남음. 진단도 어렵. **거부**: 임시방편.
  - **B. LiveDataSource/ReplayDataSource 안에 더 정교한 spread 로직** — 두 클래스 사이 조율 없음 → 어차피 burst. **거부**: 본질적 해결 안 됨.
  - **C. Service Worker 로 cache + rate limit** — heavy, dev/prod 차이, debugging 어려움. **거부**: over-engineering.
  - **D. fetch wrapper 함수만 (class 없이)** — module-scope let 변수로 token bucket + in-flight map 공유 가능 (현재 `rateLimitedFetch.ts` 가 함수 패턴이고 테스트 가능). 그러나 priority queue + abort + metrics + event subscription 은 **lifecycle 조율** 필요 — init/reset (테스트 격리), listener cleanup, HMR 대응 — 이를 6+ 개 module-scope let 으로 흩어 놓으면 추적 어려움. **거부**: lifecycle coordination 비용 > class overhead (critic M8 반영).
- **Why chosen**: 표준적 client 패턴 (Bottleneck, p-queue, axios-rate-limit 류). 작은 scope (250 LOC + 테스트). DataSource 추상화 무변경 → dashboard plan 영향 0. 5일 투자로 429 근본 해결 + dashboard 안전.
- **Consequences**:
  - + 모든 OpenF1 호출이 단일 진입점 — backoff/dedup/metrics 일관
  - + Dashboard 의 query 추가가 network 부담 ↑ 안 함 (in-memory buffer 만 query)
  - − 새 추상화 한 layer 추가 — call site 코드는 약간 더 verbose (`client.fetchJson({path, params})` vs `fetch(url)`)
  - − `hydrationTokenIntervalMs` / `requestSpreadMs` 옵션 제거 (테스트 외 사용처 없으므로 안전)
- **Follow-ups**:
  - dashboard Phase 1 (§10 step 1-3) 완료 후 priority 매핑 재검토
  - 만약 OpenF1 가 future 에 rate limit 헤더 추가하면 client 가 자동 honor
  - metrics 를 UI 에 노출 (SimBadge 처럼 dev only HUD) — 후속

---

## 12. 지연 발생 시 화면별 UX 처리

Client 가 token bucket·queue·backoff 를 끼면서 자연스럽게 발생하는 지연은 화면마다 의미가 다르다. 화면별 정책:

### 12.1 MainPage ([src/main/MainPage.tsx](../../src/main/MainPage.tsx))
- **Client 호출**: `revalidateCurrentSeason` 1회 (priority='low')
- **사용자 가시성**: 0 — `seasons/{year}.json` (same-origin) 가 이미 화면을 채움. revalidate 는 백그라운드 비교 후 변경 있으면 Toast 발화 ([MainPage.tsx:47](../../src/main/MainPage.tsx#L47))
- **지연 처리**: **무처리**. AbortController 5s timeout 으로 stuck 방지. timeout 발생 시 `console.warn` 만 ([revalidateSeason.ts:55](../../src/main/stores/revalidateSeason.ts#L55)) — 기존 동작 보존
- **AC**: client 가 revalidate 를 30s 지연시켜도 메인페이지 사용자 경험 변화 0

### 12.2 LiveScreen / ReplayScreen ([src/live/LiveScreen.tsx](../../src/live/LiveScreen.tsx), [ReplayScreen.tsx](../../src/live/ReplayScreen.tsx))
- **Client 호출**: `pingOpenF1` 1회 (priority='low')
- **사용자 가시성**: 명시적 게이팅 — `pingState = 'pending'` 동안 `Connecting…` 표시
- **지연 처리**: 기존 5s timeout 유지. client queue 가 ping 발사를 5s 이상 지연시키면 `pingState = 'failed'` → `CorsFailedNotice` (기존 동작 그대로)
- **HUD 와의 관계**: 진단 정보는 §13 Debug HUD 가 cover. `Connecting…` 자체는 단순 유지 (전용 dev info 줄 추가 안 함 — critic M7)
- **AC**: high-priority queue 가 비어있을 때 ping 발사 ≤ 1s

### 12.3 LiveMap ([src/live/LiveMap.tsx](../../src/live/LiveMap.tsx))
- **Client 호출**: drivers (priority='normal') + DataSource 내부 호출들 (priority='high'/'normal')
- **사용자 가시성**: `assets === null` 동안 `Loading track…` 표시 ([LiveMap.tsx:328-334](../../src/live/LiveMap.tsx#L328-L334))
- **지연 처리**:
  - **기존**: 15s asset fetch timeout 유지
  - **신규 A — Buffering indicator**: 첫 location sample 수신 전까지 canvas 위에 `Buffering location data…` overlay 표시. `DataSource.getStreamState() === 'buffering'` 으로 판단
  - **신규 B — Stream state badge**: 우측 상단 작은 pill 로 stream state 표시 (`LIVE` / `LIVE -2s` / `LAGGING` / `STALLED`). `StreamState` enum 그대로 사용 ([DataSource.ts:46](../../src/shared/DataSource.ts#L46)). 기존 stream-state 인프라 재활용 — 새 metric 도입 없음
  - **신규 C — Backoff 경고**: client 가 직전 60s 내 429 ≥ 3 발생 시 화면 상단에 banner `API rate-limited — markers may be delayed`. event listener (`client.onRequestEvent`) 로 감지. dismissible
- **AC**:
  - asset 로드 중 `Loading track…` 표시 (기존)
  - first location sample 수신 전 buffering overlay 표시 (신규)
  - 429 ≥ 3/min 시 backoff banner 표시 (신규)
  - banner 는 60s 동안 429 발생 0 이면 자동 dismiss

### 12.4 Dashboard (future, dashboard-implementation.md 와 통합)
- **Client 호출**: 0 (DataSource 의 in-memory buffer 만 query)
- **사용자 가시성**: 패널은 항상 즉시 렌더 — `getLatestBefore` / `getAllBefore` 가 동기 메서드라 queue/backoff 영향 없음
- **간접 지연**: 새 data sample 이 buffer 에 늦게 들어오면 panel 의 last update time 이 stale
- **지연 처리**:
  - **신규 D — Per-panel staleness chip**: 각 패널 우측 상단에 작은 `T-Xs` chip (`getLatestBefore(...).date` 와 `display_time` 차이). 차이 ≥ 패널별 threshold 면 회색→주황으로 색 변화. 예: weather threshold 60s, race_control 30s, leaderboard 10s
  - **신규 E — Global stream badge 재사용**: LiveMap 의 `StreamState` badge 가 dashboard 상단 헤더에 share (panel 별 chip 보다 우선 신호). `'stalled'` 면 모든 panel 이 회색 dim
- **AC** (dashboard plan §6 acceptance criteria 에 통합):
  - 모든 panel 에 staleness chip 표시 (color-coded)
  - stream='stalled' 시 panel dim
  - panel 렌더링 시간 ≤ 16ms (queue/backoff 와 독립)

### 12.5 정책 요약 표

| 화면 | Loading | Buffering | Stream lag | 429 burst | Data stale |
|---|---|---|---|---|---|
| Main | 정적자산 즉시 | n/a | n/a | 무처리 | n/a |
| LiveScreen | `Connecting…` (5s timeout) | n/a | n/a | ping fail | n/a |
| LiveMap | `Loading track…` (15s timeout) | overlay (신규) | StreamState badge | Banner (신규) | n/a |
| Dashboard | n/a (DataSource 동기) | n/a | StreamState badge | Banner (LiveMap 공유) | per-panel chip (신규) |

---

## 13. Debug HUD (Phase 2 of this plan)

### 13.1 컴포넌트
- **위치**: `src/shared/OpenF1DebugHud.tsx` (신규, ~80 LOC)
- **렌더 위치**: `App.tsx` 의 `<Switch>` 바깥 — Footer 옆 / SimBadge 처럼 `position: fixed` corner
- **노출 정책**:
  - `import.meta.env.DEV === true` → always-on
  - `import.meta.env.DEV === false` (prod) → 기본 off
  - URL `?debug=hud` query → prod 에서도 on (zero-config 진단)
  - **Persistence 모델 (critic M2)**: `App.tsx` mount 시점에 `?debug=hud` 평가 → React state 로 보관. 한 번 활성화된 탭은 navigation 후에도 HUD 유지 (wouter `<Link>` 는 query 손실 가능하지만 mount-once 모델이라 영향 없음). 새 탭 열면 query 없으면 off.
  - **v1 에 토글 UI 없음** — `?debug=hud` 또는 dev 환경만. 토글 UI 는 v2 후속

### 13.2 표시 metric (모두 client.getMetrics() + window 통계)
```
[⚡ OF1 Client]
queue: 3 (H1 N2 L0)   inflight: 2/6
wait now: 1240ms      /min: 8.4s
429: 2/min            reqs: 26/min
```

- `queue` — 현재 queue depth (priority 별 분포 `H/N/L`)
- `inflight` — 동시 실행 중 fetch 수 / cap
- `wait now` — 가장 오래 queue 또는 backoff 중인 req 의 대기 시간 (ms, 100ms 단위 polling)
- `wait /min` — 지난 60s queue+backoff 누적 시간 합 (sec, 0.1s 단위)
- `429 /min` — 지난 60s 429 응답 count
- `reqs /min` — 지난 60s 발사된 fetch count (전체 priority 합)

### 13.3 데이터 소스 (client API)
- `client.getMetrics()` — 동기 snapshot (queue/inflight)
- `client.onRequestEvent(cb)` — 이벤트 stream 으로 sliding window 통계 계산
- **HUD 내부 60s ring buffer (critic M3 + R11)**:
  - 새 event push 시 `timestamp < now - 60s` 인 entry 모두 삭제
  - max size cap = `ratePerSecond × 60 + safety margin = 200` events. 초과 시 가장 오래된 것부터 drop (그래도 60s 윈도우 stat 정확성 유지 — 200개로 충분)
- HUD re-render 주기: **500ms** (100ms → 500ms, critic 의 wasteful 지적 반영). React state 갱신은 `useState` + `setInterval`. 시각적으로 충분하고 CPU 부담 1/5

### 13.4 시각 디자인
- 기존 `SimBadge.tsx` 와 동일 스타일 (`position: fixed`, `font-family: var(--font-mono)`, `border-radius: 999px`, dark pill)
- **위치**: `bottom: 60px, right: 12px` (Footer 가 `App.tsx:24` 에서 항상 마운트 — bottom: 12px 면 Footer 와 겹침. 60px 로 clear. SimBadge 의 `bottom-left` 와도 코너 반대 — 겹침 방지)
- **크기**: 4 lines × monospace, 약 240×80px
- **색**:
  - 정상: 회색 (`var(--color-text-secondary)`)
  - 429 ≥ 1/min: 주황
  - 429 ≥ 5/min 또는 wait /min ≥ 30s: 빨강

### 13.5 v2 토글 (out of scope — 후속)
- Keyboard shortcut: `Ctrl+Shift+D` (Mac: `Cmd+Shift+D`)
- 토글 상태: `localStorage.openf1HudVisible`
- v2 PR 에서 ~30 LOC 추가 예정

### 13.6 AC (HUD)
- AC21: dev 환경에서 모든 라우트 (`/`, `/live/:k`, `/replay/:k`, `/test-rig`) HUD 표시
- AC22: prod 환경에서 HUD 미표시 (기본)
- AC23: `?debug=hud` query 추가 시 prod 에서도 표시
- AC24: client 가 30 req 발사 후 HUD 의 `reqs /min` 가 30
- AC25: 강제 429 simulation 후 HUD `429 /min` 가 정확한 count 표시
- AC26: HUD 컴포넌트가 mount/unmount 시 client.onRequestEvent listener 누수 없음 (test: listener count 검사)

### 13.7 구현 step 매핑
- Step 9 — `OpenF1DebugHud.tsx` 신규 + `App.tsx` mount (§10 effort table)
- Step 10 — `LiveMap` buffering overlay + stream badge + 429 banner (§10 effort table)
- Step 11 — `LiveScreen` 의 `Connecting…` 화면 — critic M7 반영, **추가 작업 없음** (HUD 가 진단 역할)
- Dashboard 의 per-panel staleness chip (§12.4 신규 D) 는 dashboard-implementation.md 의 panel 작업과 함께 (별도 plan)

**Total effort**: §10 effort table 참고 (**~7.5일** v1)

---

## 14. Open question for v2 (이 plan 의 scope 아님)
- HUD 토글 keyboard shortcut 선택 (`Ctrl+Shift+D` 권장)
- HUD 의 detailed view (expand 시 각 endpoint 별 latency p50/p95 차트) — 후속
- 429 backoff banner 를 모든 화면 공통 component 로 격상할지 (현재는 LiveMap-only)

---

## 15. Changelog

### v3 (2026-06-01) — Critic review 적용
Critic agent (`oh-my-claudecode:critic`) REVISE verdict 반영. 3 CRITICAL + 6 Major findings 처리.

**Critical fixes:**
- **C1 (dedup ignores priority)**: §3.2 dedup priority promotion 규칙 명시 + AC7a 신설 — queued (미발사) entry 는 새 caller 가 더 높은 priority 로 join 시 promote
- **C2 (abort spec vague)**: §3.2 abort 6-row decision table 신설 + AC5 → AC5a/b/c/d 4분할 (solo/share-1abort/share-all-abort/backoff-sleep-abort)
- **C3 (bucket capacity undefined)**: `OpenF1ClientOptions` 에 `bucketCapacity?: number` (default 1) 추가 + AC1 명시 — default capacity=1 로 ≥ 334ms spacing 보장

**Major fixes:**
- **M1 (drivers priority)**: drivers fetch priority='normal' → '**high**' (user 가 "Loading track…" 에서 block) — AC6, AC12 업데이트
- **M2 (?debug=hud persistence)**: §13.1 — App.tsx mount-once 평가 + React state 보관. wouter navigation 후에도 유지
- **M3 (ring buffer leak)**: §13.3 + R11 신설 — `timestamp < now-60s` eviction + max size cap 200, AC26 가 검증
- **M4 (test mock churn underestimated)**: AC17 의 "11 테스트 파일" → 8개 파일 명시 list. Step 1.5 (`createMockOpenF1Client` util + 8 파일 migration, 1일) 신규 추가
- **M5 (hydration FIFO ordering)**: Step 4 — LIVE_CADENCE 순서 보존 명시 + AC7b 신설
- **M7 (dev-only Connecting queue info)**: §12.2 에서 제거 — HUD 가 진단 역할 cover
- **M8 (ADR-D straw-man)**: 거부 사유를 lifecycle coordination 으로 재작성

**Minor fixes:**
- **MIN3 (prod console.warn noise)**: AC10 + §3.2 — dev only `console.warn`, prod 는 onRequestEvent callback 으로 routing
- **MIN2 (Footer collision)**: HUD position `bottom: 60px` (12px → 60px, Footer 회피)

**Risks 추가:**
- **R9**: 브라우저 탭 background throttling (setTimeout 1Hz clamp + foreground burst)
- **R10**: Vite HMR singleton orphan (dev only)
- **R11**: Metrics ring buffer 무한 성장 (M3 mitigation 적용)

**Test seam 강화:**
- `sleep(ms, signal?)` — AbortSignal-aware (AC5d 필수)
- `schedule(cb, ms)` — bucket refill 의 setTimeout 도 inject 가능 (vitest fake timer 호환)

**Effort 재산정:**
- 이전: 5일 → 6.25일 (§12/§13 추가 후)
- v3: **7.5일** (Step 1 +0.5, Step 1.5 신규 +1, Step 11 -0.25)

**유지 (불변경):**
- §0 Why / §1 Requirements / §11 ADR Decision/Drivers/Why chosen 본문
- 5개 호출 site 마이그레이션 list
- 664 테스트 baseline (critic 의 ~647 추정은 잘못 — 실측 confirmed)
- Dashboard plan 짧은 addendum 정책 (재작성 ❌)

### v2 (2026-06-01) — User 요청 추가
- §12 화면별 지연 UX 처리 (main/live/replay/dashboard)
- §13 Debug HUD (corner-fixed, dev always-on / prod ?debug=hud)
- Metric 정의: queue+backoff 누적 시간 (network RTT 제외)

### v1 (2026-06-01) — 초안
- OpenF1Client singleton 설계
- 5 site 마이그레이션
- rateLimitedFetch 흡수
- Dashboard plan addendum 전략

---

## Status

- [x] Plan v1 drafted
- [x] §12 화면별 지연 처리 추가 (v2)
- [x] §13 Debug HUD 추가 (v2)
- [x] Critic review 반영 (v3) — C1-C3 + M1-M8 + Risks + Effort
- [ ] User approved
- [ ] Implementation (Step 1-11)
- [ ] v2 (out of scope): HUD 토글 UI 별도 plan
- [ ] Dashboard implementation 시작 (별도 plan)
