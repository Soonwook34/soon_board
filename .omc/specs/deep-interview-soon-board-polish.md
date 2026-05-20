# Deep Interview Spec: soon_board Polish Pass (bugs + UI)

## Metadata
- Interview ID: di-soon-board-polish-2026-05-20
- Rounds: 5 (Round 0 topology + 5 ambiguity rounds)
- Final Ambiguity Score: 15.4%
- Type: brownfield
- Generated: 2026-05-20
- Threshold: 20%
- Initial Context Summarized: no
- Status: PASSED
- Status flag: **pending approval** — execution is gated on the user explicitly selecting an execution path in the bridge step.

## Clarity Breakdown (overall, brownfield weights)
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.89 | 0.35 | 0.312 |
| Constraint Clarity | 0.88 | 0.25 | 0.220 |
| Success Criteria | 0.83 | 0.25 | 0.208 |
| Context Clarity | 0.90 | 0.15 | 0.135 |
| **Total Clarity** | | | **0.875** |
| **Ambiguity** | | | **0.154 (15.4%)** |

## Topology
All 5 components active. No deferrals.

| Component | Status | Description | Coverage / Deferral Note |
|-----------|--------|-------------|--------------------------|
| Map Geometry | active | Marker / track stroke sizing, vertical resize, circuit start-end seam | AC1, AC2, AC3 |
| Map Motion | active | Smoother driver interpolation; keep 30 req/min budget | AC4, AC5 |
| Race Info Panel | active | Port `RaceControlPanel` from old_project (flag, SC, VSC, messages) | AC6, AC7 |
| Leaderboard Polish | active | Team-name col fix + tire compound text + official compound colors | AC8, AC9, AC10 |
| Visual System | active | Flat theme (strip glow/shadow), `soon` wordmark, 24-hour time, F1 + Orbit fonts | AC11, AC12, AC13, AC14 |

## Goal
Apply a coordinated polish pass to the existing soon_board F1 dashboard that (a) fixes five concrete bugs spanning the Map and Leaderboard, (b) ports the Race Control panel from `old_project/`, and (c) modernizes the visual system to a flat dark theme with the user-provided Formula1 typeface (Orbit as Google-font fallback). The locked OpenF1 request budget of 30 req/min from the prior consensus plan stays intact — motion improvements come from interpolation quality, not poll cadence.

## Constraints
- Keep total OpenF1 request budget at **30 req/min steady state** ([src/scheduler/poller.ts](src/scheduler/poller.ts) cadences must NOT be raised). Motion smoothness is purely an interpolation/animation fix.
- Match old_project's interpolation behavior: Catmull-Rom heading, snap-on-teleport (lap wrap), extrapolation cap ~2 s ([old_project/src/utils/interpolation.ts](old_project/src/utils/interpolation.ts), [old_project/src/components/TrackMap/MarkerLayer.tsx](old_project/src/components/TrackMap/MarkerLayer.tsx)).
- Sizing is viewBox-percentage based (already proportional). New targets: `MARKER_RADIUS_PCT=0.015`, `TRACK_STROKE_PCT=0.008` ([src/components/Map/CircuitMap.tsx](src/components/Map/CircuitMap.tsx)).
- Race Control data already polled at 10 s by the existing poller — reuse `race_control` channel; do not add a new endpoint.
- Font files already in repo: [src/assets/fonts/](src/assets/fonts/) — wire `@font-face` declarations against the existing TTFs. No additional Formula1 file downloads.
- Orbit Google font loaded via Google Fonts CSS API (`https://fonts.googleapis.com/css2?family=Orbit&display=swap`).
- "Flat modern" scope is limited to removing glow / textShadow / drop-shadows. Spacing, border-radius, and existing color palette stay as-is.
- 24-hour time format applies to every user-visible clock string (header, calendar, race-control message timestamps, time indicator).
- Wordmark currently renders `S<accent>ON</accent> Board` ([src/components/Shell/Wordmark.tsx:1-11](src/components/Shell/Wordmark.tsx#L1-L11)). New form must read `soon` (lowercase) and keep an accent treatment on a substring; specific accent slice is left to the executor but the visible text MUST be `soon`.
- Leaderboard team display column must show the **team name** (not the driver acronym again). Existing `Driver.team_name` from OpenF1 is the source; thread it through `LeaderboardRow` ([src/store/leaderboardStore.ts:5-17](src/store/leaderboardStore.ts#L5-L17)) and render in column 3 of [src/components/Leaderboard/Row.tsx](src/components/Leaderboard/Row.tsx).
- Tire compound colors must match the official Pirelli broadcast palette:
  - SOFT: `#DA291C` (red)
  - MEDIUM: `#FFD93D` (yellow)
  - HARD: `#F0F0F0` (off-white, readable on dark)
  - INTERMEDIATE: `#43B02A` (green)
  - WET: `#0067B1` (blue)
  - UNKNOWN: muted gray (current fallback)

## Non-Goals
- Do NOT change the OpenF1 request budget or any individual endpoint cadence.
- Do NOT add weather panel, helmet visuals, or any feature not explicitly listed in [.omc/plans/open-questions.md](.omc/plans/open-questions.md) — those remain deferred.
- Do NOT introduce pre-shipped SVG circuit overlays (kept telemetry-derived substrate only for this pass).
- Do NOT redesign the Layout grid; "resize" fix is scoped to making the Map SVG fill its container vertically as well as horizontally.
- Do NOT change spacing, border-radius, or color hierarchy beyond removing glow/shadow.
- Do NOT amend, refactor, or "improve" adjacent code unrelated to the listed bugs / items (per [CLAUDE.md §3 Surgical Changes](CLAUDE.md)).

## Acceptance Criteria

### Map Geometry
- [ ] **AC1** — `MARKER_RADIUS_PCT === 0.015` and `TRACK_STROKE_PCT === 0.008` in [src/components/Map/CircuitMap.tsx](src/components/Map/CircuitMap.tsx). Existing tests updated.
- [ ] **AC2** — Track SVG fills both width AND height of its parent container; on browser window resize the track re-fits without dead vertical space. Verified by adding a `ResizeObserver`-driven recompute OR by ensuring the SVG container is `h-full w-full` with `preserveAspectRatio="xMidYMid meet"` AND the parent layout cell expands to its grid row.
- [ ] **AC3** — Substrate polyline closes the loop: the last sample connects back to the first sample via a smooth Catmull-Rom segment (or an explicit `Z` closing segment when first/last samples are within `<trackLength/100>` of each other). No visible seam at lap start/end in the rendered SVG.

### Map Motion
- [ ] **AC4** — Marker interpolation matches old_project quality: Catmull-Rom heading + snap when bracket-distance exceeds `trackLength/200` (teleport / lap wrap), plus extrapolation cap of 2 seconds. Reuse logic from [old_project/src/utils/interpolation.ts](old_project/src/utils/interpolation.ts) and [old_project/src/components/TrackMap/MarkerLayer.tsx](old_project/src/components/TrackMap/MarkerLayer.tsx).
- [ ] **AC5** — At 1x playback, driver markers move visibly smoothly with no perceived "툭툭 끊김" between location samples (6 s apart). Manual verification against an old_project demo at the same session. Poller cadence unchanged (still 30 req/min).

### Race Info Panel
- [ ] **AC6** — A new `RaceInfoPanel` component renders the active flag (default GREEN), SC badge, VSC badge, and a scrollable list of race-control messages with HH:MM:SS timestamps in 24-hour format. Structure mirrors [old_project/src/components/Panels/RaceControlPanel.tsx](old_project/src/components/Panels/RaceControlPanel.tsx) but uses the new project's `useRaceControlStore` (port from old_project) and the new flat theme.
- [ ] **AC7** — Panel reads from a new `raceControlStore` (port shape from [old_project/src/state/raceControlStore.ts](old_project/src/state/raceControlStore.ts)) fed by the existing poller's `race_control` handler in [src/App.tsx](src/App.tsx). No new endpoint, no new cadence.

### Leaderboard Polish
- [ ] **AC8** — Column 3 of the leaderboard row shows the **team name** (`row.team_name`), not the driver acronym. `team_name` added to `LeaderboardRow` interface in [src/store/leaderboardStore.ts](src/store/leaderboardStore.ts) and populated from `driver.team_name`. Existing tests + snapshots updated.
- [ ] **AC9** — Tire column shows the compound **as text** (`SOFT` / `MEDIUM` / `HARD` / `INTER` / `WET`) in addition to / instead of a color dot. The text or a backing chip is colored using the official compound palette (see Constraints).
- [ ] **AC10** — `TireDot` (or its replacement `TireChip`) uses the official Pirelli palette constants exposed from a shared module (e.g. `src/components/Leaderboard/tireColors.ts`). Snapshot tests assert color-class mapping.

### Visual System
- [ ] **AC11** — All `textShadow`, `box-shadow`, and CSS `filter: drop-shadow` declarations are removed from app components (including the accent glow on the wordmark at [src/components/Shell/Wordmark.tsx:5](src/components/Shell/Wordmark.tsx#L5)). Grep `textShadow|box-shadow|drop-shadow` over `src/` returns either no matches or only utility-class names that resolve to `none`.
- [ ] **AC12** — Wordmark visible text reads `soon Board` (lowercase `soon`). Accent treatment kept on a substring (executor picks the slice, e.g. `s<accent>oo</accent>n` or `<accent>soon</accent>`). Existing `Wordmark.test.tsx` updated to assert `soon` text.
- [ ] **AC13** — Every user-visible time string uses **24-hour** format. Verified across header / calendar / time indicator / race-control message timestamps. No AM/PM appears anywhere.
- [ ] **AC14** — Font system wired:
  - `@font-face` declarations for Formula1 family (Regular, Wide, Bold, Italic, Black) loading the existing TTFs from [src/assets/fonts/](src/assets/fonts/).
  - Orbit loaded via `@import url('https://fonts.googleapis.com/css2?family=Orbit&display=swap')` (or equivalent `<link>` in `index.html`).
  - Default `font-family` stack: `'Formula1', 'Orbit', system-ui, sans-serif`. Korean glyphs fall through to Orbit when Formula1 lacks them.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "선수 위치 갱신 주기가 너무 길다" implies polling cadence must increase | The prior consensus plan locks 30 req/min ([.omc/plans/soon-board-consensus-plan.md](.omc/plans/soon-board-consensus-plan.md)); raising it has API-quota implications | User chose "keep 30 req/min, improve interpolation only" — motion fix is interpolation-only |
| "Flat modern design" might mean a full theme redesign (spacing, radius, color) | Could ping-pong forever if scope unbounded | User narrowed to "remove glow/textShadow/drop-shadows only" — spacing/radius/colors untouched |
| "팀 표시 이상함" might be a color rendering bug | Inspected [src/components/Leaderboard/Row.tsx:14-23](src/components/Leaderboard/Row.tsx#L14-L23) — cols 2 and 3 both render `name_acronym` | Confirmed: col 3 should be team name; thread `team_name` through store |
| "resize to browser current size" might already work (SVG is fluid) | User clarified: currently only horizontal resizes, vertical leaves dead space | Fix scope: ensure SVG fills both axes (`h-full` + correct `preserveAspectRatio` + parent grid row stretch) |
| Circuit seam might require swapping to pre-shipped SVG paths | Old project ships hand-curated SVGs but adds circuit-id mapping burden | User chose "close the loop on substrate" — minimal change, no SVG registry |
| "Orbit" might be a typo for Orbitron or Pretendard | None of those are exact Google Font names that cover Korean | User pointed to `fonts.google.com/specimen/Orbit` directly — use Orbit as-is |
| Race info should include weather, helmet, etc | Open-questions doc defers those | Scope locked to flag + SC/VSC + message list (parity with old_project's `RaceControlPanel`) |

## Technical Context (Brownfield)

### Files that will change
| File | Reason |
|------|--------|
| [src/components/Map/CircuitMap.tsx](src/components/Map/CircuitMap.tsx) | New sizing constants (AC1); substrate path-close logic (AC3) |
| [src/components/Map/CircuitMap.test.tsx](src/components/Map/CircuitMap.test.tsx) | Update assertions for new viewBox-percent values + closed path |
| [src/components/Map/Marker.tsx](src/components/Map/Marker.tsx) | Possibly minor stroke updates; size is parent-driven |
| [src/hooks/useMasterRaf.ts](src/hooks/useMasterRaf.ts) | Port interpolation behavior from old_project (Catmull-Rom + snap-on-teleport + 2 s extrapolation cap) |
| [src/hooks/useDriverMarker.ts](src/hooks/useDriverMarker.ts) | Wire updated interpolator |
| [src/components/Layout/*](src/components/Layout/) (or AppShell) | Ensure map container fills vertical grid row (AC2) |
| [src/store/leaderboardStore.ts](src/store/leaderboardStore.ts) | Add `team_name` to `LeaderboardRow`; populate from `driver.team_name` |
| [src/components/Leaderboard/Row.tsx](src/components/Leaderboard/Row.tsx) | Render `team_name` in col 3 instead of duplicated acronym; replace TireDot with TireChip (text + color) |
| [src/components/Leaderboard/TireDot.tsx](src/components/Leaderboard/TireDot.tsx) → `TireChip.tsx` | Add compound text + official color mapping |
| `src/components/Leaderboard/tireColors.ts` (NEW) | Export compound→color palette constants |
| `src/components/Panels/RaceInfoPanel.tsx` (NEW) | Port from [old_project/src/components/Panels/RaceControlPanel.tsx](old_project/src/components/Panels/RaceControlPanel.tsx) |
| `src/store/raceControlStore.ts` (NEW) | Port from [old_project/src/state/raceControlStore.ts](old_project/src/state/raceControlStore.ts) |
| [src/App.tsx](src/App.tsx) | Wire poller → raceControlStore; mount RaceInfoPanel; ensure layout includes new panel |
| [src/components/Shell/Wordmark.tsx](src/components/Shell/Wordmark.tsx) | `soon` text (AC12), no glow (AC11) |
| [src/components/Shell/Wordmark.test.tsx](src/components/Shell/Wordmark.test.tsx) + snapshot | Update for `soon` |
| [src/components/Shell/Header.test.tsx](src/components/Shell/Header.test.tsx) | Update for `soon` |
| `src/styles/fonts.css` (NEW) or `src/index.css` | `@font-face` declarations + Orbit `@import` + base `font-family` stack (AC14) |
| Any component using time formatting (header, calendar, time indicator) | Switch to 24-hour format helpers (AC13) |

### Data flow (unchanged conceptually)
```
Poller (30 req/min, locked)
  ├─ location (6s) ──► telemetryStore.appendLocationBatch
  ├─ intervals (6s) ─► leaderboardStore.recompute
  ├─ race_control(10s)► raceControlStore.append (NEW wiring)
  ├─ position (30s) ─► leaderboardStore.recompute
  └─ ...
useMasterRaf (rAF) ── reads telemetryStore.byDriver, interpolates (Catmull-Rom + snap + 2s extrap) ── writes marker transform
```

## Ontology (Key Entities)
| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| LeaderboardRow | core domain | driver_number, name_acronym, **team_name (NEW)**, team_colour, position, lastLapMs, gapToLeaderMs, intervalAheadMs, tireCompound, tireAgeLaps, pitStops, sparklineLaps | has-a Driver, has-a active Stint |
| Driver | core domain | driver_number, name_acronym, team_name, team_colour | belongs-to Team |
| Stint | core domain | compound, lap_start, lap_end, tyre_age_at_start | belongs-to Driver |
| RaceControlMessage | core domain (NEW in new project) | date, message, flag?, category? | belongs-to Session |
| TireCompound | value type | SOFT \| MEDIUM \| HARD \| INTER \| WET \| UNKNOWN | mapped-to OfficialColor |
| OfficialColor | value type (NEW) | hex string per compound | — |
| Wordmark | UI element | visible text, accent slice | — |
| MapSubstrate | derived geometry | viewBox, paddedBbox, polyline samples, isClosed | derived-from telemetry |
| MarkerSize | viewBox % | MARKER_RADIUS_PCT=0.015 | — |
| TrackStroke | viewBox % | TRACK_STROKE_PCT=0.008 | — |
| Interpolator | runtime fn | catmullRom(t), snapIfTeleport, extrapolateCap=2s | reads telemetryStore |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 0 (topology) | 5 (component-level) | 5 | - | - | - |
| 1 (motion) | 8 | +3 (Interpolator, MapSubstrate, request budget) | 0 | 5 | 62% |
| 2 (flat) | 9 | +1 (Wordmark) | 0 | 8 | 89% |
| 3 (leaderboard team) | 10 | +1 (LeaderboardRow gained team_name) | 1 (LeaderboardRow renamed concept) | 8 | 90% |
| 4 (geometry) | 11 | +2 (MarkerSize, TrackStroke) | 0 | 9 | 82% |
| 5 (fonts) | 11 | 0 | 0 | 11 | 100% |

Ontology fully converged at R5.

## Interview Transcript
<details>
<summary>Full Q&A (Round 0 + 5 rounds)</summary>

### Round 0 — Topology
**Q:** Is the 5-component topology (Map Geometry / Map Motion / Race Info Panel / Leaderboard Polish / Visual System) right?
**A:** Looks right — all 5 active.

### Round 1 — Map Motion / Constraints
**Q:** Keep 30 req/min budget, raise location to 3 s, hybrid, or investigate first?
**A:** Keep 30 req/min, improve interpolation only.

### Round 2 — Visual System / Criteria
**Q:** What does "flat modern" mean concretely?
**A:** Remove all glow / textShadow / drop-shadows only. (Spacing, radius, color hierarchy unchanged.)

### Round 3 — Leaderboard / Constraints
**Q:** What's wrong with team display?
**A:** "팀과 드라이버 이름이 똑같음" — team and driver acronym are identical. Col 3 needs to be team name.

### Round 4 — Map Geometry / Constraints (multi-aspect)
**Q1:** Concrete marker/track values?
**A1:** Marker 1.5%, Track 0.8% (moderate).
**Q2:** What does "resize to browser size" mean?
**A2:** "현재는 좌우만 맞춰서 resize가 되는 것 같은데, 상하도 고려할 필요가 있음" — currently only horizontal resizes; needs vertical too.
**Q3:** Circuit start/end seam fix?
**A3:** Close the loop — stitch first sample to last sample.

### Round 5 — Visual System / Font Fallback
**Q:** Which Google font for Korean fallback?
**A:** https://fonts.google.com/specimen/Orbit (use Orbit as specified).
</details>

---

## Open / Lower-confidence items (review before execute)
1. **AC5 verification method** — "visually smooth vs old_project demo" is comparison-based; final acceptance is a manual side-by-side check by the user (no automated test).
2. **AC12 accent slice** — `s<accent>oo</accent>n`, `<accent>soon</accent>`, or other slice is left to executor judgment within the "lowercase soon, accent on a substring" rule.
3. **AC9 chip vs dot** — executor may keep a small color dot AND add compound text, OR replace the dot with a colored chip; both satisfy the AC as long as the compound text is visible and color is from the official palette.
