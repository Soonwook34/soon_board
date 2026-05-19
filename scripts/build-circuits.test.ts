import { describe, it, expect } from 'vitest'
import path from 'path'
import { readFile } from 'fs/promises'
import { extractCoords, projectToSvg, assertMitLicense, buildCircuits } from './build-circuits'

const FIXTURES = path.resolve(import.meta.dirname, '../tests/fixtures')

// ── extractCoords ────────────────────────────────────────────────────────────

describe('extractCoords', () => {
  it('returns coords for LineString', () => {
    const coords = extractCoords({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
    })
    expect(coords).toHaveLength(3)
    expect(coords![0]).toEqual([0, 0])
  })

  it('picks longest sub-line for MultiLineString', () => {
    const coords = extractCoords({
      type: 'MultiLineString',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [12, 12],
          [13, 10],
        ],
      ],
    })
    // Longest sub-line has 5 points
    expect(coords).toHaveLength(5)
    expect(coords![0]).toEqual([10, 10])
  })

  it('returns outer ring for Polygon', () => {
    const coords = extractCoords({
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    })
    expect(coords).toHaveLength(5)
  })

  it('returns null for unsupported geometry', () => {
    const coords = extractCoords({ type: 'Point', coordinates: [0, 0] })
    expect(coords).toBeNull()
  })
})

// ── projectToSvg ─────────────────────────────────────────────────────────────

describe('projectToSvg', () => {
  it('produces a valid SVG string with a path element', () => {
    const coords: [number, number][] = [
      [0.0, 0.0],
      [0.1, 0.0],
      [0.1, 0.1],
      [0.05, 0.15],
      [0.0, 0.1],
      [0.0, 0.0],
    ]
    const { svg, meta } = projectToSvg(coords)
    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 1000 1000"')
    expect(svg).toContain('<path')
    expect(svg).toContain('fill="none"')
    expect(svg).toContain('stroke="currentColor"')
    // Should have at least 6 path commands (M + 5 L)
    const commands = (svg.match(/[ML] /g) ?? []).length
    expect(commands).toBeGreaterThanOrEqual(6)
    // Meta fields
    expect(meta.viewBox).toBe('0 0 1000 1000')
    expect(meta.source).toBe('bacinger')
    expect(meta.license).toBe('MIT')
    expect(meta.centroid).toHaveLength(2)
    expect(meta.bbox.minLon).toBeLessThanOrEqual(meta.bbox.maxLon)
    expect(meta.bbox.minLat).toBeLessThanOrEqual(meta.bbox.maxLat)
  })

  it('SVG path points stay within viewBox bounds', () => {
    const coords: [number, number][] = [
      [0.0, 0.0],
      [0.1, 0.0],
      [0.1, 0.1],
      [0.05, 0.15],
      [0.0, 0.1],
      [0.0, 0.0],
    ]
    const { svg } = projectToSvg(coords)
    // Extract all numeric pairs from the path
    const nums = [...svg.matchAll(/([ML]) ([\d.]+) ([\d.]+)/g)].map(m => ({
      x: parseFloat(m[2]),
      y: parseFloat(m[3]),
    }))
    for (const { x, y } of nums) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1000)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1000)
    }
  })
})

// ── assertMitLicense ─────────────────────────────────────────────────────────

describe('assertMitLicense', () => {
  it('passes for the real bacinger vendor dir', async () => {
    const vendorDir = path.resolve(import.meta.dirname, '../vendor/bacinger-circuits')
    await expect(assertMitLicense(vendorDir)).resolves.toBeUndefined()
  })

  it('throws when LICENSE is missing', async () => {
    // Use a dir that has no LICENSE file
    await expect(assertMitLicense('/tmp')).rejects.toThrow(/LICENSE not found|MIT/)
  })
})

// ── buildCircuits with fixture ────────────────────────────────────────────────

describe('buildCircuits fixture test', () => {
  it('emits SVG and meta for LineString fixture', async () => {
    const collector = new Map<string, string>()
    // Build with a tmp vendor dir that has the MIT license from the real bacinger
    // Test the pure functions directly with the fixture file content
    const raw = await readFile(path.join(FIXTURES, 'circuit-fixture.geojson'), 'utf8')
    const fc = JSON.parse(raw)
    const feature = fc.features[0]
    const coords = extractCoords(feature.geometry)
    expect(coords).not.toBeNull()
    expect(coords!.length).toBe(6)
    const { svg, meta } = projectToSvg(coords!)
    expect(svg).toContain('<path')
    expect(meta.source).toBe('bacinger')
    collector.set('test-fixture.svg', svg)
    expect(collector.get('test-fixture.svg')).toBeDefined()
    // Snapshot: verify key structure stays stable
    expect(svg).toMatchSnapshot()
  })

  it('picks longest sub-line for MultiLineString fixture', async () => {
    const raw = await readFile(path.join(FIXTURES, 'multiline-fixture.geojson'), 'utf8')
    const fc = JSON.parse(raw)
    const feature = fc.features[0]
    const coords = extractCoords(feature.geometry)
    // Longest sub-line has 5 points (second line)
    expect(coords).toHaveLength(5)
    expect(coords![0]).toEqual([1.0, 1.0])
    const { svg } = projectToSvg(coords!)
    expect(svg).toContain('<path')
  })

  it('full buildCircuits run emits circuits.json with correct structure', async () => {
    const collector = new Map<string, string>()
    const vendorDir = path.resolve(import.meta.dirname, '../vendor/bacinger-circuits')
    const outDir = '/tmp/soon-board-test-circuits'
    await buildCircuits({ vendorDir, outDir, collector })
    expect(collector.has('circuits.json')).toBe(true)
    const circuitsJson = JSON.parse(collector.get('circuits.json')!)
    const keys = Object.keys(circuitsJson)
    expect(keys.length).toBeGreaterThanOrEqual(24)
    // Check one entry structure
    const first = circuitsJson[keys[0]]
    expect(first).toHaveProperty('viewBox', '0 0 1000 1000')
    expect(first).toHaveProperty('source', 'bacinger')
    expect(first).toHaveProperty('license', 'MIT')
    expect(first).toHaveProperty('centroid')
    expect(first).toHaveProperty('bbox')
  })
})
