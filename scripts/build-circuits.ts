import { readFile, writeFile, mkdir, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// ── Types ────────────────────────────────────────────────────────────────────

type Coord = [number, number] // [lon, lat]

interface GeoJsonFeature {
  type: 'Feature'
  geometry: {
    type: string
    coordinates: unknown
  }
  properties?: Record<string, unknown>
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

interface CircuitMeta {
  viewBox: string
  centroid: [number, number]
  bbox: { minLon: number; minLat: number; maxLon: number; maxLat: number }
  source: 'bacinger'
  license: 'MIT'
}

export interface BuildResult {
  svg: string
  meta: CircuitMeta
}

// ── Pure projection helpers ──────────────────────────────────────────────────

/** Extract usable coordinate list from a GeoJSON feature geometry. */
export function extractCoords(geometry: GeoJsonFeature['geometry']): Coord[] | null {
  if (geometry.type === 'LineString') {
    return geometry.coordinates as Coord[]
  }
  if (geometry.type === 'MultiLineString') {
    const lines = geometry.coordinates as Coord[][]
    // Take the longest sub-line by point count
    let longest: Coord[] = []
    for (const line of lines) {
      if (line.length > longest.length) longest = line
    }
    return longest.length > 0 ? longest : null
  }
  if (geometry.type === 'Polygon') {
    // Outer ring
    const rings = geometry.coordinates as Coord[][]
    return rings[0] ?? null
  }
  return null
}

const W = 1000
const H = 1000
const PAD_PCT = 0.05

/** Project WGS84 coords to SVG space. Returns SVG path d string + meta. */
export function projectToSvg(coords: Coord[]): BuildResult {
  // Centroid lat for equirectangular lon-scaling
  const latSum = coords.reduce((s, c) => s + c[1], 0)
  const centroidLat = latSum / coords.length
  const centroidLon = coords.reduce((s, c) => s + c[0], 0) / coords.length
  const cosLat = Math.cos((centroidLat * Math.PI) / 180)

  // Scale lon by cos(centroid_lat)
  const scaled = coords.map(([lon, lat]): [number, number] => [lon * cosLat, lat])

  // Bounding box of scaled coords
  let minX = Infinity,
    maxX = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity
  for (const [x, lat] of scaled) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }

  const rangeX = maxX - minX || 1
  const rangeY = maxLat - minLat || 1

  // Preserve aspect ratio: uniform scale
  const pad = W * PAD_PCT
  const drawW = W - 2 * pad
  const drawH = H - 2 * pad
  const scale = Math.min(drawW / rangeX, drawH / rangeY)

  // Centered offset so the circuit sits in the middle of the viewbox
  const renderedW = rangeX * scale
  const renderedH = rangeY * scale
  const offsetX = pad + (drawW - renderedW) / 2
  const offsetY = pad + (drawH - renderedH) / 2

  // Use raw lon for X mapping (Y-flip)
  const ptsFixed = coords.map(([lon, lat], i) => {
    const sx = (lon * cosLat - minX) * scale + offsetX
    const sy = (maxLat - lat) * scale + offsetY
    return `${i === 0 ? 'M' : 'L'} ${sx.toFixed(2)} ${sy.toFixed(2)}`
  })

  const d = ptsFixed.join(' ')
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`,
    `  <path d="${d}" fill="none" stroke="currentColor" stroke-width="2"/>`,
    `</svg>`,
  ].join('\n')

  // Unscaled bbox (original WGS84)
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  const meta: CircuitMeta = {
    viewBox: `0 0 ${W} ${H}`,
    centroid: [centroidLon, centroidLat],
    bbox: {
      minLon: Math.min(...lons),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lons),
      maxLat: Math.max(...lats),
    },
    source: 'bacinger',
    license: 'MIT',
  }

  return { svg, meta }
}

// ── License check ────────────────────────────────────────────────────────────

export async function assertMitLicense(vendorDir: string): Promise<void> {
  // Try LICENSE then LICENSE.md
  const candidates = [
    path.join(vendorDir, 'LICENSE'),
    path.join(vendorDir, 'LICENSE.md'),
    path.join(vendorDir, 'license'),
  ]
  let licenseText: string | null = null
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      licenseText = await readFile(candidate, 'utf8')
      break
    }
  }
  if (!licenseText) {
    throw new Error(
      `[build-circuits] LICENSE not found in ${vendorDir}. Aborting — cannot verify MIT license.`,
    )
  }
  if (!licenseText.toLowerCase().includes('mit')) {
    throw new Error(
      `[build-circuits] LICENSE in ${vendorDir} does not contain 'MIT'. Aborting — license check failed.`,
    )
  }
}

// ── Core build function ──────────────────────────────────────────────────────

export interface BuildOptions {
  vendorDir: string
  outDir: string
  /** If provided, intercepts file writes; keys are relative filenames */
  collector?: Map<string, string>
}

export async function buildCircuits(options: BuildOptions): Promise<void> {
  const { vendorDir, outDir, collector } = options

  // 1. License check
  await assertMitLicense(vendorDir)
  console.log('[build-circuits] License check OK (MIT confirmed)')

  // 2. Find GeoJSON files
  const circuitsDir = path.join(vendorDir, 'circuits')
  const allFiles = await readdir(circuitsDir).catch(() => [] as string[])
  const geojsonFiles = allFiles
    .filter((f) => f.endsWith('.geojson'))
    .map((f) => path.join(circuitsDir, f))
    .sort()

  if (geojsonFiles.length === 0) {
    throw new Error(`[build-circuits] No .geojson files found in ${circuitsDir}`)
  }

  // 3. Process each file
  const circuitsJson: Record<string, CircuitMeta> = {}
  let emitted = 0
  const skipped: Array<{ key: string; reason: string }> = []

  if (!collector) {
    await mkdir(outDir, { recursive: true })
  }

  for (const filePath of geojsonFiles) {
    const key = path.basename(filePath, '.geojson')
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (e) {
      skipped.push({ key, reason: `read error: ${e}` })
      continue
    }

    let fc: GeoJsonFeatureCollection
    try {
      fc = JSON.parse(raw) as GeoJsonFeatureCollection
    } catch {
      skipped.push({ key, reason: 'JSON parse error' })
      continue
    }

    // Find first usable feature
    let coords: Coord[] | null = null
    let geomType = 'unknown'
    for (const feature of fc.features) {
      if (!feature.geometry) continue
      geomType = feature.geometry.type
      coords = extractCoords(feature.geometry)
      if (coords && coords.length >= 3) break
    }

    if (!coords || coords.length < 3) {
      const reason = `no usable geometry (last seen: ${geomType})`
      console.warn(`[build-circuits] SKIP ${key}: ${reason}`)
      skipped.push({ key, reason })
      continue
    }

    const { svg, meta } = projectToSvg(coords)

    // Write SVG
    const svgFilename = `${key}.svg`
    if (collector) {
      collector.set(svgFilename, svg)
    } else {
      await writeFile(path.join(outDir, svgFilename), svg, 'utf8')
    }

    circuitsJson[key] = meta
    emitted++
  }

  // 4. Write circuits.json
  const jsonContent = JSON.stringify(circuitsJson, null, 2)
  if (collector) {
    collector.set('circuits.json', jsonContent)
  } else {
    await writeFile(path.join(outDir, 'circuits.json'), jsonContent, 'utf8')
  }

  // 5. Summary
  console.log(`[build-circuits] Emitted: ${emitted} circuits`)
  if (skipped.length > 0) {
    console.log(`[build-circuits] Skipped: ${skipped.length}`)
    for (const s of skipped) {
      console.log(`  - ${s.key}: ${s.reason}`)
    }
  } else {
    console.log('[build-circuits] Skipped: 0')
  }
}

// ── CLI entry point ──────────────────────────────────────────────────────────

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('build-circuits.ts') || process.argv[1].endsWith('build-circuits.js'))

if (isMain) {
  const root = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..')
  buildCircuits({
    vendorDir: path.join(root, 'vendor', 'bacinger-circuits'),
    outDir: path.join(root, 'src', 'assets', 'circuits'),
  }).catch(err => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
