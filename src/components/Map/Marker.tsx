import { forwardRef } from 'react'
import type { Driver } from '../../api/types'

export const Marker = forwardRef<SVGGElement, { driver: Driver }>(
  ({ driver }, ref) => (
    <g ref={ref} aria-label={`Driver ${driver.name_acronym}`}>
      <circle r="8" fill={`#${driver.team_colour}`} stroke="#0A0A0B" strokeWidth="1.5" />
      <text dy="-12" textAnchor="middle" fill="#F5F5F7" fontSize="10" fontWeight="700">
        {driver.driver_number}
      </text>
    </g>
  ),
)

Marker.displayName = 'Marker'
