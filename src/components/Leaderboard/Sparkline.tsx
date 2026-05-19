export function Sparkline({ laps }: { laps: number[] }) {
  if (laps.length < 2) return <svg width="60" height="16" aria-label="No lap data" />
  const min = Math.min(...laps)
  const max = Math.max(...laps)
  const range = max - min || 1
  const points = laps
    .map((l, i) => {
      const x = (i / (laps.length - 1)) * 60
      const y = 16 - ((l - min) / range) * 16
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width="60" height="16" role="img" aria-label="Recent lap times">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
