# Research: OpenF1 API + Circuit SVG Sources for F1 Dashboard SPA

_Date: 2026-05-19 | Scope: Client-side React/Vite SPA hosted on GitHub Pages_

---

## 1. OpenF1 API — Free Tier

### CORS / Browser SPA Access

The official documentation states historical data is freely queryable with no API key, no signup, and no credit card. The homepage shows direct browser URL access as a usage pattern, and multiple community JavaScript projects (e.g., `ianleckey/openf1-js`) call the API from browser-based clients. However, **OpenF1's documentation does not explicitly document `Access-Control-Allow-Origin: *`** as a formal policy. Community SPA implementations (including a live-timing app using Canvas and a GitHub Pages-hosted React app) call `api.openf1.org` directly without a proxy, and no CORS-related issues are reported in those projects' GitHub issues. The strong inference is that the API sets `Access-Control-Allow-Origin: *` for historical endpoints.

**Recommended precaution:** Verify at build time by issuing `curl -I "https://api.openf1.org/v1/sessions?session_key=latest"` and checking for the header. If a future API change removes it, a lightweight Cloudflare Worker proxy is the fallback — no backend infrastructure needed.

**Source:** https://openf1.org/ | https://github.com/ianleckey/openf1-js

### Authentication

- **Anonymous (no auth):** All historical data from 2023 onwards. No API key, no OAuth token.
- **Authenticated (OAuth2 Bearer token):** Required only for real-time data during an active session window. Token obtained by POSTing username + password to `https://api.openf1.org/token`; expires after 1 hour.
- **Implication for a GitHub Pages SPA:** Embedding credentials client-side is insecure. For a live-session dashboard you must either (a) use a minimal backend token-refresh proxy, or (b) accept that real-time data is unavailable and poll the historical endpoints on a short delay.

**Source:** https://openf1.org/auth.html

### Rate Limits

| Tier | Requests/sec | Requests/min |
|---|---|---|
| Free (anonymous) | 3 | 30 |
| Sponsor (~€9.90/month) | 6 | 60 |

HTTP 429 is returned when exceeded. Implement exponential backoff. With 20 cars and multiple endpoints, free-tier limits are the binding constraint — see polling strategy below.

**Source:** https://openf1.org/

### Real-Time Latency vs Broadcast

- **OpenF1 real-time feed:** ~3 seconds behind live events — faster than TV.
- **Typical TV broadcast:** 30–60 seconds behind live events.
- The API classifies data as "live" from 30 minutes before session start until 30 minutes after session end. Outside that window, data is historical and always free.

**Source:** https://openf1.org/

### Key Endpoints

| Endpoint | Purpose | Notes |
|---|---|---|
| `/v1/meetings` | Grand Prix event metadata | season, circuit name, country |
| `/v1/sessions` | Practice / Quali / Sprint / Race session info | filter by `meeting_key` |
| `/v1/drivers` | Driver name, number, team, headshot URL | per session |
| `/v1/intervals` | Real-time gap to leader and gap ahead | races only, ~4 s update cadence |
| `/v1/laps` | Lap times, sector times, pit-in/out flags | per driver per lap |
| `/v1/pit` | Pit stop in/out timestamps, stationary duration | |
| `/v1/stints` | Continuous driving periods, tire compound, tire age | compound is string e.g. "SOFT" |
| `/v1/location` | Car X/Y/Z track coordinates at ~3.7 Hz | primary car-on-track endpoint |
| `/v1/position` | Numeric race position throughout session | changes only, not sampled continuously |
| `/v1/car_data` | Speed (km/h), throttle (0–100), brake (bool), gear (1–8), RPM, DRS | ~3.7 Hz |
| `/v1/weather` | Air/track temperature, humidity, pressure, rainfall | ~1-minute updates |
| `/v1/race_control` | Flags, safety car, VSC, incidents | |

**Source:** https://openf1.org/docs/

### `location` Endpoint — Coordinate System Detail

- **Fields:** `x`, `y`, `z` (three-dimensional local track coordinates)
- **Sampling rate:** ~3.7 Hz
- **Units:** Not officially documented in meters or any standard unit. The scale factor 1:150 (divide by 150) is used by practitioners to bring values into Blender scene units, implying raw values are likely in centimeters or a proprietary internal unit — do not assume meters.
- **Origin:** `(0, 0, 0)` is arbitrary per circuit; it does not correspond to a geographic reference or start/finish line.
- **X/Y range:** Varies by circuit; typical ranges are in the tens of thousands of raw units (e.g., ±20,000), with `z` spanning hundreds to low thousands for elevation.
- **Lateral resolution:** The documentation explicitly notes: "Lacks details about lateral placement — i.e. whether the car is on the left or right side of the track." Use for centerline tracing, not precise lateral car placement.
- **Z field:** Included (elevation), but not needed for 2D SVG map. Discard for viewBox mapping.

**Source:** https://openf1.org/docs/ | https://dev.to/mlbonniec/3d-race-track-modeling-with-elevation-in-blender-14da

### Data Availability by Season

| Season | Status |
|---|---|
| 2023 | Available (historical, free) |
| 2024 | Available (historical, free) |
| 2025 | Available (historical + live during sessions) |
| 2026 | Active — data is being collected race-by-race; most endpoints work; **team radio is largely absent** (F1 restriction, not API issue) |

**Source:** https://openf1.org/docs/ | search results confirming 2026 Japanese GP data present

### Pagination Model

OpenF1 has **no cursor/page-offset pagination** — endpoints return a flat JSON array of all matching records for the filter parameters given. For high-volume endpoints (`location`, `car_data`), the strategy is:

1. Filter by `session_key` + `driver_number`.
2. Additionally filter by time window using `date>=` and `date<=` parameters to chunk requests (e.g., 10-minute windows across a 90-minute race).
3. A 90-minute race at 3.7 Hz = ~19,980 samples per driver × 20 cars = ~400,000 rows total. Fetch per-driver, per-chunk, sequentially to stay within 30 req/min.
4. For track-outline derivation, **one driver, one lap** of `location` data (~3.7 Hz × ~90 s/lap = ~333 rows) is sufficient.

**Source:** https://openf1.org/docs/

---

## 2. Circuit SVG / Track Shape Data Sources

### Does OpenF1 Expose Track Geometry?

No. OpenF1 provides no endpoint for circuit outlines, boundaries, or reference geometry. Track shape must come from a separate source or be derived from telemetry.

**Source:** https://openf1.org/docs/

### Option A — bacinger/f1-circuits (GeoJSON)

- **Repo:** https://github.com/bacinger/f1-circuits
- **License:** MIT (Copyright 2019–2025 Tomislav Bacinger)
- **Coverage:** 43 circuits including all current-calendar venues; Madrid 2026 Grand Prix added.
- **Format:** Individual GeoJSON files per circuit (`circuits/gb-1950.geojson`, etc.) plus a consolidated `f1-circuits.geojson`.
- **Coordinate system:** WGS 84 (latitude/longitude), which is standard GeoJSON. Track outlines are provided as GeoJSON `LineString` or `Polygon` geometry.
- **Disclaimer:** Unofficial; not approved by Formula One Licensing B.V.
- **Pros:** Authoritative real-world GPS coordinates; works with any GeoJSON renderer; no derivation needed; 2026 calendar circuits included.
- **Cons:** Lat/lon must be projected into SVG pixel space (requires a projection step, e.g., equirectangular or Mercator on the circuit bounding box); precision varies by circuit.

### Option B — julesr0y/f1-circuits-svg (SVG)

- **Repo:** https://github.com/julesr0y/f1-circuits-svg
- **Coverage:** 78 circuits from 1950 to present; 2026-layout variants available.
- **Format:** Pre-rendered SVG files, two styles (minimal / detailed with direction + start line), four color variants each.
- **Structure:** Each SVG is SVGO-optimized; `circuits.json` metadata file at root. Minimal style = track outline only (ideal for overlaying car dots). Detailed style adds sector markers and start/finish indicator.
- **License:** Not explicitly stated in README — treat as source-available; verify before production use.
- **Pros:** Ready-to-embed SVGs, no projection or derivation step, 2026 layouts included.
- **Cons:** No explicit license; SVG coordinate space is internal/arbitrary (cannot directly correlate to OpenF1 telemetry X/Y without calibration).

### Option C — f1laps/f1-track-vectors

- **Repo:** https://github.com/f1laps/f1-track-vectors (no longer maintained; redirects to www.f1-track-vectors.com)
- **Status:** Archived/unmaintained on GitHub. Active product is commercial (Gumroad).
- **Verdict:** Not recommended for open-source SPA use.

### Option D — Derive from OpenF1 `location` Telemetry

Collect one lap of `location` data for a single driver, discard `z`, treat `(x, y)` as the centerline polyline. This produces an accurate outline that matches the circuit as driven.

**Pros:** Perfectly aligned with telemetry coordinate space (no calibration needed to place car dots); works for any circuit in OpenF1's historical database; self-updating as new venues are added.

**Cons:** Requires a pre-computation step (fetch + process + store one lap per circuit); raw polyline is noisy at 3.7 Hz and benefits from light smoothing (moving average over 5–7 points); no pit lane, runoff areas, or kerb detail.

**Recommended for this SPA:** Use **Option B (julesr0y SVGs)** for display track outlines, and **Option D (derived telemetry polyline)** for coordinate-space registration when placing live car dots. The two layers can coexist: SVG provides visual fidelity, telemetry polyline provides the affine calibration reference.

---

## 3. Coordinate Mapping Math Summary

### 2D Affine Transform: Telemetry to SVG

The OpenF1 `location` coordinate space (X_tel, Y_tel) maps to SVG pixel space (svg_x, svg_y) via:

```
svg_x = (X_tel - X_min) / (X_max - X_min) * (viewBox_width  - 2*pad) + pad
svg_y = (Y_max - Y_tel) / (Y_max - Y_min) * (viewBox_height - 2*pad) + pad
```

Key points:
- **Y-axis flip:** SVG y increases downward; F1 telemetry y increases upward (consistent with Cartesian convention). Subtract Y_tel from Y_max (not from 0) to flip.
- **Compute bounds** from one full lap of location data: X_min, X_max, Y_min, Y_max.
- **viewBox padding:** Add ~5% of the longer dimension on each side to prevent clipping at track edges.
- **Aspect ratio preservation:** Compute scale = min(W / (X_max - X_min), H / (Y_max - Y_min)) and apply uniformly to both axes; do not stretch independently.
- **Rotation/flip:** Some circuits may appear rotated relative to conventional map orientation (north-up). This is cosmetic only — apply a CSS or SVG `transform="rotate(N)"` to match the reference SVG if desired; it does not affect car-position accuracy.

### viewBox Normalization Recipe

1. Fetch one full lap of `location` for driver 1 in the target session.
2. Compute: X_min, X_max, Y_min, Y_max.
3. Pad: X_pad = (X_max - X_min) * 0.05; Y_pad = (Y_max - Y_min) * 0.05.
4. Set `viewBox="${X_min - X_pad} ${Y_min - Y_pad} ${(X_max - X_min) + 2*X_pad} ${(Y_max - Y_min) + 2*Y_pad}"` — then apply Y-flip per formula above.

---

## 4. Recommended Polling / Fetch Cadence (Live Session)

**Constraint:** 30 req/min free tier; 20 cars; multiple endpoints.

**Strategy — tiered polling by endpoint volatility:**

| Endpoint | Suggested interval | Rationale |
|---|---|---|
| `location` (all 20 drivers) | 1 request per driver per 5 s, staggered | 3.7 Hz source; UI refresh at 1 Hz is sufficient; 20 req/100 s = 12 req/min |
| `car_data` (speed/throttle/etc.) | Same cadence as `location`, batched by driver | Same source rate |
| `intervals` | Every 5 s, single request (all drivers in one call) | ~4 s native update rate; 1 req/5 s = 12 req/min |
| `position` (race order) | Every 10 s | Changes infrequently; 1 req/10 s = 6 req/min |
| `laps` | Every 30 s or on lap-number change | Only meaningful at lap completion |
| `stints` / `pit` | Every 60 s | Pit stops are rare events |
| `weather` | Every 60 s | ~1-minute source cadence |
| `race_control` | Every 10 s | Safety car / flag changes are safety-critical for UX |

**Total budget estimate (active race):** ~14–18 req/min, leaving 12–16 req/min headroom on the free 30 req/min limit.

**Implementation notes:**
- Fetch all 20 drivers' `location` in a single request filtered by `session_key` and time window (`date>=now-5s`), not 20 separate requests.
- Use a single shared fetch queue with a token-bucket rate limiter (3 req/s max).
- On HTTP 429, back off exponentially starting at 2 s.
- Store the last-received position for each car and interpolate smoothly in the animation loop (requestAnimationFrame) between poll ticks — decouples visual smoothness from fetch rate.

---

## Sources

- OpenF1 Homepage & Docs: https://openf1.org/ | https://openf1.org/docs/
- OpenF1 Auth Guide: https://openf1.org/auth.html
- OpenF1 GitHub: https://github.com/br-g/openf1
- bacinger/f1-circuits (GeoJSON): https://github.com/bacinger/f1-circuits
- julesr0y/f1-circuits-svg (SVG): https://github.com/julesr0y/f1-circuits-svg
- f1laps/f1-track-vectors (archived): https://github.com/f1laps/f1-track-vectors
- OpenF1 JS SDK example: https://github.com/ianleckey/openf1-js
- 3D track from telemetry (coordinate scale reference): https://dev.to/mlbonniec/3d-race-track-modeling-with-elevation-in-blender-14da
- Real-time F1 app (Canvas + telemetry approach): https://dev.to/waruna/i-built-a-real-time-f1-race-replay-and-live-timing-app-heres-how-4ph
