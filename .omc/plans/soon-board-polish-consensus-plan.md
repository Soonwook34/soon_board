# Consensus Plan: soon_board Polish Pass (FINAL — consensus reached)

**Source spec:** [.omc/specs/deep-interview-soon-board-polish.md](.omc/specs/deep-interview-soon-board-polish.md) (deep-interview, 15.4% ambiguity, PASSED)
**Mode:** consensus + direct (non-interactive)
**Status:** **pending approval** — Planner → Architect → Critic → Architect re-review → Critic re-review (iteration 3 APPROVED). No auto-execution; user must explicitly select an execution path before any code change lands.
**Generated:** 2026-05-20
**Consensus iterations:** 3 (v1 draft → v2 post-Architect → v3 post-Critic → v3.1 post-Architect re-review → APPROVED by Critic)

---

## RALPLAN-DR Summary

### Principles
- **P1 — Surgical changes only.** Touch only what's required by the 14 ACs.
- **P2 — Preserve locked constraints.** 30 req/min OpenF1 budget; current color palette (except glow/shadow removal); AppShell layout untouched.
- **P3 — Port shapes literally.** Where `old_project/` has reference impls with explicit lessons-learned comments (snap divisor, lerp choice, buffer cap), **copy the constants verbatim** — don't invent improvements. (Strengthened post-Critic — v2's snap-divisor and Catmull-Rom invention violated this principle.)
- **P4 — Every AC has a rigorous, automatable verification step or an explicit checklist.** Manual ACs (AC2, AC5, AC14) must have a checklist with concrete pass/fail criteria.
- **P5 — Parallelism-safe phases, with motion landing first.** Phase ordering must support per-commit bisect on the highest-risk ACs (AC4, AC5).

### Decision Drivers
- **DD1 — Match old_project visual quality exactly.** The user's "툭툭 끊김" complaint is solved by old_project's documented constants. Copy them.
- **DD2 — Test coverage continuity + new automated gates for non-trivial behavior.**
- **DD3 — Brownfield safety:** no breaking changes to store APIs; sibling-store convention preserved (poller comment already names `appendBatch` for all stores).
- **DD4 — Production-build correctness.** Vite asset pipeline.

### Viable Options (overall delivery)
| # | Option | Pros | Cons |
|---|--------|------|------|
| A | **Single bundled PR with motion-first commit ordering** ★ recommended | Atomic visual ship; motion commit lands first so AC5 manual gate runs against minimal diff before visual churn | Larger total diff to review |
| B | Two-phase (motion PR, theme PR) | Cleanest bisect for AC4/AC5 | 2x review cycle |
| C | Per-component (5 PRs) | Tight rollback | 5x review burden |

**Recommendation:** **Option A with motion-first commit ordering** — addresses Critic's bisect concern by sequencing motion (Phase 2.1) as the **first non-audit commit** so AC5 manual sign-off happens against the smallest diff. Subsequent phases land on a known-motion-good base. The Critic-flagged "user mental verification coupling" rationalization is replaced by a structural answer: motion's manual gate runs first, then everything else.

**Invalidation rationale for B/C:** Option B's 2x review cycle exceeds the work-style preference for atomic ships; Option C is too granular for 14 ACs across ~25 files.

---

## Architecture Decision Records

### ADR-1 — Interpolation port (REVISED — post-Critic; constants now match old_project literally)
- **Decision:** Extend [src/scheduler/interpolator.ts](src/scheduler/interpolator.ts) `sampleAt()` with **snap-on-teleport** and **extrapolation-cap**. **Use linear (`lerp`) interpolation in the active render path** — NOT Catmull-Rom. **Snap divisor is `30`** (not `200`); see `old_project/src/components/TrackMap/MarkerLayer.tsx:28-33` for the original rationale (1/200 caused per-poll flicker on Monaco). **Extrap cap is `2000ms`.** [src/hooks/useMasterRaf.ts:50](src/hooks/useMasterRaf.ts#L50) changes its third argument to the new options object.
- **Drivers:** P3 (port literally), DD1 (match old_project), DD3 (brownfield).
- **Alternatives considered:**
  - **A1 (v1):** Reimplement in `useMasterRaf` — rejected (Architect): leaks animation semantics into rAF hook.
  - **A2 (v2):** Catmull-Rom + snap + extrap — **rejected (Critic):** old_project uses `lerp` in MarkerLayer.tsx:25, 66 ("as continuous (linear interpolation)" and "linearly interpolate position"); Catmull-Rom over noisy GPS can introduce overshoot at corners.
  - **A3:** lerp-only without snap — rejected: doesn't fix teleport / lap-wrap artifacts.
  - **A4 (chosen):** lerp + snap divisor `30` + extrap cap `2000ms`, matching old_project verbatim.
- **Why chosen:** old_project documents specific bug discoveries (per-poll flicker at 1/200; Catmull-Rom overshoot rejected by simpler lerp). Porting verbatim avoids re-discovering those bugs.
- **Consequences:**
  - `sampleAt` signature gains options: `sampleAt(samples, t, { mode: 'lerp', snapDivisor: 30, trackLength, extrapCapMs: 2000 })`. Existing callers (just `useMasterRaf:50`) updated.
  - **`trackLength` source:** computed in [src/components/Map/CircuitMap.tsx](src/components/Map/CircuitMap.tsx) when `substrateSamples` is built (sum of `euclidean(s[i], s[i+1])`). Published to `MasterRafApi` via new method `setTrackLength(meters: number)`. The rAF tick reads the cached value. Default `0` means "no snap" (no-op behavior preserved during initial mount).
  - **`useDriverMarker` registration shape unchanged** — verified by reading [src/hooks/useDriverMarker.ts](src/hooks/useDriverMarker.ts): `register({ driverNumber, ref, getSamples })` is sufficient.
- **Follow-ups:** If lerp-only proves too jagged at corners after AC5 manual sign-off, revisit Catmull-Rom in a follow-up PR with the regression-test fixture from this PR as the baseline.

### ADR-2 — Font loading strategy (v2 retained — ESM `?url` imports + `FontFace.load()`)
- **Decision:** unchanged from v2. ESM `?url` imports for Formula1 TTFs, programmatic `FontFace.load()` registration, Google Fonts `@import` for Orbit, `font-display: swap` everywhere, Formula1-Bold_web chosen as canonical bold.
- **Drivers:** P2, DD3, DD4.
- **Alternatives considered:** (same as v2 — `/src/...` URLs rejected for prod, `public/fonts/` duplicates convention, Orbit-via-CDN rejected (not published).)
- **Why chosen:** survives Vite production build; minimal infra change.
- **Consequences:** new file [src/styles/fonts.ts](src/styles/fonts.ts); `registerAppFonts()` called from [src/main.tsx](src/main.tsx).
- **Follow-ups:** preload Formula1-Regular if FOUT visible.

### ADR-3 — Map resize fix (v2 retained — ResizeObserver + viewBox aspect padding)
- **Decision:** unchanged from v2. ResizeObserver inside [src/components/Map/CircuitMap.tsx](src/components/Map/CircuitMap.tsx); extend `paddedViewBox` → new fn `paddedViewBoxForAspect(bbox, containerAspect, padPct)`; **keep `paddedViewBox` as a compatibility shim** that calls `paddedViewBoxForAspect(bbox, null, padPct)` (no aspect padding when `containerAspect === null`). This means existing callers and tests stay green without migration (per Critic feedback #5).
- **Drivers:** P1, AC2 root-cause fidelity.
- **Alternatives considered:** see v2 — pure-CSS, slice, none rejected with reasons.
- **Why chosen:** only no-crop, no-distort fix for the letterbox symptom.
- **Consequences:** ~20 lines in CircuitMap; `paddedViewBox` compat shim in [src/utils/fitting.ts](src/utils/fitting.ts) (or wherever the function lives — check S0.5).
- **Follow-ups:** none.

### ADR-4 — Tire display: TireChip replaces TireDot (unchanged from v2)
- **Decision / Drivers / Alts / Why chosen / Consequences / Follow-ups:** see v2 — unchanged.

### ADR-5 (NEW — post-Critic) — RaceControl store contract
- **Decision:** Reuse the existing `RaceControl` type from [src/api/types.ts:125](src/api/types.ts#L125) — do NOT invent a new `RaceControlMessage` interface. Method name: `appendBatch(rows: RaceControl[])` matching the new project's **existing sibling-store convention** (see [src/scheduler/poller.ts:7-13](src/scheduler/poller.ts#L7-L13) which already enumerates `appendBatch` for intervals, race_control, position, laps, pit, stints, weather — the comment block is the spec). Buffer cap `RACE_CONTROL_BUFFER = 50` ported from [old_project/src/state/raceControlStore.ts:4](old_project/src/state/raceControlStore.ts#L4) to prevent unbounded growth.
- **Drivers:** P3 (port literally including the buffer-cap constant), DD3 (sibling-store API parity), Critic feedback #3.
- **Alternatives considered:**
  - **E1:** Use old_project's `apply()` method name — rejected: breaks sibling-store convention in new project. The new project's poller comment already specifies `appendBatch` for all 7 stores.
  - **E2:** Use `append()` (v1/v2 plan default) — rejected: doesn't match poller convention.
  - **E3 (chosen):** `appendBatch()` + buffer cap from old_project.
- **Why chosen:** preserves both new-project naming convention AND old_project lessons-learned (the buffer cap).
- **Consequences:** [src/store/raceControlStore.ts](src/store/raceControlStore.ts) (NEW) exports `appendBatch(rows: RaceControl[])`. Derived selectors (`activeFlag`, `safetyCarActive`, `vscActive`) computed within the action or as selectors against `messages`.
- **Follow-ups:** if `RaceControl` type lacks `flag`/`category` fields that old_project relies on, extend the type alongside this work (verify in S0.6).

---

## Implementation Steps

### Phase 0 — Audit (commit: `chore(phase0): audit`)
- **S0.1** Grep `textShadow|box-shadow|drop-shadow|filter:.*shadow` over `src/**/*.{ts,tsx,css}` (Critic feedback #8 — include CSS). Whitelist: `ring-*`, `outline-*`. Record matches.
- **S0.2** Grep `toLocaleTimeString|format(date|HH:mm|AM|PM|hour12` over `src/`. Record.
- **S0.3** Read [old_project/src/components/TrackMap/MarkerLayer.tsx:28-131](old_project/src/components/TrackMap/MarkerLayer.tsx#L28-L131). Confirm constants: `SAMPLE_GAP_SNAP_DIVISOR = 30`, extrapolation `2.0s`, lerp-only in active render. Already verified during planning.
- **S0.4** Confirm `Formula1-Bold_web.ttf` as canonical bold; ignore `Formula1-Bold-4.ttf`.
- **S0.5** Locate `paddedViewBox` — confirmed at [src/utils/fitting.ts](src/utils/fitting.ts) per Critic file enumeration.
- **S0.6** Read [src/api/types.ts:125](src/api/types.ts#L125) — `RaceControl` interface; confirm it has `date`, `message`, plus `flag`/`category` (or equivalents). If absent, extend the type as part of S1.1c (in-scope: minimal field additions; not a refactor).

### Phase 1 — Data layer (parallel-safe: 1a, 1b, 1c independent) — commits per file
- **S1.1a** [src/components/Leaderboard/tireColors.ts] (NEW) — Pirelli palette `{ bg, fg }` per compound (unchanged from v2).
  **AC mapped:** AC10.

- **S1.1b** [src/store/leaderboardStore.ts] — Add `team_name: string` to `LeaderboardRow` (line 5-17); populate from `driver.team_name` in `recompute()`. **Also update the 2 test fixtures** (Critic feedback "What's Missing" #1):
  - [src/components/Leaderboard/Leaderboard.test.tsx:5-7](src/components/Leaderboard/Leaderboard.test.tsx#L5-L7) — add `team_name` to `fixtureRows`.
  - [src/components/Leaderboard/Row.profiler.test.tsx:6-24](src/components/Leaderboard/Row.profiler.test.tsx#L6-L24) — add `team_name` to `makeRow`.
  **AC mapped:** AC8.

- **S1.1c** [src/store/raceControlStore.ts] (NEW) — Per ADR-5:
  ```ts
  import { create } from 'zustand'
  import type { RaceControl } from '../api/types'

  export const RACE_CONTROL_BUFFER = 50

  interface RaceControlState {
    messages: RaceControl[]
    activeFlag: string | null
    safetyCarActive: boolean
    vscActive: boolean
  }

  interface RaceControlActions {
    appendBatch(rows: RaceControl[]): void
    reset(): void
  }
  ```
  `appendBatch` derives `activeFlag`/`safetyCarActive`/`vscActive` per old_project's logic in [old_project/src/state/raceControlStore.ts](old_project/src/state/raceControlStore.ts). Trim `messages` to `RACE_CONTROL_BUFFER`.
  Tests: `src/store/raceControlStore.test.ts`.
  **AC mapped:** AC7.

### Phase 2 — Component logic (depends on Phase 1; S2.1 MUST be the first commit)
- **S2.1 — MOTION FIRST (commit: `feat(phase2.1): interpolator snap+extrap port + trackLength wiring`)** — **Atomic W1 commit** spanning 3 files so AC5's snap criterion can actually fire (per Architect re-review #1):

  **(a) [src/scheduler/interpolator.ts]** — Extend `sampleAt()`:
  - **Lerp-only active path** (no Catmull-Rom dispatch added).
  - **TS overload sketch** (per Architect re-review #3):
    ```ts
    interface SampleAtOptions { mode?: 'lerp' | 'catmull'; snapDivisor?: number; trackLength?: number; extrapCapMs?: number }
    export function sampleAt(samples, t, mode?: 'lerp' | 'catmull'): { x:number; y:number } | null
    export function sampleAt(samples, t, opts: SampleAtOptions): { x:number; y:number } | null
    export function sampleAt(samples, t, modeOrOpts?): { x:number; y:number } | null {
      const opts = typeof modeOrOpts === 'string' ? { mode: modeOrOpts } : (modeOrOpts ?? {})
      // ...
    }
    ```
    Existing `sampleAt(samples, t, 'lerp')` callers and tests continue working unchanged.
  - **Snap logic:** when bracket `(s1, s2)` found and `trackLength > 0` and `snapDivisor > 0`, compute `snapDist = trackLength / snapDivisor`. If `euclidean(s1, s2) > snapDist`, return `{ x: s2.x, y: s2.y }`.
  - **Extrap logic:** when `t > last.t`, if `(t - last.t) > extrapCapMs`, return `last`. Else linearly extrapolate from the last segment's velocity `(last - prev) * (t - last.t) / (last.t - prev.t)`.

  **(b) [src/hooks/useMasterRaf.ts]** — Add `setTrackLength(meters: number)` to `MasterRafApi`; internal cached `trackLength` defaults to `0`. Tick at line 50 changes to: `sampleAt(samples, t, { mode: 'lerp', snapDivisor: 30, trackLength, extrapCapMs: 2000 })`. With `trackLength = 0` snap is a no-op, but the wiring is fully present.

  **(c) [src/components/Map/CircuitMap.tsx]** — **Just the trackLength wiring** in this commit:
  - Compute `trackLength = sum(euclidean(s[i], s[i+1]))` once when `substrateSamples` is built (memoized).
  - `useEffect(() => { masterRaf.setTrackLength(trackLength) }, [trackLength])`.
  - **Sizing constants, path-close, preserveAspectRatio additions stay in S2.2 (Phase W3).** Only the trackLength wiring lands in W1 — this keeps the W1 diff focused on motion behavior, makes AC5's snap path actually exercisable, and preserves the motion-first bisect signal.

  **MANDATORY: AC5 manual gate runs at this commit.** Reviewer plays a session at 1x and verifies sub-checklist before subsequent commits land. Pass criteria (per Critic feedback #7):
    1. No snap flicker on any 5 consecutive 6 s polls (this can actually be tested because `trackLength` is now wired in W1).
    2. Marker continues smoothly for up to 2 s past last sample, then visibly stops (extrap cap).
    3. No corner overshoot vs old_project at the same session/timestamp.

  **AC mapped:** AC4, AC5. **Tests:** S5.8.

- **S2.2** [src/components/Map/CircuitMap.tsx] — (a) `MARKER_RADIUS_PCT = 0.015`, `TRACK_STROKE_PCT = 0.008`. (b) Substrate path-close: reuse the `trackLength` already computed in S2.1; if `euclidean(samples[0], samples[last]) < paddedBbox.width * 0.02`, append a closing segment (lerp-style `L samples[0].x samples[0].y Z`). **Skip Catmull-Rom close-segment** (matches A4 lerp-only choice). Otherwise leave open. (c) Add `preserveAspectRatio="xMidYMid meet"` to `<svg>` explicitly.
  **Note:** `trackLength` computation and `masterRaf.setTrackLength()` wiring already landed in S2.1's atomic W1 commit — not duplicated here.
  **AC mapped:** AC1, AC3.

- **S2.3** Two-file change (per Architect re-review #2):
  - **[src/App.tsx]** — Wire poller's `onRaceControl` to `useRaceControlStore.getState().appendBatch()` (per ADR-5 / Critic #3). Pass `<RaceInfoPanel />` into the existing `AppShell` slot system by composing it inside the `leaderboard` prop (e.g. `leaderboard={<><RaceInfoPanel /><Leaderboard /></>}`). **Do NOT add a new `racePanel?` prop** to AppShell — keep the AppShell interface unchanged.
  - **[src/components/Leaderboard/Leaderboard.tsx]** — Becomes the **flex column parent** for the section: outer wrapper `className="flex flex-col h-full min-h-0"`. The leaderboard `<table>` wrapper gets `flex-1 min-h-0 overflow-auto`. `<RaceInfoPanel />` (when present as a sibling above the table via App.tsx composition) renders as a `shrink-0 max-h-40 overflow-auto` flex sibling.
  **AC mapped:** AC6, AC7.

- **S2.4** [src/components/Panels/RaceInfoPanel.tsx] (NEW) — Renders `useRaceControlStore` state. Flat theme (no shadow), 1px border, scrollable `<ol>` with `formatClock24(message.date)` prefix.
  **AC mapped:** AC6.

- **S2.5** [src/components/Leaderboard/Row.tsx] — Col 3 → `row.team_name`. Replace `<TireDot>` with `<TireChip>`.
  **AC mapped:** AC8, AC9.

- **S2.6** [src/components/Leaderboard/TireChip.tsx] (NEW) — Compound text + `TIRE_COLORS[compound]` background, dark/light fg by chip, `· ageLaps` if `ageLaps > 0`.
  **AC mapped:** AC9, AC10.

### Phase 3 — Visual System (parallel-safe with Phase 1; commits per concern)
- **S3.1** [src/styles/fonts.ts] (NEW) + Orbit `@import` in [src/index.css](src/index.css). `registerAppFonts()` called once from [src/main.tsx](src/main.tsx). (Same as v2.)
  **AC mapped:** AC14.

- **S3.2** [src/components/Shell/Wordmark.tsx] — `s<span className="text-soon-accent">oo</span>n Board`, **remove** `textShadow` inline style. Update [Wordmark.test.tsx](src/components/Shell/Wordmark.test.tsx) text assertion + snapshot regen via `vitest -u` (Critic feedback "What's Missing" #2 — snapshot regen explicit). **Also check [src/components/Shell/Header.tsx](src/components/Shell/Header.tsx)** for any wordmark-text references (Critic feedback "What's Missing" #5).
  **AC mapped:** AC11, AC12.

- **S3.3** Strip `textShadow|box-shadow|drop-shadow|shadow-*` per Phase 0 audit, including `.css` files and JSX `className="shadow-*"`. Preserve `ring-*` / `outline-*`. Phase 6 grep gate verifies completion.
  **AC mapped:** AC11.

- **S3.4** [src/utils/time.ts] (NEW) — `formatClock24(date: Date | string): string` via `Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })`. **Unit test** (Critic feedback #9 — ICU char normalization): assert `formatClock24('2024-03-15T14:30:00Z').replace(/[  ]/g, ' ').match(/^14:30:00$/)` is truthy. (Normalizes narrow-no-break-space and non-breaking-space variants introduced by Node ICU.)
  Replace every Phase-0-audited call site.
  **AC mapped:** AC13.

### Phase 4 — Map ResizeObserver (depends on S2.2; commit: `feat(phase4): dynamic viewBox aspect`)
- **S4.1** [src/components/Map/CircuitMap.tsx] + [src/utils/fitting.ts] — Add ResizeObserver per ADR-3 + v2 plan. Wrap SVG in `<div ref={containerRef} className="h-full w-full">`. Extend `paddedViewBox` → `paddedViewBoxForAspect(bbox, containerAspect | null, padPct)`. Old signature kept as compat shim that passes `null`.
  **AC mapped:** AC2.

### Phase 5 — Tests (parallel with Phase 3-4 — commit: `test(phase5): AC1-14 coverage`)
- **S5.1** CircuitMap.test.tsx — new viewBox-percent values; closed-path assertion when first/last are within threshold; assert `preserveAspectRatio="xMidYMid meet"` is present.
- **S5.1b (NEW — Critic feedback #4)** — **Mock ResizeObserver test for AC2:** install a mock that fires `{ width: 800, height: 600 }`; assert the resulting `viewBox` aspect ratio (`width/height`) equals `800/600` within `±5%` (padding tolerance). This makes AC2 partially automatable, not pure-manual.
- **S5.2** Wordmark.test.tsx + snapshot — lowercase `soon`, accent span class present, no `textShadow` style.
- **S5.3** Header.test.tsx — text assertion to `soon`.
- **S5.4** TireChip.test.tsx (NEW) — 6 compounds × `bg` / `fg` color, `ageLaps` rendering.
- **S5.5** Row tests — `team_name` in col 3.
- **S5.6** RaceInfoPanel.test.tsx (NEW) — empty/with-messages/snapshot, flag chip, SC/VSC badges, 24h timestamps.
- **S5.7** raceControlStore.test.ts (NEW) — appendBatch (per ADR-5 method name), derived state, **buffer cap** assertion (1000 messages → 50 retained).
- **S5.8** interpolator.test.ts — fixtures for (a) lerp baseline, (b) snap triggers when `dist > trackLength/30`, (c) extrap glides for ≤2 s past last sample then clamps.
- **S5.9** time.test.ts (NEW) — `formatClock24` with ICU char-normalization regex.
- **S5.10** **Manual gate runs at Phase 2.1 commit** for AC5 (motion-first ordering); rerun at Phase 6 for AC2 and AC14.

### Phase 6 — Verification gate (final — commit: `chore(phase6): verify`)
- `npm run typecheck && npm run lint && npm test && npm run build`. All must pass.
- **Production-build smoke** (`npm run build && npm run preview`): open the built artifact, devtools Network panel → confirm Formula1 TTFs fetched + the `fonts.googleapis.com/css2?family=Orbit&display=swap` request resolves. **Pass criterion (Critic feedback #14):** `document.fonts.check('700 1em Formula1')` returns `true` after 2 s of page load. Add a one-line console-eval step to the PR description.
- **Grep gate** (AC11): `rg -n 'textShadow|box-shadow|drop-shadow|shadow-(?!none)\w+' src/ --type-add 'all:*.{ts,tsx,css}' -tall` returns no app-source matches (excluding `__snapshots__`).
- **Manual gate** (AC2, AC5, AC14): walk through every panel at multiple window sizes; verify all 14 ACs.

---

## Parallelization Windows
```
W0 (sequential):
  └─ Phase 0 — audit                                       commit: chore(phase0): audit

W1 (motion-first — runs alone; AC5 manual gate after):
  └─ Phase 2.1 — interpolator snap+extrap                  commit: feat(phase2.1): motion port
  └─ [MANUAL AC5 SIGN-OFF before W2 lands]

W2 (parallel — only after W1's manual sign-off):
  ├─ Phase 1 — data layer                                  commits: feat(phase1a/1b/1c)
  └─ Phase 3 — visual system                               commits: feat(phase3.1/3.2/3.3/3.4)

W3 (after W2):
  └─ Phase 2.2-2.6 — remaining component logic             commits: feat(phase2.2/2.3/2.4/2.5/2.6)

W4 (parallel after W3):
  ├─ Phase 4 — ResizeObserver                              commit: feat(phase4): viewBox aspect
  └─ Phase 5 — tests                                       commit: test(phase5): AC coverage

W5 (final):
  └─ Phase 6 — verification gate                           commit: chore(phase6): verify
```

Critic-feedback synthesis: motion gates W1 alone; everything else stacks on a known-good motion baseline. `git bisect` for AC5 regressions lands on the Phase 2.1 commit immediately.

---

## Risks and Mitigations (R1-R16; R-Critic added)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Snap port creates flicker regression | M→**L** (after constant fix) | H | **Snap divisor `30` matches old_project's documented post-flicker fix**; S5.8 fixture asserts snap trigger threshold; AC5 manual gate in isolation (W1) before any other change lands |
| R2 | Font load FOUT visible | H | L | `font-display: swap`; optional preload follow-up |
| R3 | Substrate path-close stitches across teleport | M | M | `closeThreshold = paddedBbox.width * 0.02`; dev-debug log when threshold not met |
| R5 | AC9 ambiguity | L | L | Plan picks full word |
| R6 | AC12 accent-slice ambiguity | L | L | Plan picks `s<accent>oo</accent>n` |
| R7 | AC5 manual-only — no automated "smoothness" gate | M→**L** (with sub-checklist) | M | **AC5 sub-checklist enforced (per Critic #7):** (i) no snap flicker on >5 consecutive polls, (ii) extrap glide ≤2 s, (iii) no corner overshoot vs old_project; S5.8 covers (i)+(ii) automatically |
| R8 | Orbit Korean glyph gaps | L | M | `system-ui` deepest fallback |
| R9 | Stripping shadows removes focus indicators | L | M | Phase 0 audit whitelists `ring-*`/`outline-*` |
| R10 | `team_name` missing on some drivers | L | L | Default to `''` |
| R11 | Bundled PR review noise | L | L | Per-phase commits; **motion-first ordering** for diagnostic isolation |
| R12 | `font-display: swap` flashes per navigation | L | L | Self-hosting + caching |
| R13 | Font paths break in production | H (mitigated by ADR-2) | H | ESM `?url` + `FontFace.load()`; Phase 6 production smoke with `document.fonts.check()` gate |
| R14 | `paddedViewBox` recomputed every render | M | M | `useMemo([bbox, containerAspect])` in S4.1; compat shim preserves existing-caller identity |
| R15 | `useDriverMarker` registration contract change | L→**∅** (verified) | L | Confirmed: registration shape unchanged ([useDriverMarker.ts:8-15](src/hooks/useDriverMarker.ts#L8-L15)) |
| R16 | AC2 root cause confusion | H (mitigated by ADR-3) | M | ADR-3 targets the SVG; AppShell untouched |
| **R-C1 (NEW)** | Critic-flagged: Catmull-Rom invented instead of lerp port | RESOLVED | H | ADR-1 v3 uses lerp + snap_30 + extrap_2000 matching old_project literally |
| **R-C2 (NEW)** | Critic-flagged: snap divisor 200 reintroduces flicker | RESOLVED | H | ADR-1 v3 uses `SAMPLE_GAP_SNAP_DIVISOR = 30` |
| **R-C3 (NEW)** | Critic-flagged: raceControlStore API mismatch | RESOLVED | M | ADR-5 specifies `appendBatch(rows: RaceControl[])` + `RACE_CONTROL_BUFFER = 50` |
| **R-C4 (NEW)** | Critic-flagged: AC2 verification non-rigorous | RESOLVED (S5.1b) | M | S5.1b mock-ResizeObserver test asserts viewBox aspect ratio matches container aspect |

---

## Test Plan → AC mapping
| AC | Test | Owner | Notes |
|----|------|-------|-------|
| AC1 | S5.1 | unit | viewBox-percent |
| AC2 | S5.1b (mock ResizeObserver → aspect match) + Phase 6 manual | unit + manual | Critic #4 — was manual-only, now partly automated |
| AC3 | S5.1 | unit | closed-path |
| AC4 | S5.8 | unit | lerp + snap + extrap |
| AC5 | S5.8 + **AC5 sub-checklist at S2.1 commit** | unit + manual checklist | Critic #7 |
| AC6 | S5.6 | unit | |
| AC7 | S5.7 | unit | appendBatch + buffer cap |
| AC8 | S5.5 + fixture updates in S1.1b | unit | |
| AC9 | S5.4 | unit | |
| AC10 | S5.4 | unit | |
| AC11 | Phase 6 grep gate (`.ts/.tsx/.css`) | integration | Critic #8 |
| AC12 | S5.2 + S5.3 | unit + snapshot | |
| AC13 | S5.9 with ICU normalization | unit | Critic #9 |
| AC14 | Phase 6 `document.fonts.check()` gate | semi-automated | Critic #14 |

---

## Open / lower-confidence items (carried over from spec)
- AC5 final visual sign-off is human judgment (now bounded by 3-item checklist).
- AC9 short-vs-long compound text — full word chosen.
- AC12 accent slice — `oo` chosen.
- AC13 Korean-glyph-coverage testing depends on what content actually renders Korean (out of scope for this pass).

---

## Changelog
- **v1 (2026-05-20)** — Initial draft.
- **v2 (2026-05-20)** — Architect review: interpolator retargeted to `src/scheduler/interpolator.ts`; font ESM `?url`; ResizeObserver in CircuitMap; bbox-relative close threshold; Formula1-Bold_web canonical; `formatClock24` helper; R13-R16 added.
- **v3.1 (2026-05-20)** — **Architect re-review on v3:**
  - **S2.1 expanded to atomic 3-file W1 commit** (interpolator + useMasterRaf.setTrackLength + CircuitMap trackLength wiring) so AC5's snap criterion is actually testable at the W1 manual gate (Architect re-review #1 — splitting these made the "no flicker" check vacuous).
  - **S2.2** trimmed: trackLength computation moved to S2.1; S2.2 now only handles sizing constants + path-close + preserveAspectRatio.
  - **S2.3 explicit:** `Leaderboard.tsx` becomes the flex parent; `App.tsx` composes `<RaceInfoPanel />` inside the `leaderboard` slot (no AppShell interface change).
  - **ADR-1 TS overload sketch added** so backward-compat with existing `sampleAt(samples, t, 'lerp')` callers is unambiguous.
- **v3 (2026-05-20)** — **Critic review applied:**
  - **ADR-1 critical fix:** lerp (not Catmull-Rom) per old_project's active render path; snap divisor `30` (not `200`) per old_project's documented post-flicker fix at MarkerLayer.tsx:28-33.
  - **ADR-5 (NEW):** raceControlStore uses `appendBatch(rows: RaceControl[])` (new-project sibling convention) with `RACE_CONTROL_BUFFER = 50` (old_project lessons-learned). Existing `RaceControl` type reused from `src/api/types`.
  - **S5.1b (NEW):** mock-ResizeObserver test asserts viewBox aspect ratio matches container — AC2 partly automated.
  - **R7 / AC5:** concrete 3-item sub-checklist added (no flicker on >5 polls, extrap ≤2 s, no corner overshoot).
  - **Option A:** retained but with **motion-first commit ordering** (W1 runs alone, manual AC5 sign-off, then W2/W3) to address Critic's bisect concern structurally.
  - **`paddedViewBox`:** clarified as compat shim → `paddedViewBoxForAspect`; no caller migration.
  - **`trackLength` source:** now explicitly `MasterRafApi.setTrackLength(meters)` called from CircuitMap when substrate built.
  - **AC11 grep:** extended to `.ts/.tsx/.css`; preserves `ring-*` / `outline-*`.
  - **AC13 test:** ICU normalization regex.
  - **AC14 gate:** `document.fonts.check('700 1em Formula1')` semi-automatable.
  - **Phase 6 grep gate:** uses `rg -n` with extended file types.
  - **Header.tsx, snapshot regen, LeaderboardRow consumers, S2.3 layout placement:** all explicitly addressed per Critic "What's Missing" list.
