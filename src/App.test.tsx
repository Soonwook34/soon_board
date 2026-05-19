import { render, screen } from '@testing-library/react'
import App from './App'

// Silence console.error from bootstrap fetch failures in test env
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('App', () => {
  it('renders the SOON Board wordmark', () => {
    render(<App />)
    expect(screen.getByText('Board')).toBeInTheDocument()
  })

  it('renders Header with Wordmark', () => {
    render(<App />)
    // Header contains the wordmark "ON" accent
    const accent = document.querySelector('.text-soon-accent')
    expect(accent).toBeInTheDocument()
  })

  it('shows Calendar overlay by default (no session selected)', () => {
    render(<App />)
    // Calendar renders with role="dialog" aria-label="Calendar"
    expect(screen.getByRole('dialog', { name: 'Calendar' })).toBeInTheDocument()
  })

  it('shows EmptyMap placeholder when no session is selected', () => {
    render(<App />)
    expect(screen.getByText('세션을 선택해 주세요')).toBeInTheDocument()
  })

  it('matches empty-state snapshot', () => {
    const { container } = render(<App />)
    expect(container.firstChild).toMatchSnapshot()
  })
})
