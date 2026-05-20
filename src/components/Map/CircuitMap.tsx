import { useMasterRaf } from '../../hooks/useMasterRaf'
import { useFrameBudget } from '../../hooks/useFrameBudget'
import { useDriverMarker } from '../../hooks/useDriverMarker'
import { Marker } from './Marker'
import { DecorationLayer } from './DecorationLayer'
import { computeBbox, paddedViewBox, smoothPolyline, catmullRomToPath } from '../../utils/fitting'
import type { Session, Driver } from '../../api/types'

interface Props {
  session: Session
  drivers: Driver[]
  substrateSamples: { t: number; x: number; y: number }[]
}

// All visual sizes (track stroke, marker radius, label font) are expressed as
// fractions of the viewBox's larger dimension. The viewBox is in raw OpenF1
// coordinates (~thousands of units wide), so fixed pixel values would be
// invisible — proportional sizing keeps the look consistent regardless of
// circuit scale or render container size.
const TRACK_STROKE_PCT = 0.005
const MARKER_RADIUS_PCT = 0.022
const MARKER_STROKE_PCT = 0.003
const MARKER_FONT_PCT = 0.02

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

export function CircuitMap({ session, drivers, substrateSamples }: Props) {
  const masterRaf = useMasterRaf()
  useFrameBudget(masterRaf)

  const points = substrateSamples.map((s): [number, number] => [s.x, s.y])
  const bbox = computeBbox(points)
  const vb = paddedViewBox(bbox)
  const pathD = catmullRomToPath(smoothPolyline(points))

  const scale = Math.max(vb.width, vb.height) || 1
  const trackStroke = scale * TRACK_STROKE_PCT
  const markerRadius = scale * MARKER_RADIUS_PCT
  const markerStroke = scale * MARKER_STROKE_PCT
  const markerFont = scale * MARKER_FONT_PCT

  return (
    <svg
      viewBox={vb.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%' }}
    >
      {pathD && (
        <path d={pathD} fill="none" stroke="#7A8290" strokeWidth={trackStroke} />
      )}
      <DecorationLayer session={session} substrateSamples={substrateSamples} />
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
  )
}
