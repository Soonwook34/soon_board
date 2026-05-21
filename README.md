# SOON BOARD

<sub>**Unofficial fan project — not affiliated with Formula 1, FIA, or FOM.**</sub>

A non-commercial Formula 1 viewing companion built on the [OpenF1](https://openf1.org/) community API. Live race map, dashboard, and replay of historical sessions, all served from Cloudflare Pages at $0/month operating cost.

> **Wordmark color rule:** in `SOON BOARD`, only the letters **ON** (positions 3–4) are colored `#E10600` (F1 red). All other letters are off-white `#F5F5F0`.

---

## Status

Pre-alpha. The implementation plan lives in [`.omc/plans/consensus-soon-board-stack.md`](.omc/plans/consensus-soon-board-stack.md) (v2.3, consensus-approved by Architect + Critic + user). The deep-interview specification it derives from is at [`.omc/specs/deep-interview-soon-board-stack.md`](.omc/specs/deep-interview-soon-board-stack.md).

Three sub-plans drive the rendered views:
- [`main-page-implementation.md`](.omc/plans/main-page-implementation.md) — season catalog landing page
- [`dashboard-implementation.md`](.omc/plans/dashboard-implementation.md) — live + replay dashboard panels
- [`live-map-implementation.md`](.omc/plans/live-map-implementation.md) — Canvas 2D track + driver markers

Reference docs:
- [`openf1-api-reference.md`](docs/openf1-api-reference.md) — endpoint facts
- [`live-streaming-strategy.md`](docs/live-streaming-strategy.md) — live 30 s buffer policy
- [`replay-strategy.md`](docs/replay-strategy.md) — replay 60 s window policy

---

## Stack

| Layer | Choice |
| --- | --- |
| Hosting | Cloudflare Pages |
| Live proxy | Cloudflare Pages Functions + `caches.default` + Workers KV fallback |
| Frontend | Astro 4.x (hybrid output) + React 18 islands |
| Language | TypeScript strict |
| Package manager | pnpm 9 (workspaces) |
| Build | Vite (via Astro) |
| Styling | Tailwind CSS + design tokens (`apps/web/src/design/tokens.ts`) |
| Fonts | Orbitron + Orbit + JetBrains Mono (self-hosted, OFL-1.1) |
| Test | Vitest (unit) + Playwright (visual regression, Docker-pinned) |
| Catalog | GitHub Actions daily cron |

---

## Prerequisites

- Node.js ≥ 20.11
- pnpm ≥ 9.0 (the repo pins `packageManager` to pnpm 9.15.0)
- Git
- (Phase 6 only) A Cloudflare account on the Free plan. **Do not add billing info** — that prevents an accidental upgrade to the paid Workers/Pages plan, which would break the non-commercial constraint.

## Setup

```bash
pnpm install
pnpm typecheck   # all workspaces, expects 0 errors
pnpm test        # Vitest suites
pnpm lint        # ESLint + Prettier check
```

### Phase 0 pre-flight checks

```bash
pnpm check:trademark   # fails if any Formula1-* font / font/ dir exists (Plan AC-5c)
pnpm probe:openf1      # verifies OpenF1 is reachable from this machine (Plan AC-5b, local mode)
```

> The **prod CF egress** version of the OpenF1 probe is deferred to Phase 6.1 (after the Pages project is deployed). The local probe only confirms your machine can reach OpenF1 — it does not exonerate Cloudflare's egress IP range.

### Dev server

```bash
pnpm dev   # runs apps/web Astro dev server (default port 4321)
```

### Production build

```bash
pnpm build
```

Build artifacts land in `apps/web/dist/`. The build emits static HTML shells for `/`, `/live/[session_key]`, and `/replay/[session_key]`, plus the Pages Functions bundle under `apps/web/functions/`.

---

## Repository layout

```
soon-board/
├── apps/
│   └── web/                # Astro app (Phase 1+ scaffolding lives here)
│       ├── functions/      # Cloudflare Pages Functions (Phase 2)
│       ├── public/
│       │   ├── fonts/      # Self-hosted woff2 + fonts.lock.json
│       │   └── _headers    # CSP, Permissions-Policy, etc.
│       └── src/
│           ├── design/     # tokens.ts, Logo.tsx, globals.css, fonts.css, Footer.astro
│           ├── layouts/    # BaseLayout.astro
│           └── pages/      # index.astro, live/[session_key].astro, replay/[session_key].astro
├── scripts/                # Build-time tooling (TypeScript + tsx)
│   ├── src/
│   │   ├── check-trademark-files.ts
│   │   ├── probe-openf1.ts
│   │   ├── fetch-fonts.ts
│   │   ├── fetch-season-catalog.ts
│   │   └── ...
│   └── src/__tests__/
├── docs/                   # Reference research (OpenF1 API, live, replay strategies)
├── .omc/
│   ├── plans/              # Consensus plans + sub-plans
│   ├── specs/              # Deep-interview specs
│   └── prd.json            # Ralph PRD (transient)
├── .github/
│   └── workflows/
│       ├── ci.yml          # PR + main: typecheck, test, lint, build, visual regression
│       └── daily-catalog.yml  # Phase 3.2: nightly OpenF1 catalog refresh
├── THIRD_PARTY_LICENSES.md # OpenF1, julesr0y, fonts attribution + non-commercial declaration
└── README.md
```

---

## Licensing & non-commercial pledge

- **Code:** Open-source (license file pending — will land with the first public release).
- **Data:** OpenF1 (CC BY-NC-SA 4.0) — see [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).
- **Track maps:** julesr0y/f1-circuits-svg (CC BY 4.0).
- **Fonts:** Orbitron / Orbit / JetBrains Mono — SIL OFL 1.1.

**SOON BOARD will never carry advertisements, sponsorship, paid features, subscriptions, or commercial monetization.** This is a hard constraint of the OpenF1 NC license, not a temporary policy. If you fork the project with the intent to monetize, you must source an alternative non-NC data feed.

---

## Disclaimer

> SOON BOARD is an unofficial fan project. It is not affiliated with, endorsed by, sanctioned by, or otherwise associated with Formula 1 World Championship Limited, the Fédération Internationale de l'Automobile, Formula One Management, Liberty Media, or any Formula 1 team, driver, sponsor, or broadcaster. "Formula 1", "F1", and related marks are trademarks of their respective owners. SOON BOARD does not redistribute F1's proprietary typefaces, broadcast graphics, or logos.
