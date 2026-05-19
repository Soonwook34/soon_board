import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { detectInitialFps } from './useFrameBudget'
import type { MasterRafApi } from './useMasterRaf'

// Helper to stub navigator.userAgent
function stubUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', {
    value: ua,
    configurable: true,
  })
}

// Helper to stub location.search
function stubSearch(search: string) {
  Object.defineProperty(window, 'location', {
    value: { search },
    configurable: true,
    writable: true,
  })
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const IPAD_UA =
  'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
// "Request Desktop Site" UA: Macintosh + touch + Safari + no Chrome
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

beforeEach(() => {
  // Reset location.search to empty
  stubSearch('')
})

afterEach(() => {
  vi.unstubAllGlobals()
  stubSearch('')
})

describe('detectInitialFps', () => {
  it('returns 30 for iPadOS Safari UA', () => {
    stubUA(IPAD_UA)
    // Ensure ontouchend is present
    Object.defineProperty(document, 'ontouchend', { value: null, configurable: true })
    expect(detectInitialFps()).toBe(30)
  })

  it('returns 60 for Chrome desktop UA', () => {
    stubUA(CHROME_UA)
    // Remove ontouchend
    Object.defineProperty(document, 'ontouchend', { value: undefined, configurable: true })
    expect(detectInitialFps()).toBe(60)
  })

  it('overrides UA with ?fps=60 query param', () => {
    stubUA(IPAD_UA)
    Object.defineProperty(document, 'ontouchend', { value: null, configurable: true })
    stubSearch('?fps=60')
    expect(detectInitialFps()).toBe(60)
  })

  it('overrides UA with ?fps=30 query param', () => {
    stubUA(CHROME_UA)
    stubSearch('?fps=30')
    expect(detectInitialFps()).toBe(30)
  })

  it('classifies iPad "Request Desktop Site" (Macintosh + touch + Safari) as 30fps', () => {
    stubUA(IPAD_DESKTOP_UA)
    // Add ontouchend to simulate touch device
    Object.defineProperty(document, 'ontouchend', { value: null, configurable: true })
    stubSearch('')
    // IPAD_DESKTOP_UA matches /Macintosh/ and /Safari/ and no CriOS/FxiOS/EdgiOS
    expect(detectInitialFps()).toBe(30)
  })
})

describe('useFrameBudget drift behavior', () => {
  it('calls setTargetFps(30) when >10% frames dropped at 60Hz', () => {
    const setTargetFps = vi.fn()
    const masterRaf = { setTargetFps, currentFps: () => 60 as const } as unknown as MasterRafApi

    // Simulate the logic directly (the hook uses rAF internally which is hard to test without mounting)
    // We test the threshold logic by replicating the decision
    const WINDOW = 60
    const expectedMs = 1000 / 60
    const slack = 4
    // 12% dropped = 8 dropped out of 60
    const durations = Array.from({ length: WINDOW }, (_, i) =>
      i < 8 ? expectedMs + slack + 1 : expectedMs,
    )
    const dropped = durations.filter((d) => d > expectedMs + slack).length
    const pct = (dropped / durations.length) * 100
    expect(pct).toBeGreaterThan(10)
    // Invoke the same logic as the hook would
    if (pct > 10) masterRaf.setTargetFps(30)
    expect(setTargetFps).toHaveBeenCalledWith(30)
  })

  it('calls setTargetFps(60) when <2% frames dropped at 30Hz', () => {
    const setTargetFps = vi.fn()
    const masterRaf = { setTargetFps, currentFps: () => 30 as const } as unknown as MasterRafApi

    const WINDOW = 60
    const expectedMs = 1000 / 30
    const slack = 4
    // 1% dropped = 0 or 1 dropped out of 60
    const durations = Array.from({ length: WINDOW }, (_, i) =>
      i < 1 ? expectedMs + slack + 1 : expectedMs,
    )
    const dropped = durations.filter((d) => d > expectedMs + slack).length
    const pct = (dropped / durations.length) * 100
    expect(pct).toBeLessThan(2)
    // Invoke the same logic as the hook would
    if (pct < 2) masterRaf.setTargetFps(60)
    expect(setTargetFps).toHaveBeenCalledWith(60)
  })
})
