# SOON Board — Consensus Implementation Plan

> **Status:** `pending Architect/Critic review` (iteration 2 — REVISE amendments M1–M9 + extras applied)
> **Iteration:** 2
> **Source spec:** `.omc/specs/deep-interview-soon-board.md` (ambiguity 10.1%, PASSED)
> **Source research:** `.omc/state/research-openf1-svg.md`
> **Working dir:** `/Users/a453498/Downloads/project/soon_board` (greenfield)
> **Mode:** `/omc-plan --consensus --direct`, RALPLAN-DR short mode

---

## 1. Requirements Summary

Pulled verbatim/structurally from spec sections §Goal, §Constraints, §Non-Goals (`.omc/specs/deep-interview-soon-board.md:50-85`).

### Goal (spec §Goal, lines 50–52)
Client-side React SPA viewed on a sub-monitor (FHD) or iPad alongside live F1 broadcast. Core value: a **full-field bird's-eye view** of 20 drivers on a circuit SVG with smooth 60Hz markers. Live (`anchor=now, speed=1x`) and historical (`speed ∈ {1, 2, 5}`) modes share a **single global clock**. OpenF1 free plan only, 100% static GitHub Pages hosting.

### Constraints (spec §Constraints, lines 56–69)
1. **Hosting:** GitHub Pages, no backend.
2. **Stack:** React + Vite + Tailwind + **Zustand** + TypeScript.
3. **Data:** OpenF1 v1 free tier — historical polling only (no client-side OAuth2). Rate limit **3 req/s, 30 req/min** enforced via token bucket.
4. **CORS:** Assume `*`, but verify at build with `curl -I`; fallback = Cloudflare Worker proxy.
5. **Devices:** FHD 1920×1080 + iPad portrait/landscape, both first-class via responsive grid.
6. **SVG license:** `bacinger/f1-circuits` MIT only. `julesr0y` rejected (no license).
7. **Language:** Korean UI, English code identifiers.
8. **Branding:** "SO**ON** Board" wordmark, 'ON' in racing red (`#E10600`) or neon green (`#00FF94`).
9. **Theme:** Dark mode only.

### Non-Goals (spec §Non-Goals, lines 73–84)
No paid/sponsor plan, no OAuth2 real-time stream, no mobile <768px layout, no accounts, no native build, no audio/team-radio, no 3D track (z), no in-car video, no light mode, no engineering-grade telemetry analysis.

### Acceptance Criteria
All AC1.1–AC7.6 from spec §1–§7 (lines 90–132) are inherited as-is; see §5 of this plan for the testable mapping.

---

## 2. RALPLAN-DR (Short Mode)

### 2.0 Glossary (M7 / clarification of §1 vs §C.5)

- **wallClock** — `Date.now()` on the client device.
- **serverTime** — what OpenF1's `Date` HTTP response header reports; lags broadcast wall-clock by approximately 3 seconds because OpenF1's pipeline lags broadcast.
- **Live mode anchor** — the spec phrase "Live = anchor=now" and `mode === 'live'` both denote `anchor = serverTime ≈ wallClock - 3s`. The shorthand "now" in spec and plan means **this server-aligned anchor**, not raw `Date.now()`. The 3s offset is encoded once in `timelineStore.syncServerTime` (M7); render code never branches on `mode === 'live'` for time math.
- **Playback mode anchor** — `anchor = anchorSessionTime` (explicit session timestamp). `serverTimeOffsetMs` is ignored in playback.
- **Substrate (M6)** — the always-on telemetry-derived `<path>` that defines the SVG `viewBox` and serves as the coordinate ground truth for marker `transform` writes.
- **Decoration (M6)** — the optional bacinger SVG path overlaid behind the substrate when affine fit residual is within threshold. Cosmetic, never load-bearing for markers.
- **Locked cadence (M1)** — the §3 Phase 3 polling table sums to exactly 30.0 req/min; bursts are absorbed by the token-bucket 3 req/s ceiling, not by trimming steady-state.

### 2.1 Principles (5)

1. **Single global clock is the source of truth.** Live mode is a special case of playback (`anchor=now, rate=1x`). All time-dependent state derives from one `timelineStore.globalClockNow()`. (spec §Goal line 52, §A.3 lines 243–273)
2. **Rate-limit safety > feature velocity.** 30 req/min is a hard cap; every endpoint addition must justify its budget slice in `scheduler/poller.ts`. Steady-state target is exactly **30.0 req/min** (the locked cadence table in §3 Phase 3 sums to 30.0); retry/calibration bursts are absorbed by the token-bucket 3 req/s ceiling rather than steady-state headroom. P2 reconciles with the 30/min cap via bucket dynamics: short transient bursts ≤ 3 req/s are legal as long as the 60s rolling window stays ≤ 30.
3. **Imperative animation, declarative UI.** 20 cars × 60Hz is incompatible with React reconciliation. Marker `transform` updates use `ref.setAttribute` inside one master rAF loop; React renders only at 1Hz for leaderboard. (spec §C.3 lines 393–401, §B.5 lines 322–340)
4. **License safety is non-negotiable.** Only MIT-licensed SVG sources ship in the bundle. `bacinger/f1-circuits` confirmed MIT (research lines 109–116). Fallback to telemetry-derived outlines for any unlicensed/missing circuit (spec §B.3 lines 311–316).
5. **Responsive parity FHD ↔ iPad.** Two breakpoints, both first-class. Touch targets ≥ 44×44px (AC7.5 spec line 131). No fallback to mobile phone.

### 2.2 Decision Drivers (Top 3)

1. **30 req/min hard cap (OpenF1 free).** Forces tiered polling, shared queue, token bucket. Locked cadence table in §3 Phase 3 sums to exactly 30.0 req/min; bursts are absorbed by the 3 req/s bucket ceiling, not by steady-state headroom (M1). (research §1 Rate Limits, lines 26–34; spec §A.2 lines 212–241)
2. **20 cars × 60Hz render budget on iPad Safari.** Rules out per-marker React state; mandates imperative rAF. AC4.5 fallback is **bidirectional (M4)**: iPad Safari UA starts at 30Hz, but may upgrade to 60Hz if drops < 2%; Chrome desktop starts at 60Hz, downgrades to 30Hz on > 10% drops in a 60-frame window. `?fps=60`/`?fps=30` URL param overrides UA detection. (AC4.4, AC4.5, spec lines 111–112)
3. **GitHub Pages static-only hosting.** No backend, no secrets, no server-side rate-limit coordinator. All scheduling and caching must run in-browser. Server-time sync via OpenF1 `Date` HTTP header in `timelineStore.syncServerTime` (M7). (spec §Constraints 1, line 58)

### 2.3 Viable Options per Major Fork

Spec already resolved these in deep interview; this section **restates the rationale and bounded comparison** without re-opening the decision. Where only one option remains viable, the invalidation rationale for alternatives is documented explicitly.

#### Fork A — State Library (resolved: **Zustand**, spec §Round 3 line 553)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Zustand** (chosen) | Selector-level subscriptions avoid 60Hz re-renders; <2KB; supports `useRef` escape hatch for imperative updates; no provider boilerplate. | Less ecosystem than Redux; manual devtools wiring. | **Adopted** — perfect fit for selector-isolated 60Hz workload (spec §C.1 lines 348–364). |
| Jotai | Atom-level granularity; React-Suspense-friendly. | Atomic re-render model still triggers React reconciliation per atom write at 60Hz × 20 markers → cost similar to React state. Requires Provider tree. | **Rejected** — atom write fan-out fights rAF imperative model. |
| Redux Toolkit | Mature devtools; predictable. | Reducer dispatch + connect/subscribe overhead is ~3× Zustand for high-frequency writes; bundle ~12KB; ceremony for ephemeral telemetry buffers. | **Rejected (spec §R3 line 144)** — "60Hz workload엔 부적합." |

**Why Zustand wins:** The marker animation path bypasses Zustand entirely (ref + rAF). Zustand is used only for 1Hz leaderboard derived state and timeline anchor. This split exactly matches Zustand's strengths.

#### Fork B — Circuit SVG Strategy (resolved iteration 2: **telemetry-substrate ALWAYS + bacinger MIT as optional decoration**, spec §Round 5 line 561; refined by M6)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Telemetry substrate (always-on) + bacinger MIT decoration (optional)** (chosen, M6) | Markers position against telemetry coord space, so no affine fit on critical path; unknown / new circuits work out of the box; bacinger adds polished outline cosmetically when alignment is good. | One extra fetch per session (first clean lap, ~333 rows, ~1 req); substrate styling is slightly less polished than a hand-curated SVG. | **Adopted (iteration 2)** — eliminates calibration as a blocker class. Affine residual is informational only; decoration hides on misalignment without affecting markers. |
| bacinger as primary + telemetry fallback (iteration 1) | Polished SVGs from day one; MIT license. | Affine fit becomes load-bearing for 20 markers × 60Hz; partial / noisy laps degrade marker positions; schema variance (R3) and residual instability (R8) become blocking risks. | **Superseded by M6** — load-bearing affine fit was the root of two blocking risks. |
| julesr0y/f1-circuits-svg | 78 circuits ready-as-SVG; 2026 layouts; pre-optimized SVGO. | **No explicit license** — cannot ship in MIT/proprietary GH Pages bundle. SVG coord space is internal/arbitrary → still needs calibration anyway. | **Rejected (spec §Round 5)** — license risk, no calibration win. |
| f1laps/f1-track-vectors | Was free repo. | Archived; redirects to paid Gumroad; unmaintained. | **Rejected** — research §2 Option C, lines 129–132. |

#### Fork C — Polling Architecture (resolved: **per-endpoint tiered scheduler**, spec §A.2 lines 212–241)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Tiered scheduler** (chosen) | Each endpoint sized to its own freshness need; fits exactly 30.0 req/min steady-state (M1 locked table); easy to A/B re-tune; clear budget accounting. | More moving parts; risk of drift if tiers added without budget check. | **Adopted** — only way to honor AC2.1 (≤ 30 req/min steady) while keeping `location`/`intervals` at 6s (spec §A.2). |
| Monolithic single-rate poller | Simplest code; one `setInterval`. | Either over-polls slow endpoints (waste) or under-polls fast ones (stale markers); cannot satisfy AC1.4 P95 ≤ 4s freshness without busting rate limit. | **Rejected** — budget math fails: even at 5s interval × 8 endpoints = 96 req/min. |
| Adaptive/learned scheduler | Could optimize over time. | Complexity outsizes value for v1; debugging cost in browser. | **Rejected** — defer until measurement proves need. |

#### Fork D — Live vs Historical Data Path (resolved: **unified `anchor=now` model**, spec §Round 1 line 542)

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Unified `anchor=now, rate=1x`** (chosen) | One render path; one clock; scrubbing, speed-changes, and live mode all share the same `sample(t)` pipeline; less surface area; same code = same bugs found once. | Live mode inherits playback's buffer model (slight memory overhead); requires careful `anchor` re-sync on tab background restore. | **Adopted** — eliminates "two-paths bug class" entirely (spec §A.3 line 273, §C.5 lines 408–412). |
| Separate live module + separate playback module | Could optimize live for streaming-only (skip buffer fill). | Doubles UI integration cost; two scrubber implementations; mode-switch is now a remount instead of a parameter flip; OAuth2 path unavailable anyway, so "live" never differs from "polling historical at anchor=now" in practice. | **Rejected** — no real-time stream exists on free tier (research §1 Auth lines 17–22); separation is purely cosmetic. |

**Single-option-remaining invalidation:** None — all four forks retain ≥ 2 documented options with explicit pros/cons.

---

## 3. Implementation Steps (Phased)

Sequenced phases with concrete file paths. Complexity S(<2h) / M(2–6h) / L(6h+). Parallelizable phases can run in different worktrees once dependencies are met.

### Phase 0 — Repo Bootstrap (S, blocks all)

**Files:**
- `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- `tailwind.config.ts`, `postcss.config.js`, `src/styles/global.css`
- `.eslintrc.cjs`, `.prettierrc`, `vitest.config.ts`, `playwright.config.ts`
- `.github/workflows/deploy.yml` (build → `gh-pages` branch, base path `/soon_board/`)
  - **Top-level `permissions` block (M9, required for first deploy to succeed):**
    ```yaml
    permissions:
      contents: write
      pages: write
      id-token: write
    ```
- `src/main.tsx`, `src/App.tsx` (empty shell)
- `.gitignore`, `README.md`

**Dependencies installed:**
- runtime: `react`, `react-dom`, `zustand`, `ml-matrix` (for affine fit, spec §B.2 line 299), `lucide-react` (icons)
- dev: `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `postcss`, `autoprefixer`, `eslint`, `@typescript-eslint/*`, `prettier`, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`
- deferred: `recharts` ONLY if hand-rolled SVG sparkline (~30 LOC) proves insufficient (AC3.3, spec line 105). Default = no recharts.
- `d3-scale` deferred — only if axes need ticks. Default = no.

**Verify:** `npm install && npm run dev` opens blank app; `npm run typecheck && npm run lint && npm test` exit 0.

**Parallelizable:** No (blocks everything).

---

### Phase 1 — OpenF1 Client (M, blocks 2–10)

**Files:**
- `src/api/types.ts` — `Meeting`, `Session`, `Driver`, `Lap`, `Stint`, `PitStop`, `Interval`, `RacePosition`, `LocationRow`, `Weather`, `RaceControl` (mirror spec §Ontology lines 495–512 and research §1 Key Endpoints).
- `src/api/rateLimiter.ts` — token bucket: 3 tokens/s refill, 30 tokens/min ceiling. Public `acquire(): Promise<void>` blocks until token available. Exponential backoff helper: start 2s, max 30s, max 5 retries (AC1.3 spec line 93).
- `src/api/client.ts` — `fetchJson<T>(path, params)` with shared queue, 429 backoff hook, AbortController support.
- `src/api/endpoints.ts` — typed wrappers: `getMeetings({year})`, `getSessions({meeting_key})`, `getDrivers({session_key})`, `getLocation({session_key, date_gte, date_lte})`, etc.
- `scripts/verify-cors.ts` — `curl -I "https://api.openf1.org/v1/sessions?session_key=latest"`, asserts `access-control-allow-origin: *` (AC1.1 spec line 91). Hooked into `npm run verify:cors`.

**Tests:**
- `src/api/rateLimiter.test.ts` — queue 50 concurrent acquires, assert min wall time ≥ ceil(50/3) − 1 s; assert never bursts >3/s or >30/min.
- `src/api/client.test.ts` — mock 429 → assert exponential backoff sequence 2, 4, 8, 16, 30 (capped); max retries = 5 then throw.

**Verify:** `npm test src/api && npm run verify:cors` both pass.

**Parallelizable:** No (blocks 2+).

---

### Phase 2 — Zustand Stores + Global Clock (M, parallel with 3)

**Files:**
- `src/store/timelineStore.ts` — `mode`, `anchorWallTime` (= `performance.now()` snapshot), `anchorSessionTime` (ms), `playbackRate (1|2|5)`, `isPaused`, `scrubTo()`, `setRate()`, `setMode()`. Exposes `globalClockNow()` pure helper. (spec §C.1 lines 349–363)
  - **Server-time sync (M7):**
    - State: `serverTimeOffsetMs: number` (default `0`).
    - Method: `syncServerTime(serverDate: Date, clientPerfNowMs: number): void` — computes `serverTimeOffsetMs = serverDate.getTime() - (performance.timeOrigin + clientPerfNowMs) - 3000`. The `-3000` constant encodes that OpenF1's serving lags broadcast wall-clock by ~3s; the live anchor is `serverTime ≈ wallClock - 3s`.
    - Called exactly once from the `src/api/client.ts` response interceptor on the first successful response, reading the `Date` HTTP header and snapshotting `performance.now()` at that instant.
    - In live mode, `globalClockNow()` returns `performance.timeOrigin + performance.now() + serverTimeOffsetMs`. In playback mode it ignores the offset and uses the explicit `anchorSessionTime` arithmetic.
  - Vitest `timelineStore.serverSync.test.ts`: with a fake `Date` header response, `globalClockNow()` returns a value within ±50ms of the expected server-aligned timestamp.
- `src/store/sessionStore.ts` — `meeting`, `session`, `drivers[]`, `decorationAvailable: boolean` (true when bacinger circuit exists AND affine residual < threshold; cosmetic only), `affineForDecoration: Affine | null`. **No `calibrationMode: 'svg' \| 'fallback'` branching** — the substrate telemetry polyline is always the coordinate ground truth (see M6 + Phase 6).
- `src/store/telemetryStore.ts` — `byDriver: Map<number, DriverBuffer>` where `DriverBuffer = { samples: RingBuffer<{t,x,y}>, lastLap, sparklineLaps: number[], tireCompound, tireAgeLaps, pitStops }`. Ring buffer cap = 200 samples (~54s @ 3.7Hz, spec line 382). Methods: `appendLocationBatch`, `appendLap`, `appendStint`, `appendPit`, **`flush(): void`** (clears entire `byDriver` map).
  - **Memory cap (M8):** constant `MAX_BUFFERED_SESSIONS = 1`. `sessionStore.setSession(newKey)` calls `telemetryStore.flush()` whenever `newKey !== currentKey`. This caps in-flight telemetry RAM to a single session × 20 drivers × 200 samples ≈ 4000 sample rows. See §8 for the iPad Safari ~1GB single-tab RAM dependency rationale.
  - Vitest `telemetryStore.flush.test.ts`: after `sessionStore.setSession('newKey')`, assert `flush` was invoked and `byDriver.size === 0`; re-asserts no stale samples bleed across sessions.
- `src/store/leaderboardStore.ts` — derived 1Hz snapshot: `rows: LeaderboardRow[]` (position-sorted).
- `src/hooks/useGlobalClock.ts` — subscribe-to-rAF helper returning current `t` (only for components that legitimately re-render on it; markers do NOT use this).

**Tests:**
- `src/store/timelineStore.test.ts` — mode flip, rate change, scrubTo idempotent; `globalClockNow()` monotonic when paused=false; freeze when paused=true.
- `src/store/telemetryStore.test.ts` — ring buffer eviction at 201st insert; appendLocationBatch dedupes by `(driver, t)`.

**Verify:** `npm test src/store` green.

**Parallelizable:** Yes (with Phase 3 once Phase 1 types are landed).

---

### Phase 3 — Polling Scheduler (M, parallel with 2)

**Files:**
- `src/scheduler/poller.ts` — orchestrates tiered intervals. **LOCKED final cadence (sums to exactly 30.0 req/min steady-state):**

  | Endpoint | Interval | Calls/min |
  |---|---|---|
  | `location` | 6s | 10 |
  | `intervals` | 6s | 10 |
  | `race_control` | 10s | 6 |
  | `position` | 30s | 2 |
  | `laps` | 60s | 1 |
  | `pit` | 180s | 0.33 |
  | `stints` | 180s | 0.33 |
  | `weather` | 180s | 0.33 |
  | **Total** | | **30.0** |

  Burst headroom for retries / re-calibration / 429 backoff is absorbed by the token-bucket 3 req/s ceiling (transient capacity), NOT by trimming steady-state cadence. `race_control` returns to 10s (flags felt within 10s) and `position` is set to 30s (race-position changes felt within 30s). `pit`/`stints`/`weather` are event-driven (lap completion / weather drift) so 180s is acceptable.

  **Poller API (used by Phase 8 Scrubber):**
  - `poller.start(): void` — kicks off all tiered timers.
  - `poller.stop(): void` — tears down all timers and pending fetches.
  - `poller.pause(): void` — aborts in-flight fetches via `AbortController`, halts all interval timers but preserves session state.
  - `poller.resume(): void` — restarts every timer from `Date.now()` (re-anchored intervals, not resumed delta).
  - `poller.refetchWindow(sessionMsStart, sessionMsEnd): Promise<void>` — fetches the union of all endpoints across `[sessionMsStart, sessionMsEnd]` in a single ordered pass, returning ordered samples; used by scrub-backward to repopulate buffers.

- `src/scheduler/interpolator.ts` — `lerp` (v0) and Catmull-Rom (v1) per spec §C.2 lines 386–392. Both pure functions, fully unit-testable.

**Tests:**
- `src/scheduler/poller.test.ts` — run 5 simulated minutes under fake timers, assert total fetches ≤ 30 in every rolling 60s window; assert token bucket never bursts > 3 req/s; assert per-endpoint cadence matches the locked table within ±1 tick jitter.
- `src/scheduler/poller.pause-resume.test.ts` — assert (a) `pause()` aborts in-flight `fetch` promises (AbortError observed) and halts timers (no further calls in next 30 simulated seconds); (b) `resume()` schedules each endpoint's next call from `Date.now()` (not original anchor); (c) `refetchWindow(start, end)` returns samples in `(endpoint, t)` ascending order with no duplicates.
- `src/scheduler/interpolator.test.ts` — lerp endpoints, Catmull-Rom passes through control points, extrapolation freezes at +1s.

**Verify:** `npm test src/scheduler` green.

**Parallelizable:** Yes (with Phase 2).

---

### Phase 4 — Build-time Circuit SVG Pipeline (M, parallel with 5–7)

**Files:**
- `scripts/build-circuits.ts` (Node, runs in CI + locally):
  1. Read `bacinger/f1-circuits` via **git submodule** pinned at a known-MIT commit hash at `vendor/bacinger-circuits/` (LOCKED — no postinstall clone path, no CI rate-limit risk against github.com). License check: assert `vendor/bacinger-circuits/LICENSE` SPDX = MIT; abort build otherwise.
  2. For each GeoJSON `LineString`, project lon/lat → SVG path via per-circuit equirectangular: center at circuit centroid, scale by `cos(centroid_lat)` for lon, uniform scale to fit a normalized viewBox of `1000 × 1000` units, 5% padding, Y-flipped (research §3 lines 152–162).
  3. Emit `src/assets/circuits/{circuit_key}.svg` (track outline `<path>` only, minimal style) and a single `src/assets/circuits/circuits.json` map: `{ circuit_key: { viewBox, geojson_centroid, rotation_hint } }`.
- `package.json` script: `"prebuild": "tsx scripts/build-circuits.ts"`.

**Tests:**
- `scripts/build-circuits.test.ts` — given a fixture GeoJSON, assert deterministic SVG output (snapshot) and `circuits.json` shape.

**Verify:** `npm run prebuild` exits 0; `src/assets/circuits/` has ≥ 24 SVGs (2026 calendar); manual visual inspection of 3 canonical circuits (Monaco, Suzuka, Madrid) shows recognizable outline.

**Parallelizable:** Yes — independent of stores/components.

**Architect attention flag:** Confirm bacinger GeoJSON schema is `Feature.geometry.type === "LineString"` for all 43 circuits; spec §B.1 line 282 assumes uniform schema. If any circuit ships as `MultiLineString` or `Polygon`, script must handle. Falls into Phase 5 risk too.

---

### Phase 5 — Coordinate Utilities + Telemetry Fallback (S, blocks 6)

**Files:**
- `src/utils/coordinates.ts`:
  - `type Affine = { a, b, c, d, tx, ty }`.
  - `applyAffine([x, y], A): [sx, sy]`.
  - `fitAffine(tel: [number, number][], svg: [number, number][]): { affine: Affine, residual: number }` — 4-parameter similarity (scale + rotation + 2D translation), solved via `ml-matrix` SVD (spec §B.2 lines 295–301).
  - `flipY(viewBox)` helper for the Y-flip formula (research §3 lines 150–158).
- `src/utils/fitting.ts`:
  - `computeBbox(points)`, `paddedViewBox(bbox, padPct=0.05)`.
  - `smoothPolyline(points, window=6)` — 5–7 point moving average (spec §B.3 line 315).
  - `catmullRomToPath(points)` — for fallback outline rendering.
  - `pickCleanLap(locationRows, lapRows): LocationRow[]` — picks first clean lap (no pit_in / pit_out flag) and returns its samples.

**Tests:**
- `src/utils/coordinates.test.ts` — known synthetic affine (e.g., rotate 30°, scale 2, translate (10,5)) → fit recovers within 1e-6; residual = 0 on noise-free input; residual rises linearly with gaussian noise.
- `src/utils/fitting.test.ts` — bbox + viewBox math; smoothing reduces variance; clean-lap picker skips pit-in/pit-out laps.

**Verify:** `npm test src/utils` green.

**Parallelizable:** Yes (with Phase 4).

---

### Phase 6 — Circuit Map Component + rAF Imperative Markers (M, blocks 9 / 10)

**Strategy (M6 — substrate-first):** the circuit map is composed of two layers, with strict primacy:

1. **Layer 1 — substrate (always-on, load-bearing).** A telemetry-derived polyline built from one driver's first clean lap (`location` rows for the lead car), smoothed via 5-point moving average, rendered as `<path stroke-width="2" />`. The substrate's bounding box (plus 5% padding) defines the SVG `viewBox`. **All 20 marker `transform` writes position against this coordinate space**, so there is no affine fit on the critical render path and no failure mode for unknown circuits.
2. **Layer 2 — decoration (optional, cosmetic).** The bacinger build-time SVG path (Phase 4) is rendered behind the substrate when (a) the circuit exists in bacinger AND (b) affine fit residual < threshold. Misalignment is purely cosmetic; markers stay correct regardless. `sessionStore.decorationAvailable` controls visibility.

**Files:**
- `src/components/Map/CircuitMap.tsx` — fetches the first clean lap on session entry, builds the substrate `<path>`, computes `viewBox` from substrate bbox + 5% pad, then conditionally renders the decoration `<path>` (bacinger) behind it when `sessionStore.decorationAvailable === true`. Mounts 20 `<g>` driver groups, each `<g><circle/><text/></g>`. Uses `aria-label` for screen readers.
- `src/components/Map/Marker.tsx` — pure presentational; emits `ref` upward via `forwardRef`.
- `src/hooks/useDriverMarker.ts` — registers marker ref into a master-rAF coordinator keyed by `driver_number`.
- `src/hooks/useMasterRaf.ts` — singleton rAF loop (mounts on `<App/>`). Each frame: read `globalClockNow()`, iterate `drivers`, compute interpolated telemetry XY (linear v0, Catmull-Rom v1) **directly in substrate coordinates (no affine on hot path)** → set `transform="translate(sx,sy)"` via `ref.setAttribute` (spec §B.5 lines 322–340).
  - Exposes `isApplying: MutableRefObject<boolean>`. When `true`, the rAF tick skips marker writes (used by Phase 8 Scrubber to suppress writes during scrub-settle while `poller.refetchWindow` is in flight).
- `src/hooks/useFrameBudget.ts` — implements AC4.5 in both directions (M4):
  ```ts
  function detectInitialFps(): 30 | 60 {
    const params = new URLSearchParams(location.search);
    const override = params.get('fps');
    if (override === '60' || override === '30') return Number(override) as 30 | 60;
    const isIpadSafari =
      /iPad|Macintosh/.test(navigator.userAgent) &&
      'ontouchend' in document &&
      /Safari/.test(navigator.userAgent) &&
      !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
    return isIpadSafari ? 30 : 60;
  }
  ```
  - Initial Hz selected by `detectInitialFps()` (handles "Request Desktop Site" reporting `Macintosh` UA via the touch + Safari heuristic).
  - Runtime drop-detect: rolling 60-frame window. If drops > 10% at 60Hz → downgrade to 30Hz. If drops < 2% at 30Hz → upgrade to 60Hz (Safari may rescue itself).
  - `?fps=60` / `?fps=30` URL param overrides UA detection and starts at the chosen rate.
- `src/components/Map/DecorationLayer.tsx` — on session entry, computes affine fit of bacinger SVG → substrate polyline. If residual ≤ threshold, sets `decorationAvailable = true` and renders bacinger path; otherwise sets `false` and renders nothing in this layer. Emits an `aligned` / `unaligned` informational badge.

**Tests:**
- `src/components/Map/CircuitMap.test.tsx` (RTL + jsdom) — mounts, 20 `<g>` groups present, each has expected `aria-label`; substrate path is always rendered; decoration path rendered only when `decorationAvailable === true`.
- `src/hooks/useMasterRaf.test.ts` — fake rAF, assert exactly 1 master loop registered per `<App>` mount, exactly N `setAttribute` calls per tick, **zero `setAttribute` calls when `isApplying.current === true`**.
- `src/hooks/useFrameBudget.test.ts` (M4) — (a) iPad Safari UA → starts at 30Hz; (b) `?fps=60` overrides; (c) Chrome desktop UA → starts at 60Hz; (d) injected 12% drop at 60Hz → downgrade to 30Hz; (e) injected < 2% drop at 30Hz → upgrade to 60Hz; (f) iPadOS "Request Desktop Site" UA → still classified as iPad Safari.
- Playwright `e2e/map-smoke.spec.ts` — open dev server, navigate to known session, assert markers visible and `transform` changes within 2s, substrate `<path>` present regardless of circuit.

**Verify:** `npm test src/components/Map && npm run e2e -- map-smoke` green. **End-of-phase gate (R12 hardening):** `npm run lighthouse:ci -- --device=mobile` blocking Phase 7 start. If < 80, force-enable 30Hz everywhere before proceeding to Phase 7. Manual: open Chrome Performance tab, record 5s, assert ≤ 6 dropped frames (10%) during marker movement.

**Parallelizable:** No (depends on Phase 2, 3, 4, 5). Complexity downgraded **L → M** because affine fit moved off the critical path (M6).

---

### Phase 7 — Leaderboard + Sparkline (M, parallel with 6)

**Files:**
- `src/components/Leaderboard/Leaderboard.tsx` — virtualized 20-row table, columns per AC3.2 (spec lines 103–104): position, helmet color + abbrev, team, last lap, interval, gap, tire compound + age, pit count.
- `src/components/Leaderboard/Row.tsx` — memoized, subscribes to `leaderboardStore` via selector keyed by `driver_number`.
- `src/components/Leaderboard/Sparkline.tsx` — hand-rolled SVG `<polyline>` from `sparklineLaps: number[]` (10 most recent), normalized to 60×16 box. AC3.3 (spec line 105). If hand-rolled exceeds 60 LOC or fails a11y review, swap to `recharts.LineChart` (and add to deps in Phase 0).
- `src/components/Leaderboard/TireDot.tsx` — color swatch using `tire-*` tokens from spec §D.2 (lines 433–447).

**Tests:**
- `src/components/Leaderboard/Leaderboard.test.tsx` — given fixture `byDriver` map, asserts row order = ascending position, columns render expected text.
- React Profiler test (AC3.4 spec line 106): toggle sort, assert render budget < 16ms (60fps).

**Verify:** `npm test src/components/Leaderboard` green.

**Parallelizable:** Yes (with Phase 6 once Phase 2 stores landed).

---

### Phase 8 — Playback / Calendar / Speed Toggle (M, parallel with 6/7)

**Files:**
- `src/components/Playback/PlaybackBar.tsx` — scrubber + speed-toggle + live-dot per spec §D.1 line 430 (`<LiveDot/>`).
- `src/components/Playback/Calendar.tsx` — three tabs (2024/2025/2026), grand prix card grid (AC6.1 spec line 120).
- `src/components/Playback/SessionPicker.tsx` — modal showing P1/P2/P3/Sprint/Q/R for the selected meeting (AC6.2 spec line 121).
- `src/components/Playback/Scrubber.tsx` — drag-to-jump; must settle UI within 500ms (AC6.4 spec line 123).
  - **Scrub-backward sequence (M2 explicit dependency):**
    1. `Scrubber.onCommit(sessionMs)` is called on drag release.
    2. Sets `useMasterRaf.isApplying.current = true` (suppresses marker writes mid-scrub).
    3. `poller.pause()` aborts in-flight fetches.
    4. Awaits `poller.refetchWindow(sessionMs - 30_000, sessionMs)` to repopulate `telemetryStore` ring buffers for the new anchor neighborhood.
    5. `timelineStore.scrubTo(sessionMs)` re-anchors the global clock.
    6. `poller.resume()` restarts tiered timers from `Date.now()`.
    7. Sets `useMasterRaf.isApplying.current = false`.
  - Total wall-clock budget for steps 2–7 must remain ≤ 500ms (AC6.4); test asserts this.
- `src/components/Playback/SpeedToggle.tsx` — 1× / 2× / 5× pill buttons; calls `timelineStore.setRate`.

**Tests:**
- `src/components/Playback/PlaybackBar.test.tsx` — speed change updates `timelineStore.playbackRate`; scrub jumps `anchorSessionTime` exactly once.
- Playwright `e2e/playback-smoke.spec.ts` — select 2024 Monaco → Race → toggle 2× → assert global clock advances at 2× wall-time.

**Verify:** `npm test src/components/Playback && npm run e2e -- playback-smoke` green.

**Parallelizable:** Yes.

---

### Phase 9 — App Shell + Branding + Responsive Grid (S, depends on 6/7/8)

**Files:**
- `src/components/Shell/AppShell.tsx` — grid container, CSS-grid responsive per spec §D.3 lines 449–473:
  - `≥1440px`: 2-col, Map 60% / right panel 40%.
  - `1024×768 landscape`: 2-row, Map 50% top / Leaderboard 50% bottom.
  - `768×1024 portrait`: 2-row stacked.
- `src/components/Shell/Header.tsx` — contains `<Wordmark/>`, session label, live dot, clock.
- `src/components/Shell/Wordmark.tsx` — exactly per spec §D.1 lines 419–426: `<span>S<span class="text-soon-accent">ON</span> <span class="text-soon-muted">Board</span></span>`. `text-soon-accent` = `#E10600` default, neon toggle deferred per Open Question 1 (spec line 573).
- `tailwind.config.ts` extension: `colors: { 'soon-accent': '#E10600', 'soon-neon': '#00FF94', 'soon-muted': '#9CA3AF', 'bg-base': '#0A0A0B', 'bg-elev1': '#14141A', 'bg-elev2': '#1F1F28', 'tire-soft': '#FF3333', 'tire-medium': '#FFD600', 'tire-hard': '#FFFFFF', 'tire-inter': '#43B02A', 'tire-wet': '#0067AD' }` per spec §D.2 (lines 433–447).
- `src/styles/global.css` — dark background, font stack (display font for wordmark — system stack first, no web font v1).

**Tests:**
- `src/components/Shell/AppShell.test.tsx` — RTL with `matchMedia` mock for each breakpoint, asserts grid template areas.
- Playwright visual snapshot at 1920×1080, 1024×768, 768×1024 (AC7.2–7.4 spec lines 128–130).

**Verify:** `npm test src/components/Shell && npm run e2e -- visual-shell` green.

**Parallelizable:** No (composition phase).

---

### Phase 10 — QA + Lighthouse + e2e + Deploy (M)

**Files:**
- `.github/workflows/deploy.yml` — build → `npm run verify:cors` → `npm test` → `npm run lint` → `npm run typecheck` → `npm run e2e` → `npm run lighthouse:ci` (AC7.6a) → `scripts/architecture-check.ts` (AC6.5) → deploy `dist/` to `gh-pages`.
- `scripts/lighthouse-ci.ts` — runs `lighthouse` against built `dist/index.html` via local static server; asserts Performance ≥ 80, Accessibility ≥ 90 (AC7.6a, headless Chrome desktop preset).
- `scripts/architecture-check.ts` — greps for `mode === 'live'` outside `src/store/timelineStore.ts`; CI fails if matches found in component code (AC6.5).
- `e2e/smoke.spec.ts` — full happy path: load app → see header → pick 2024 Monaco Race → markers move → speed 2× → scrub → leaderboard reflows.

**M9 first-deploy verification:** the first push that lands `.github/workflows/deploy.yml` (Phase 0 artifact) must trigger a successful run. Checklist: `gh run list --workflow=deploy.yml --limit 1` shows `success`. If it fails on missing `pages: write` / `id-token: write`, fail fast and re-check the top-level `permissions` block.

**M3 manual gate before `v1` tag (AC7.6b, blocking release):**
- [ ] Open `https://<gh-pages-domain>/` on iPad Safari (physical device, latest iPadOS).
- [ ] Record 30s Performance trace during Live mode via Safari Web Inspector.
- [ ] Confirm FPS ≥ 30 sustained, JS time ≤ 100ms / frame P95.
- [ ] Confirm Accessibility ≥ 90 (Web Inspector audit).
- [ ] Archive timestamped screenshot to `.omc/release-evidence/v1/`.

**Verify:** Full CI green; `https://<user>.github.io/soon_board/` loads; manual: stopwatch confirms P95 freshness ≤ 4s end-to-end (AC1.4 spec line 94); AC7.6b manual gate passed and evidence archived.

**Parallelizable:** No (final integration).

---

## 4. Phase Dependency Graph

```
Phase 0 ──┬─▶ Phase 1 ──┬─▶ Phase 2 ──┐
          │             └─▶ Phase 3 ──┤
          └─▶ Phase 4 ──▶ Phase 5 ────┤
                                      ├─▶ Phase 6 ┐
                                      └─▶ Phase 7 ┤
                                          Phase 8 ┤
                                                  └─▶ Phase 9 ──▶ Phase 10
```

Parallel windows: {2, 3, 4, 5}, then {6, 7, 8}.

---

## 5. Acceptance Criteria (testable mapping)

All AC inherited from spec §1–§7 (lines 90–132). For each, the verification command/artifact:

| AC | Spec line | Verification |
|---|---|---|
| AC1.1 CORS works on GH Pages | 91 | `npm run verify:cors` exits 0; Playwright `e2e/cors.spec.ts` fetches from preview deploy. |
| AC1.2 Rate limit never exceeded | 92 | `vitest src/api/rateLimiter.test.ts` — 50 concurrent acquires, 0 × 429. |
| AC1.3 429 backoff: 2s start, 30s max, 5 retries | 93 | `vitest src/api/client.test.ts` mocked 429 sequence. |
| AC1.4 P95 freshness ≤ 4s | 94 | Playwright `e2e/freshness.spec.ts` — measures server `Date` → DOM mutation interval over 5min, asserts P95 ≤ 4000ms. |
| AC2.1 ≤ 30 req/min steady; token bucket 3 req/s ceiling absorbs bursts | 92 | `vitest src/scheduler/poller.test.ts` 5min simulated race window — rolling 60s window ≤ 30; rolling 1s window ≤ 3. |
| AC2.2 Per-endpoint cadence (LOCKED final table) | 98 | `vitest src/scheduler/poller.test.ts` per-endpoint timer assertions matching the §3 Phase 3 locked table: `location` 6s, `intervals` 6s, `race_control` 10s, `position` 30s, `laps` 60s, `pit` 180s, `stints` 180s, `weather` 180s. Total = 30.0 req/min. |
| AC2.3 `location` single batched call | 99 | `client.ts` integration test — no `driver_number` filter present. |
| AC3.1 20 rows sorted asc | 102 | `Leaderboard.test.tsx`. |
| AC3.2 columns present | 103 | RTL assertions. |
| AC3.3 sparkline 10 laps | 105 | `Sparkline.test.tsx` snapshot. |
| AC3.4 60fps sort | 106 | React Profiler test budget < 16ms. |
| AC4.1 Build-time bacinger GeoJSON → SVG path, used as **optional decoration layer** (not load-bearing for marker placement) | 108 | `scripts/build-circuits.test.ts` snapshot + file existence; decoration layer renders only when `decorationAvailable === true`. |
| AC4.2 Substrate telemetry polyline fetched on session entry (1 driver, first clean lap ~333 rows); markers position against this substrate layer | 109 | `e2e/calibration.spec.ts` — first session load triggers exactly 1 telemetry-substrate fetch within 2s; marker viewBox derived from substrate bbox + 5% pad. |
| AC4.3 20 markers, helmet color + number | 110 | RTL DOM assertions. |
| AC4.4 60Hz rAF imperative | 111 | `useMasterRaf.test.ts` — exactly N `setAttribute` per tick, zero React renders per tick. |
| AC4.5 30Hz fallback at >10% drops OR UA-detected iPad Safari at start (overrideable via `?fps=60`); Safari may upgrade to 60Hz if drops < 2% | 112 | `useFrameBudget.test.ts` — (a) synthetic 12% drop → mode flips to 30Hz; (b) iPad Safari UA → starts at 30Hz; (c) `?fps=60` URL param overrides UA detection; (d) Safari with sustained drops < 2% upgrades to 60Hz. |
| AC4.6 Y-flip + 5% pad + uniform AR | 113 | `coordinates.test.ts`. |
| AC5.1 Substrate polyline is coordinate ground truth (no IoU required against external SVG); bacinger overlay alignment reported as `aligned` / `unaligned` UI badge (informational only) | 116 | `e2e/calibration-accuracy.spec.ts` — substrate polyline rendered, decoration badge state asserted; no IoU gate required. |
| AC5.2 Substrate is always on (subsumed by M6); decoration layer hides on affine residual > threshold | 117 | Inject high-residual fixture, assert `decorationAvailable === false` and badge shows `unaligned`; substrate continues to render markers correctly. |
| AC6.1 2024/25/26 calendar | 120 | `Calendar.test.tsx`. |
| AC6.2 session picker | 121 | `SessionPicker.test.tsx`. |
| AC6.3 speed toggle synced | 122 | `e2e/playback-smoke.spec.ts`. |
| AC6.4 scrub settles ≤ 500ms | 123 | Playwright timed assertion. |
| AC6.5 Live = special case (architectural invariant) | 124 | `scripts/architecture-check.ts` greps for `mode === 'live'` (or equivalent) outside `src/store/timelineStore.ts`; **fails CI if any matches found in component code**. Wired into `npm run lint` step. |
| AC7.1 SO**ON** Board wordmark | 127 | `Wordmark.test.tsx`. |
| AC7.2 FHD 60/40 split | 128 | Playwright visual at 1920×1080. |
| AC7.3 iPad landscape 50/50 | 129 | Playwright visual at 1024×768. |
| AC7.4 iPad portrait stacked | 130 | Playwright visual at 768×1024. |
| AC7.5 touch targets ≥ 44px | 131 | Lighthouse-CI tap target audit + `axe` automated check. |
| AC7.6a Lighthouse-CI headless Chrome desktop preset: Performance ≥ 80, Accessibility ≥ 90 | 132 | `npm run lighthouse:ci` (blocking in CI). |
| AC7.6b iPad Safari (physical device, latest iPadOS): Performance ≥ 80, Accessibility ≥ 90 | 132 | Manual gate before `v1` tag. Evidence = timestamped screenshot from Safari Web Inspector Performance tab archived in `.omc/release-evidence/v1/`. Blocking before release. |

---

## 6. Risks and Mitigations

Extends spec §E risk table (lines 482–492) with sequencing/integration risks specific to this phased plan.

| # | Risk | Phase | Impact | Mitigation |
|---|---|---|---|---|
| R1 | OpenF1 removes `Access-Control-Allow-Origin: *` | 1 | All fetches blocked | Cloudflare Worker proxy (spec §E row 1); `verify:cors` script is CI gate so regression is caught at build. |
| R2 | Rate limit overrun under burst (re-calibration + retry collisions) | 3 | 429 cascade | Token bucket has hard 3 req/s ceiling; backoff exponential 2→30s; the locked 30.0 req/min steady-state plus bucket transient capacity absorbs retries; `poller.test.ts` 5min simulation asserts rolling 60s ≤ 30 and rolling 1s ≤ 3. |
| R3 | bacinger GeoJSON schema variance (e.g., MultiLineString) | 4 | **Cosmetic only — decoration layer hides for affected circuits; substrate keeps markers correct (M6)** | Pre-flight `scripts/build-circuits.ts --audit`: log any non-`LineString`. No longer blocking Phase 5/6 because affine fit is off the critical path. |
| R4 | 2026 new circuit missing from bacinger at session time | 4 | Decoration absent for that circuit; markers unaffected | Substrate polyline (M6) always renders from telemetry; UI badge `unaligned` informs user that the underlying outline is telemetry-derived. |
| R5 | iPad Safari rAF throttle on background tab | 6 | Markers freeze on return | `visibilitychange` handler in `useMasterRaf.ts`; on resume, re-anchor `anchorWallTime = performance.now()` and offset `anchorSessionTime` by elapsed delta (spec §C.5 line 410). |
| R6 | `location` lateral noise → markers wobble across track | 5, 6 | Visual inaccuracy | Centerline-only policy (spec §E row 5); 5–7 point moving average in interpolator. |
| R7 | OpenF1 outage during demo | All | Total app blank | **Cache last successful response for `location`, `intervals`, and `position` in `sessionStorage`, keyed `(session_key, endpoint)`, TTL 10min, total size budget 2MB with LRU eviction. Banner triggers when any of these three endpoints is > 60s stale**: "데이터 끊김 — 마지막 갱신 N초 전" (spec §E row 6). |
| R8 | Affine fit residual unstable across sessions (e.g., partial lap) | 5 | **Cosmetic only — decoration layer hides; markers position against substrate regardless (M6)** | `pickCleanLap` filters out pit in/out laps; decoration retries on next clean lap; UI badge flips to `unaligned` if residual stays > threshold. |
| R9 | ~~AC2.2 cadence deviation~~ | — | **Resolved — locked cadence table in §3 Phase 3 sums to exactly 30.0 req/min (M1 + M5).** | — |
| R10 | Hand-rolled SVG sparkline exceeds 60 LOC or fails a11y | 7 | Bundle bloat / a11y regression | Predefined swap-in path: add `recharts`, replace `Sparkline.tsx` body, keep API. Re-verify Lighthouse bundle size. |
| R11 | GitHub Actions cache miss → cold build > 10min | 0, 10 | Slow CI feedback | Cache `node_modules` keyed on `package-lock.json` hash. Bacinger is a git submodule so it ships in the checkout (M9 / submodule lock); no separate cache needed. |
| R12 | Lighthouse Performance < 80 due to 20 SVG markers + rAF main-thread cost | 6, 10 | AC7.6a fails | **Phase 6 end-of-phase gate: `npm run lighthouse:ci -- --device=mobile` blocks Phase 7 start. If < 80, escalate to M4 30Hz pre-emption everywhere (force `useFrameBudget` initial = 30 regardless of UA) before Phase 7 begins.** Secondary mitigations: defer `Leaderboard` mount until after first paint; lazy-load `CircuitMap` only on session selection. |

---

## 7. Verification Steps

Every PR / phase exit must pass:

1. `npm run typecheck` — `tsc --noEmit`, zero errors.
2. `npm run lint` — ESLint + Prettier, zero errors/warnings.
3. `npm test` — Vitest unit + integration, all green, coverage ≥ 80% on `src/api`, `src/store`, `src/scheduler`, `src/utils`.
4. `npm run verify:cors` — OpenF1 CORS smoke (skipped in offline CI; required in deploy job).
5. `npm run e2e` — Playwright suite: `map-smoke`, `playback-smoke`, `freshness`, `calibration`, `calibration-accuracy`, `cors`, `visual-shell`.
6. `npm run lighthouse:ci` — Performance ≥ 80, Accessibility ≥ 90 (AC7.6a, headless Chrome desktop).
7. `scripts/architecture-check.ts` — fails CI if `mode === 'live'` appears outside `src/store/timelineStore.ts` (AC6.5).
8. **Manual gate before `v1` release (AC7.6b — iPad Safari physical-device perf, blocking):**
   - [ ] Open `https://<gh-pages-domain>/` on iPad Safari.
   - [ ] Record 30s Performance trace during Live mode (Safari Web Inspector).
   - [ ] Confirm FPS ≥ 30 sustained, JS time ≤ 100ms / frame P95.
   - [ ] Confirm Accessibility ≥ 90.
   - [ ] Archive timestamped screenshot to `.omc/release-evidence/v1/`.
9. Manual gate at Phase 10: stopwatch P95 freshness ≤ 4s on a live OpenF1 session.

---

## 8. Dependencies / Open Items

### 8.1 NPM dependencies to install (Phase 0)

**Runtime:**
- `react`, `react-dom` (^18)
- `zustand` (^4) — state, spec §C.1 decision
- `ml-matrix` (^6) — SVD for affine fit, spec §B.2 line 299
- `lucide-react` — iconography (play, pause, calendar)

**Dev:**
- `vite`, `@vitejs/plugin-react`, `typescript`
- `tailwindcss`, `postcss`, `autoprefixer`
- `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-react-hooks`, `prettier`
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- `@playwright/test`
- `lighthouse`, `@lhci/cli`
- `tsx` — for running build scripts
- `gh-pages` — deploy helper (or pure Actions)

**Deferred (only if needed):**
- `recharts` — only if hand-rolled SVG sparkline fails AC3.3 or a11y. Default = excluded to keep bundle lean.
- `d3-scale` — only if leaderboard axes need tick formatting. Default = excluded.

### 8.2 External resource licensing confirmation

- ✅ `bacinger/f1-circuits` confirmed **MIT** in research line 110.
- Phase 4 build script asserts SPDX = MIT at clone time as a defense-in-depth check.
- ❌ `julesr0y/f1-circuits-svg` — license unverified; **not included** in bundle.
- ❌ `f1laps/f1-track-vectors` — archived; **not included**.

### 8.3 Spec Open Questions (deferred to Phase 2 of project)

From spec §Open Questions (lines 571–579), copied into `.omc/plans/open-questions.md`:

1. **Accent color toggle:** racing red default per Phase 9; expose neon toggle? — defer; spec line 573.
2. **Calendar layout:** card grid (chosen v1) vs month view — defer; spec line 574.
3. **Driver helmet visuals:** `headshot_url` only vs custom SVG collection — defer; spec line 575.
4. **Pause/Step UI:** is per-frame stepping needed? — defer; spec line 576.
5. **IndexedDB session cache:** save network, cost first-load — defer; spec line 577.
6. **Multi-tab coordinator:** share rate-limit budget via localStorage — defer; spec line 578.

### 8.4 Items flagged for Architect / Critic attention

1. **`location` lateral inaccuracy** (R6): centerline-only — acceptable per spec §E row 5. Architect should confirm UX team accepts that two cars on the same `t` may overlap visually even when on different sides of the track.
2. **Hand-rolled sparkline** (Phase 7, R10): chosen to avoid recharts bundle cost; if a11y/visual regression appears, swap is planned but adds ~80KB.

### 8.5 iPad Safari RAM dependency (M8)

iPad Safari enforces a soft ~1GB per-tab RAM cap; OOM kills the page silently. Mitigations baked into this plan:
- `telemetryStore.flush()` on every session switch (`MAX_BUFFERED_SESSIONS = 1`).
- Per-driver ring buffer capped at 200 samples (~54s @ 3.7Hz).
- Bacinger circuits ship as static `<path>` files (no runtime GeoJSON parse).
- Decoration layer disabled when `decorationAvailable === false` (no orphan path data retained).

### 8.6 Resolved in iteration 2

- ✅ AC2.2 cadence deviation — locked to exactly 30.0 req/min table (M1 + M5).
- ✅ bacinger GeoJSON schema audit blocker — downgraded to cosmetic risk because affine fit is off the critical path (M6).
- ✅ Affine residual instability blocker — downgraded for same reason (M6).
- ✅ Lighthouse Performance escape hatch — formalized as Phase 6 end-of-phase blocking gate with M4 30Hz pre-emption fallback (R12).
- ✅ Server-time alignment ambiguity — `syncServerTime` codified in `timelineStore` (M7) with glossary in §2.0.
- ✅ GitHub Pages first-deploy permissions — top-level `permissions:` block declared in Phase 0 deploy.yml (M9).

---

## 9. Estimation Summary

| Phase | Complexity | Parallel? | Blocked by |
|---|---|---|---|
| 0 Bootstrap | S | — | — |
| 1 API client | M | — | 0 |
| 2 Stores | M | with 3 | 1 |
| 3 Scheduler | M | with 2 | 1 |
| 4 Build SVGs | M | with 2,3 | 0 |
| 5 Coord utils | S | with 4 | 1 |
| 6 Map + rAF | M | — | 2,3,4,5 |
| 7 Leaderboard | M | with 6,8 | 2 |
| 8 Playback | M | with 6,7 | 2 |
| 9 Shell | S | — | 6,7,8 |
| 10 QA + deploy | M | — | 9 |

Total complexity: 7×M + 4×S ≈ ~4–6 working days for one experienced engineer, ~2.5–3.5 days with parallel worktrees on phases {2,3,4,5} and {6,7,8}. (Iteration 2: Phase 6 downgraded L → M after M6 moved affine fit off the critical path.)

---

## 10. Hand-off Note

Plan is `pending Architect/Critic review`. No executor invocation. After Architect/Critic pass, this plan can transition to `pending approval` → `approved` and become input to `/oh-my-claudecode:start-work soon-board-consensus-plan` or `/autopilot` (per spec line 4 execution-bridge guidance).
