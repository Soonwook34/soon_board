# Marker Rendering Pipeline

How live driver positions become smooth, continuous marker motion on the circuit map.

## Goal

Keep markers in continuous linear interpolation between buffered samples — never
in the "extrapolate → freeze → snap-jump" pattern that appears when the render
target runs ahead of the freshest sample.

## Data flow

```
OpenF1 /location ──► Poller ──► carsPositionStore.apply ──► byNumber Map
                                                                │
                                                                ▼
                                                useDriverMarker (per driver)
                                                                │
                                                                ▼
                                                useMasterRaf (singleton, 60fps)
                                                                │
                                                                ▼
                                                interpolator.sampleAt
                                                                │
                                                                ▼
                                                ref.setAttribute('transform', …)
```

### 1. Polling — [src/scheduler/poller.ts](../src/scheduler/poller.ts)

`Poller` fires `/location` every 6 s. Each batch contains the recent native
sub-samples (~3.7 Hz on OpenF1's side). The handler hands the batch to
`carsPositionStore.apply(rows, globalClockNow(...))`.

### 2. Hot store — [src/store/carsPositionStore.ts](../src/store/carsPositionStore.ts)

Separate from `telemetryStore` so the 60 Hz RAF reader can never re-render the
leaderboard or info panels.

`apply(rows, nowMs)` performs **latest-anchor rescale**:

- group rows per driver, sort by server timestamp ascending
- anchor the latest sub-sample at `nowMs` (the render clock at apply time —
  `globalClockNow(useTimelineStore.getState())`)
- place older sub-samples at `t = nowMs − (latestServer − serverT)`

Consecutive polls then compose into a contiguous client-clock timeline even
when poll arrival jitters by seconds and OpenF1's emit/receive pipeline adds
variable latency.

Each driver entry also tracks `lastUpdate` (for activity windows) and a heading
derived from the last two samples. Sub-samples older than
`SAMPLE_RETENTION_MS = 30_000` are trimmed.

### 3. Per-driver registration — [src/hooks/useDriverMarker.ts](../src/hooks/useDriverMarker.ts)

Each `<DriverMarker>` registers a `getSamples: () => CarSample[]` callback with
the master RAF. The callback reads the store via `getState()` (no subscription
→ no React re-render).

### 4. Master RAF — [src/hooks/useMasterRaf.ts](../src/hooks/useMasterRaf.ts)

Singleton requestAnimationFrame loop at the user's target FPS (30 or 60). On
each frame:

```ts
const t = globalClockNow(useTimelineStore.getState()) - RENDER_BUFFER_MS
for (const reg of registrations.values()) {
  const samples = reg.getSamples()
  const pos = sampleAt(samples, t, { mode: 'lerp', snapDivisor: 30, trackLength, extrapCapMs: 2000 })
  if (pos !== null) reg.ref.current?.setAttribute('transform', `translate(${pos.x},${pos.y})`)
}
```

The render target sits `RENDER_BUFFER_MS = 20_000` ms behind the global clock
(ported from old_project's validated value; covers ~3 missed polls at the 6 s
cadence). Because `sample.t` lives in the same domain as `globalClockNow`, the
target lands inside the buffered bracket and the interpolator stays in `lerp`.

Direct `setAttribute` on the SVG `<g>` ref bypasses React reconciliation, which
matters at 20 drivers × 60 fps.

### 5. Interpolation — [src/scheduler/interpolator.ts](../src/scheduler/interpolator.ts)

`sampleAt(samples, t, opts)` walks the sample buffer:

- `t ≤ first.t` → clamp to first sample
- `t ≥ last.t` → if `extrapCapMs > 0` and the last segment is short, extrapolate
  along the last bracket vector for up to `extrapCapMs = 2000` ms; otherwise
  freeze at last
- otherwise → binary-search the bracket `[s1, s2]` containing `t`, then `lerp`
- snap-on-teleport: if the bracket's segment length exceeds
  `trackLength / snapDivisor` (`snapDivisor = 30`, ≈ lap wraparound or replay
  seek), jump to the later sample instead of rubber-banding through the chord

The `trackLength` is published by `CircuitMap` once the substrate polyline
exists.

## Tuning constants

| Constant | Value | Purpose | Source |
|---|---|---|---|
| `RENDER_BUFFER_MS` | 20_000 ms | render target lag — keeps target in the lerp bracket | [useMasterRaf.ts:19](../src/hooks/useMasterRaf.ts#L19); matches `old_project/.../MarkerLayer.tsx` |
| `SAMPLE_RETENTION_MS` | 30_000 ms | sub-sample buffer depth | [carsPositionStore.ts](../src/store/carsPositionStore.ts) |
| `CARS_ACTIVE_WINDOW_MS` | 30_000 ms | how long since `lastUpdate` before a car is "inactive" | [carsPositionStore.ts](../src/store/carsPositionStore.ts) |
| `snapDivisor` | 30 | `trackLength / 30` is the teleport threshold (units: same as `trackLength` — meters when pre-shipped circuit, scene units when substrate fallback; comparison is empirically sized to catch lap-wraparound chord lengths in either domain) | [useMasterRaf.ts](../src/hooks/useMasterRaf.ts); applied per-frame |
| `extrapCapMs` | 2_000 ms | how far past `last.t` we extrapolate before freezing | [useMasterRaf.ts](../src/hooks/useMasterRaf.ts) |

## Clock-domain contract

- `globalClockNow(state)` in **live** mode returns
  `performance.timeOrigin + performance.now() + serverTimeOffsetMs` — i.e.,
  server-wall-ms minus the ~3 s offset the client tries to absorb.
- In **playback** mode it returns session-time advancing at `playbackRate × wall`.
- `carsPositionStore.apply` is called with `nowMs = globalClockNow(...)`, so
  `sample.t` is always in the same domain as the render target.
- Switching between live and playback re-anchors `globalClockNow` via the
  timeline store; the carsPositionStore is reset on `session_key` change in
  [src/store/sessionStore.ts](../src/store/sessionStore.ts).

## Why these decisions

- **Separate hot store** (rather than reusing `telemetryStore`): location is the
  only feed that updates every poll for every driver and would otherwise force
  the leaderboard's recompute path to share change-detection with the 60 Hz
  render path.
- **Latest-anchor rescale** (rather than using raw server timestamps): a poll
  arriving late by N seconds otherwise pushes `last.t` N seconds into the past
  relative to `globalClockNow`, eating into the buffer. Anchoring `last` at
  `nowMs` removes the variable pipeline latency from the buffer's job.
- **20 s buffer** (rather than 2× or 3× the poll interval): old_project ran for
  a full F1 season at this value with no visible stutter even on poor networks;
  smaller buffers reintroduced the freeze-then-jump pattern in this codebase.
- **`setAttribute` on ref** (rather than React state-driven `transform`): 1200
  state updates per second at 20 drivers × 60 fps would dominate the render
  budget. Direct DOM writes skip reconciliation.

## Failure modes and what catches them

| Symptom | Likely cause | Catcher |
|---|---|---|
| Marker frozen for ~2 s then jumps | render target ran past `last.t` for > `extrapCapMs` | bump `RENDER_BUFFER_MS` or check poll cadence |
| Marker rubber-bands through track interior | lap wrap-around chord with no snap | `snapDivisor` rule — verify `trackLength` is published |
| Marker disappears on session switch | stale entries left behind | `useCarsPositionStore.reset()` wired in `sessionStore.setSession` |
| Marker drifts off-track over time | clock drift between client and server | server time re-sync at top of session via `OpenF1Client.onServerDate` |
