import type { Meeting } from '../../api/types'
import m2023 from './2023.json'
import m2024 from './2024.json'
import m2025 from './2025.json'
import m2026 from './2026.json'

// Pre-shipped meetings cache. Years not listed here fall through to the live
// /meetings endpoint. Refresh by running `scripts/fetch-meetings.cjs`.
export const PRESHIPPED_MEETINGS: Record<number, Meeting[]> = {
  2023: m2023 as Meeting[],
  2024: m2024 as Meeting[],
  2025: m2025 as Meeting[],
  2026: m2026 as Meeting[],
}

export function getPreshippedMeetings(year: number): Meeting[] | null {
  return PRESHIPPED_MEETINGS[year] ?? null
}
