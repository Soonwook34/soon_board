# Third-Party Licenses

SOON BOARD is an **unofficial, non-commercial fan project**. It is not affiliated with, endorsed by, or associated with Formula 1, FIA, FOM, Liberty Media, or any F1 team.

This document lists every third-party asset bundled or fetched by SOON BOARD with its license, attribution, and usage scope. The project must satisfy **all** of these obligations simultaneously; if any conflict arises, the most restrictive license wins.

---

## Data — OpenF1 API

- **Source:** <https://openf1.org/> · <https://github.com/br-g/openf1>
- **Maintainer:** br-g (1-person community project)
- **License:** Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (**CC BY-NC-SA 4.0**) — <https://creativecommons.org/licenses/by-nc-sa/4.0/>
- **Used for:** All live and historical F1 timing, position, telemetry, race-control, weather, stints, pit, and session data
- **Obligations met by SOON BOARD:**
  - **Attribution:** Visible footer credit on every page ("Data: OpenF1 (CC BY-NC-SA 4.0)") + this file
  - **NonCommercial:** No advertising, sponsorship, paid features, subscriptions, donations-as-payment, or any monetization. Hosting is funded by free-tier CDN/compute only.
  - **ShareAlike:** Any redistribution of OpenF1-derived data must keep the same license. SOON BOARD's source code is open-source under a compatible license.
- **Implications:**
  - The project must **never** add ads, paywalls, or sponsorship integrations. If you fork SOON BOARD with the intent to monetize, you must replace OpenF1 with a commercially-licensed data source.

## Track Maps — julesr0y/f1-circuits-svg

- **Source:** <https://github.com/julesr0y/f1-circuits-svg>
- **License:** Creative Commons Attribution 4.0 International (**CC BY 4.0**) — <https://creativecommons.org/licenses/by/4.0/>
- **Used for:** Raw SVG outlines of 78 F1 circuits (1950–present). Processed at build time into polyline JSON committed under `apps/web/src/map/trackOutlines/`.
- **Obligations met:** Footer credit ("Tracks: julesr0y/f1-circuits-svg (CC BY 4.0)") + retained `source_file` / `license` metadata fields in every generated JSON.

## Fonts

### Orbitron — English + numeric display
- **License:** SIL Open Font License 1.1 (**OFL-1.1**) — <https://openfontlicense.org/>
- **Source:** Google Fonts — <https://fonts.google.com/specimen/Orbitron>
- **Used for:** Wordmark + UI body (Latin glyphs only)

### Orbit — Korean display
- **License:** SIL Open Font License 1.1 (**OFL-1.1**)
- **Source:** Google Fonts — <https://fonts.google.com/specimen/Orbit>
- **Designer:** Studio Triple
- **Used for:** Korean body text (Hangul + Hanja subset)

### JetBrains Mono — tabular numeric display
- **License:** SIL Open Font License 1.1 (**OFL-1.1**)
- **Source:** Google Fonts — <https://fonts.google.com/specimen/JetBrains+Mono>
- **Used for:** Lap times, gaps, and any column-aligned number display
- **Note:** Bundled under `apps/web/public/fonts/` after build-time fetch. Source URL + hash recorded in `apps/web/public/fonts/fonts.lock.json`.

---

## Explicitly NOT used (banned by this project)

The following assets are F1/FOM proprietary trademarks and **must never be committed to this repository or shipped with the site**:

- **Formula1 Display** typeface (Marc Rouault, licensed only to Formula One Group)
- F1 logo (block letters + dragon's tail) — Formula One Licensing B.V.
- F1, "Formula 1", "Formula One", "FIA", "FOM" wordmarks
- Team logos, sponsor logos, broadcast graphics

The `pnpm check:trademark` CI step (Plan AC-5c) scans the repository for any file matching `Formula1-*.{ttf,otf,woff,woff2}` and fails the build if found. The `.gitignore` also blocks these patterns.

Color hex values (such as `#E10600` used for the "ON" letters in the SOON BOARD wordmark) are not trademarkable and do not constitute infringement.

---

## Compatibility Matrix

| Asset           | License        | Allowed in NC project? | Notes |
|-----------------|----------------|------------------------|-------|
| OpenF1 data     | CC BY-NC-SA 4.0| ✅ (NC honored)       | Hard non-commercial floor for the entire project |
| julesr0y SVGs   | CC BY 4.0      | ✅                    | Permissive, only attribution required |
| Orbitron        | OFL-1.1        | ✅                    | Reserved name; we use unmodified |
| Orbit           | OFL-1.1        | ✅                    | Reserved name; we use unmodified |
| JetBrains Mono  | OFL-1.1        | ✅                    | Reserved name; we use unmodified |

---

## Reporting

If you believe SOON BOARD is violating one of these licenses or any other intellectual property right, please open an issue in the project repository with the offending URL or commit hash. The maintainer will respond within 7 days.
