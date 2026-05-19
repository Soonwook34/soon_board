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

function DriverMarker({ driver }: { driver: Driver }) {
  const ref = useDriverMarker(driver.driver_number)
  return <Marker ref={ref} driver={driver} />
}

export function CircuitMap({ session, drivers, substrateSamples }: Props) {
  const masterRaf = useMasterRaf()
  useFrameBudget(masterRaf)

  const points = substrateSamples.map((s): [number, number] => [s.x, s.y])
  const bbox = computeBbox(points)
  const vb = paddedViewBox(bbox)
  const pathD = catmullRomToPath(smoothPolyline(points))

  return (
    <svg
      viewBox={vb.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%' }}
    >
      {pathD && (
        <path d={pathD} fill="none" stroke="#3A3A45" strokeWidth="2" />
      )}
      <DecorationLayer session={session} substrateSamples={substrateSamples} />
      {drivers.map((driver) => (
        <DriverMarker key={driver.driver_number} driver={driver} />
      ))}
    </svg>
  )
}
