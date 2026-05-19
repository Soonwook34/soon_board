import { render, screen } from '@testing-library/react'
import { Wordmark } from './Wordmark'

describe('Wordmark', () => {
  it('contains SOON Board text', () => {
    render(<Wordmark />)
    expect(screen.getByText(/Board/)).toBeInTheDocument()
    expect(screen.getByText(/ON/)).toBeInTheDocument()
  })

  it('accent span has class text-soon-accent', () => {
    const { container } = render(<Wordmark />)
    const accent = container.querySelector('.text-soon-accent')
    expect(accent).toBeInTheDocument()
    expect(accent?.textContent).toBe('ON')
  })

  it('Board span has class text-soon-muted', () => {
    const { container } = render(<Wordmark />)
    const muted = container.querySelector('.text-soon-muted')
    expect(muted).toBeInTheDocument()
    expect(muted?.textContent).toBe('Board')
  })

  it('matches snapshot', () => {
    const { container } = render(<Wordmark />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
