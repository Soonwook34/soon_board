import { render, screen } from '@testing-library/react'
import { Wordmark } from './Wordmark'

describe('Wordmark', () => {
  it('contains soon Board text (lowercase soon)', () => {
    const { container } = render(<Wordmark />)
    expect(screen.getByText(/Board/)).toBeInTheDocument()
    // Whole wordmark text concatenated reads "soon Board" (the accent slice
    // is just visual emphasis on "oo" — the underlying text is lowercase).
    expect(container.textContent?.replace(/\s+/g, ' ').trim()).toBe('soon Board')
  })

  it('accent span wraps "oo" with class text-soon-accent', () => {
    const { container } = render(<Wordmark />)
    const accent = container.querySelector('.text-soon-accent')
    expect(accent).toBeInTheDocument()
    expect(accent?.textContent).toBe('oo')
  })

  it('Board span has class text-soon-muted', () => {
    const { container } = render(<Wordmark />)
    const muted = container.querySelector('.text-soon-muted')
    expect(muted).toBeInTheDocument()
    expect(muted?.textContent).toBe('Board')
  })

  it('does not apply textShadow glow (flat theme — AC11)', () => {
    const { container } = render(<Wordmark />)
    const accent = container.querySelector('.text-soon-accent') as HTMLElement | null
    expect(accent?.style.textShadow ?? '').toBe('')
  })

  it('matches snapshot', () => {
    const { container } = render(<Wordmark />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
