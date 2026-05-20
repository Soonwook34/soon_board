import { useEffect, useRef } from 'react'
import type React from 'react'
import { useMasterRaf } from './useMasterRaf'
import { useCarsPositionStore } from '../store/carsPositionStore'

export function useDriverMarker(driverNumber: number): React.RefObject<SVGGElement> {
  const ref = useRef<SVGGElement>(null)
  const masterRaf = useMasterRaf()

  useEffect(() => {
    const unregister = masterRaf.register({
      driverNumber,
      ref,
      getSamples: () =>
        useCarsPositionStore.getState().byNumber.get(driverNumber)?.samples ?? [],
    })
    return unregister
  }, [driverNumber, masterRaf])

  return ref
}
