import { test } from '@playwright/test'

// Skipped until Phase 9 wires PlaybackBar into App.tsx.
// Test body: open dev server, select 2024 Monaco Race, toggle 2× → assert global clock advances at 2× wall-time.
test.skip('playback smoke: 2024 Monaco Race at 2× speed', async () => {
  // Phase 9 implementation:
  // 1. Navigate to dev server (e.g. http://localhost:5173)
  // 2. Click "Calendar" button in PlaybackBar
  // 3. Switch to 2024 tab
  // 4. Click "Monaco Grand Prix" meeting card
  // 5. Click "Race" session button
  // 6. Click "2×" speed pill in SpeedToggle
  // 7. Record clock value t0
  // 8. Wait 1 real second
  // 9. Record clock value t1
  // 10. Assert (t1 - t0) is approximately 2000ms ± 200ms (2× wall-time)
})
