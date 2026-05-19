# Open Questions

Centralized log of unresolved decisions across all plans.

---

## SOON Board Consensus Plan — 2026-05-19

Deferred from `.omc/specs/deep-interview-soon-board.md` §Open Questions (lines 571–579). None block v1 core, all expected to clarify during implementation.

- [ ] Accent color toggle — racing red `#E10600` (v1 default) vs neon green `#00FF94`. Expose toggle in settings? — Spec line 573. Why it matters: affects branding identity and settings UX surface area.
- [ ] Calendar layout — simple card grid (planned v1) vs full-season monthly calendar view. — Spec line 574. Why it matters: card grid ships faster; calendar view is denser for season-at-a-glance browsing.
- [ ] Driver helmet visuals — OpenF1 `headshot_url` only vs curated helmet SVG collection. — Spec line 575. Why it matters: SVG collection improves brand fit but adds asset pipeline + licensing scrutiny.
- [ ] Playback Pause / Step interactions — is per-frame stepping UI needed? — Spec line 576. Why it matters: would change scrubber affordances and `timelineStore` API surface.
- [ ] Session caching to IndexedDB — save network on revisit, but increases first-load and storage footprint. — Spec line 577. Why it matters: directly affects rate-limit headroom and offline behavior.
- [ ] Multi-tab coordinator — share polling budget via localStorage across tabs. — Spec line 578. Why it matters: without coordination, two tabs can collectively exceed 30 req/min and get throttled.

### Architect / Critic Attention (from consensus plan §8.4)

- [ ] `location` lateral inaccuracy — centerline-only rendering: confirm UX accepts overlap when two cars are on different track sides at the same `t`. — Plan R6.
- [ ] Hand-rolled SVG sparkline vs recharts — swap-in if sparkline > 60 LOC or a11y regression. Recharts adds ~80KB. Approve threshold? — Plan Phase 7 / R10.

---

## v1.1 Deferred Items — captured Phase 10 (2026-05-19)

Items below are confirmed out-of-scope for v1. They are tracked here for the next maintainer.

- [ ] **Accent color toggle** — racing red `#E10600` (v1 default) vs neon green `#00FF94`. Expose as settings toggle. Spec §Open Questions line 573.
- [ ] **Calendar layout** — simple card grid (v1) vs full-season monthly calendar view. Card grid ships faster; monthly view is denser for season-at-a-glance browsing.
- [ ] **Helmet headshots vs SVG collection** — OpenF1 `headshot_url` only (v1) vs curated helmet SVG collection. SVG collection needs asset pipeline + licensing scrutiny.
- [ ] **Pause/Step UI** — per-frame stepping UI: would change scrubber affordances and `timelineStore` API surface.
- [ ] **IndexedDB session cache** — save network on revisit; increases first-load complexity and storage footprint.
- [ ] **Multi-tab rate-limit coordinator** — share polling budget via localStorage across tabs; without coordination, two tabs can collectively exceed 30 req/min.

---

## Resolved decisions — iteration 2 (2026-05-19)

The following items were open in iteration 1 and were closed by Critic-mandated amendments M1–M9 in iteration 2. They are kept here for audit trail.

- [x] **AC2.2 cadence deviation** — Resolved via M1 + M5. Final locked table in §3 Phase 3 sums to exactly 30.0 req/min: `location` 6s (10/min), `intervals` 6s (10/min), `race_control` 10s (6/min), `position` 30s (2/min), `laps` 60s (1/min), `pit` 180s (0.33/min), `stints` 180s (0.33/min), `weather` 180s (0.33/min). Token-bucket 3 req/s ceiling absorbs retry / re-calibration bursts. AC2.1 reads "≤ 30 req/min steady; token bucket 3 req/s ceiling absorbs bursts."
- [x] **bacinger GeoJSON schema audit blocker** — Resolved via M6. Telemetry substrate is always-on and load-bearing for marker placement; bacinger is now an optional decoration layer. Schema variance is cosmetic only (R3 downgraded).
- [x] **Affine residual instability blocker** — Resolved via M6 for the same reason. Affine fit moved off the critical render path; residual is informational only (R8 downgraded).
- [x] **Lighthouse Performance ≥ 80 escape hatch** — Formalized via R12 rewrite. Phase 6 end-of-phase `npm run lighthouse:ci -- --device=mobile` gate blocks Phase 7. On failure, force-enable 30Hz everywhere via M4 pre-emption before Phase 7 starts.
- [x] **iPad Safari 30Hz heuristic** — Resolved via M4. UA-based detection (touch + Macintosh/iPad + Safari + no Chrome variants) starts at 30Hz; `?fps=60` / `?fps=30` URL overrides; bidirectional drift (Safari upgrades on < 2% drops, Chrome downgrades on > 10% drops). Handles iPadOS "Request Desktop Site" via the touch + Macintosh heuristic.
- [x] **Server-time / wall-clock alignment ambiguity** — Resolved via M7. `timelineStore.syncServerTime(serverDate, clientPerfNowMs)` reads OpenF1 `Date` HTTP header from `src/api/client.ts` interceptor on first response, sets `serverTimeOffsetMs` such that the live anchor matches `serverTime ≈ wallClock - 3s`. Glossary added to §2.0.
- [x] **Telemetry buffer RAM cap** — Resolved via M8. `MAX_BUFFERED_SESSIONS = 1`; `telemetryStore.flush()` is called on every session switch; per-driver ring buffer remains 200 samples. iPad Safari ~1GB single-tab RAM dependency documented in §8.5.
- [x] **GitHub Pages first deploy permissions** — Resolved via M9. Top-level `permissions: { contents: write, pages: write, id-token: write }` declared in `.github/workflows/deploy.yml` (Phase 0). Phase 10 verifies via `gh run list --workflow=deploy.yml --limit 1`.
- [x] **AC7.6 split** — Resolved via M3. AC7.6a (headless Chrome desktop Lighthouse-CI ≥ 80 / 90, blocking in CI) and AC7.6b (iPad Safari physical-device manual gate before `v1` tag, evidence archived to `.omc/release-evidence/v1/`).
- [x] **Bacinger sourcing** — Locked to git submodule at a known-MIT commit hash (no postinstall clone; no CI rate-limit risk against github.com).
- [x] **AC6.5 architectural invariant enforcement** — `scripts/architecture-check.ts` greps for `mode === 'live'` outside `src/store/timelineStore.ts`; CI fails on matches in component code.
- [x] **R7 outage cache scope** — Resolved. `sessionStorage` cache for `location` / `intervals` / `position` keyed `(session_key, endpoint)`, TTL 10min, 2MB budget with LRU; banner at > 60s staleness.
