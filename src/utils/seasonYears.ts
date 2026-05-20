// OpenF1 has historical data from 2023 onward. The calendar lists every
// year in that range plus one year ahead so a freshly published 2027 schedule
// shows up automatically the moment the current year ticks over.
export const FIRST_AVAILABLE_YEAR = 2023

export function getAvailableYears(nowMs: number = Date.now()): number[] {
  const currentYear = new Date(nowMs).getUTCFullYear()
  const lastYear = currentYear + 1
  const years: number[] = []
  for (let y = FIRST_AVAILABLE_YEAR; y <= lastYear; y++) years.push(y)
  return years
}

// Pick the year that should appear selected when the calendar opens. Prefers
// the year of the currently picked session over wall-clock so the user lands
// where their replay/live context already is.
export function pickInitialYear(
  currentSessionDateStart: string | undefined,
  nowMs: number = Date.now(),
): number {
  if (currentSessionDateStart) {
    const y = new Date(currentSessionDateStart).getUTCFullYear()
    if (Number.isFinite(y)) return y
  }
  return new Date(nowMs).getUTCFullYear()
}
