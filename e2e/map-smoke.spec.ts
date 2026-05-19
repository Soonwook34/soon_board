import { test } from '@playwright/test'

// Phase 9 will wire the full App composition including real session data.
// This test is intentionally skipped until then.
test.skip('map smoke — renders CircuitMap with live session data', async () => {
  // TODO(Phase 9): Enable when App composition is wired.
  // The test should:
  //   1. Navigate to the app
  //   2. Wait for a session to load
  //   3. Assert that the circuit SVG is present
  //   4. Assert that at least one driver marker is visible
  //   5. Assert that the substrate path has stroke="#3A3A45"
  console.log('map-smoke: skipped until Phase 9 App composition lands')
})
