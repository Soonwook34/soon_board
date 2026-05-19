import { render, screen } from '@testing-library/react'
import { Header } from './Header'

describe('Header', () => {
  it('renders Wordmark (contains Board text)', () => {
    render(<Header />)
    expect(screen.getByText('Board')).toBeInTheDocument()
  })

  it('displays meetingLabel when provided', () => {
    render(<Header meetingLabel="Monaco Grand Prix" />)
    expect(screen.getByText('Monaco Grand Prix')).toBeInTheDocument()
  })

  it('displays sessionLabel when provided alongside meeting', () => {
    render(<Header meetingLabel="Monaco Grand Prix" sessionLabel="Race" />)
    expect(screen.getByText('Monaco Grand Prix')).toBeInTheDocument()
    expect(screen.getByText('Race')).toBeInTheDocument()
  })

  it('renders separator dot when both labels are present', () => {
    render(<Header meetingLabel="Monaco Grand Prix" sessionLabel="Race" />)
    expect(screen.getByText('·')).toBeInTheDocument()
  })

  it('does not render separator when only meeting is provided', () => {
    render(<Header meetingLabel="Monaco Grand Prix" />)
    expect(screen.queryByText('·')).not.toBeInTheDocument()
  })

  it('renders without labels', () => {
    const { container } = render(<Header />)
    expect(container.querySelector('header')).toBeInTheDocument()
  })
})
