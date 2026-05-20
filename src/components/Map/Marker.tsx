import { forwardRef } from 'react'
import type { Driver } from '../../api/types'

interface Props {
  driver: Driver
  /** In viewBox units. Set by CircuitMap proportional to track bbox. */
  radius: number
  fontSize: number
  strokeWidth: number
}

export const Marker = forwardRef<SVGGElement, Props>(
  ({ driver, radius, fontSize, strokeWidth }, ref) => (
    <g ref={ref} aria-label={`Driver ${driver.name_acronym}`}>
      <circle r={radius} fill={`#${driver.team_colour}`} stroke="#0A0A0B" strokeWidth={strokeWidth} />
      <text
        y={fontSize * 0.35}
        textAnchor="middle"
        fill="#0A0A0B"
        fontSize={fontSize}
        fontWeight="700"
      >
        {driver.driver_number}
      </text>
    </g>
  ),
)

Marker.displayName = 'Marker'
