import { useEffect, useRef, useState } from 'react'
import { useMasterRaf } from '../../hooks/useMasterRaf'
import { useFrameBudget } from '../../hooks/useFrameBudget'
import { useDriverMarker } from '../../hooks/useDriverMarker'
import { Marker } from './Marker'
import { DecorationLayer } from './DecorationLayer'
import {
  computeBbox,
  paddedViewBoxForAspect,
  smoothPolyline,
  catmullRomToPath,
} from '../../utils/fitting'
import {
  getTrackByCircuitId,
  resolveCircuitId,
  TRACK_VIEW_BOX,
} from '../../assets/tracks/registry'
import type { Session, Driver } from '../../api/types'

interface Props {
  session: Session
  drivers: Driver[]
  substrateSamples: { t: number; x: number; y: number }[]
  /** OpenF1 `circuit_short_name` from the active meeting — drives pre-shipped
   * outline lookup. Undefined falls back to substrate-driven rendering. */
  circuitShortName?: string
}

// All visual sizes (track stroke, marker radius, label font) are expressed as
// fractions of the viewBox's larger dimension. The viewBox is in raw OpenF1
// coordinates (~thousands of units wide), so fixed pixel values would be
// invisible — proportional sizing keeps the look consistent regardless of
// circuit scale or render container size.
const TRACK_STROKE_PCT = 0.008
const MARKER_RADIUS_PCT = 0.015
const MARKER_STROKE_PCT = 0.003
const MARKER_FONT_PCT = 0.02
// Substrate path-close threshold: if first/last sample are within this
// fraction of the bbox width, append the first point to close the loop
// smoothly (Catmull-Rom wraparound). Otherwise leave the path open.
const CLOSE_THRESHOLD_PCT = 0.02

function DriverMarker({
  driver,
  radius,
  strokeWidth,
  fontSize,
}: {
  driver: Driver
  radius: number
  strokeWidth: number
  fontSize: number
}) {
  const ref = useDriverMarker(driver.driver_number)
  return (
    <Marker
      ref={ref}
      driver={driver}
      radius={radius}
      strokeWidth={strokeWidth}
      fontSize={fontSize}
    />
  )
}

export function CircuitMap({ session, drivers, substrateSamples, circuitShortName }: Props) {
  const masterRaf = useMasterRaf()
  useFrameBudget(masterRaf)

  // Container size feeds the viewBox aspect calculation so the SVG can fill
  // its parent in BOTH axes without letterboxing. ResizeObserver may not be
  // present in older jsdom — guard so tests don't break. With size {0,0}
  // (e.g. before first layout), aspect=null and viewBox uses symmetric pad.
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setContainerSize({ w: rect.width, h: rect.height })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Pre-shipped outline takes priority when the circuit is in the registry;
  // substrate-driven fallback only kicks in for circuits without a baked path.
  const circuitId = resolveCircuitId(circuitShortName)
  const preshipped = circuitId ? getTrackByCircuitId(circuitId) : null

  const containerAspect =
    containerSize.w > 0 && containerSize.h > 0 ? containerSize.w / containerSize.h : null

  const points = substrateSamples.map((s): [number, number] => [s.x, s.y])
  const bbox = computeBbox(points)
  const fallbackVb = paddedViewBoxForAspect(bbox, containerAspect)

  // Close the substrate polyline back to its first sample when the gap is
  // small enough to look like a continuous lap. Otherwise leave it open so
  // mid-substrate replays don't draw a misleading chord. Catmull-Rom spans
  // last→first naturally once we append the first point to the input.
  const bboxWidth = bbox.maxX - bbox.minX
  const closeDist =
    points.length >= 2
      ? Math.hypot(
          points[points.length - 1][0] - points[0][0],
          points[points.length - 1][1] - points[0][1],
        )
      : 0
  const closedPoints: [number, number][] =
    points.length >= 3 && closeDist < bboxWidth * CLOSE_THRESHOLD_PCT
      ? [...points, points[0]]
      : points

  const fallbackPathD = catmullRomToPath(smoothPolyline(closedPoints))

  // Polyline perimeter in scene units (only used in the fallback render path).
  // For pre-shipped circuits the registry supplies a real lengthM that goes
  // straight to the interpolator's snap-on-teleport threshold.
  let substrateTrackLength = 0
  for (let i = 1; i < closedPoints.length; i++) {
    const dx = closedPoints[i][0] - closedPoints[i - 1][0]
    const dy = closedPoints[i][1] - closedPoints[i - 1][1]
    substrateTrackLength += Math.hypot(dx, dy)
  }

  const usingPreshipped = preshipped !== null
  const trackLength = usingPreshipped ? preshipped.lengthM : substrateTrackLength
  const viewBox = usingPreshipped ? TRACK_VIEW_BOX : fallbackVb.viewBox
  const pathD = usingPreshipped ? preshipped.pathD : fallbackPathD

  useEffect(() => {
    masterRaf.setTrackLength(trackLength)
  }, [masterRaf, trackLength])

  useEffect(() => {
    masterRaf.setTransform(usingPreshipped ? preshipped.transform : null)
    return () => masterRaf.setTransform(null)
  }, [masterRaf, usingPreshipped, preshipped])

  // Visual sizing: the pre-shipped viewBox is fixed at 1000×600; the fallback
  // viewBox scales with substrate bbox. Take the larger dimension either way.
  const [, , vbW, vbH] = viewBox.split(' ').map(Number)
  const scale = Math.max(vbW, vbH) || 1
  const trackStroke = scale * TRACK_STROKE_PCT
  const markerRadius = scale * MARKER_RADIUS_PCT
  const markerStroke = scale * MARKER_STROKE_PCT
  const markerFont = scale * MARKER_FONT_PCT

  return (
    <div ref={containerRef} className="h-full w-full">
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%' }}
      >
        {pathD && (
          <path d={pathD} fill="none" stroke="#7A8290" strokeWidth={trackStroke} />
        )}
        {!usingPreshipped && (
          <DecorationLayer session={session} substrateSamples={substrateSamples} />
        )}
        {drivers.map((driver) => (
          <DriverMarker
            key={driver.driver_number}
            driver={driver}
            radius={markerRadius}
            strokeWidth={markerStroke}
            fontSize={markerFont}
          />
        ))}
      </svg>
    </div>
  )
}
