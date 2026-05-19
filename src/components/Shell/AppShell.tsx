import type { ReactNode } from 'react'

export interface AppShellProps {
  header: ReactNode
  map: ReactNode
  leaderboard: ReactNode
  footer: ReactNode | null
  overlay?: ReactNode | null
}

export function AppShell({ header, map, leaderboard, footer, overlay }: AppShellProps) {
  return (
    <div className="min-h-screen bg-bg-base text-[#F5F5F7] flex flex-col">
      {header}
      <main
        className="flex-1 grid gap-2 p-2
                   grid-cols-1 grid-rows-[1fr_1fr]
                   lg:grid-cols-[60fr_40fr] lg:grid-rows-1"
      >
        <section className="bg-bg-elev1 rounded-md min-h-0 overflow-hidden">{map}</section>
        <section className="bg-bg-elev1 rounded-md min-h-0 overflow-auto">{leaderboard}</section>
      </main>
      {footer && <footer className="sticky bottom-0">{footer}</footer>}
      {overlay}
    </div>
  )
}
