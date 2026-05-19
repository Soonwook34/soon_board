import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

describe('AppShell', () => {
  it('renders header, map, leaderboard slots', () => {
    render(
      <AppShell
        header={<div>header-slot</div>}
        map={<div>map-slot</div>}
        leaderboard={<div>lb-slot</div>}
        footer={null}
      />,
    )
    expect(screen.getByText('header-slot')).toBeInTheDocument()
    expect(screen.getByText('map-slot')).toBeInTheDocument()
    expect(screen.getByText('lb-slot')).toBeInTheDocument()
  })

  it('renders footer when provided', () => {
    render(
      <AppShell
        header={<div>h</div>}
        map={<div>m</div>}
        leaderboard={<div>l</div>}
        footer={<div>footer-slot</div>}
      />,
    )
    expect(screen.getByText('footer-slot')).toBeInTheDocument()
  })

  it('does not render footer element when footer is null', () => {
    const { container } = render(
      <AppShell
        header={<div>h</div>}
        map={<div>m</div>}
        leaderboard={<div>l</div>}
        footer={null}
      />,
    )
    expect(container.querySelector('footer')).not.toBeInTheDocument()
  })

  it('renders overlay when provided', () => {
    render(
      <AppShell
        header={<div>h</div>}
        map={<div>m</div>}
        leaderboard={<div>l</div>}
        footer={null}
        overlay={<div>overlay-slot</div>}
      />,
    )
    expect(screen.getByText('overlay-slot')).toBeInTheDocument()
  })

  it('main grid has single-column classes by default', () => {
    mockMatchMedia(false)
    const { container } = render(
      <AppShell
        header={<div>h</div>}
        map={<div>m</div>}
        leaderboard={<div>l</div>}
        footer={null}
      />,
    )
    const main = container.querySelector('main')
    expect(main?.className).toContain('grid-cols-1')
  })

  it('main grid has lg two-column classes applied', () => {
    mockMatchMedia(true)
    const { container } = render(
      <AppShell
        header={<div>h</div>}
        map={<div>m</div>}
        leaderboard={<div>l</div>}
        footer={null}
      />,
    )
    const main = container.querySelector('main')
    // Tailwind lg: classes are always in the DOM — breakpoint is applied by CSS media query
    expect(main?.className).toContain('lg:grid-cols-[60fr_40fr]')
    expect(main?.className).toContain('lg:grid-rows-1')
  })
})
