// Official Pirelli broadcast palette for F1 compound chips.
// Locked in deep-interview spec / consensus plan AC10.

import type { Stint } from '../../api/types'

export type Compound = Stint['compound']

export interface TireColor {
  bg: string
  fg: string
}

// Keyed by the API-level compound enum so callers don't have to translate.
// INTERMEDIATE displays as the broadcast-standard "INTER" short label —
// see TIRE_SHORT_NAME below.
export const TIRE_COLORS: Record<Compound, TireColor> = {
  SOFT:         { bg: '#DA291C', fg: '#FFFFFF' },
  MEDIUM:       { bg: '#FFD93D', fg: '#0A0A0B' },
  HARD:         { bg: '#F0F0F0', fg: '#0A0A0B' },
  INTERMEDIATE: { bg: '#43B02A', fg: '#FFFFFF' },
  WET:          { bg: '#0067B1', fg: '#FFFFFF' },
  UNKNOWN:      { bg: '#3A3A40', fg: '#9CA3AF' },
}

export const TIRE_SHORT_NAME: Record<Compound, string> = {
  SOFT: 'SOFT',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD',
  INTERMEDIATE: 'INTER',
  WET: 'WET',
  UNKNOWN: 'UNKNOWN',
}
