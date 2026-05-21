import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Logo } from '../Logo';

describe('Logo (SOON BOARD wordmark)', () => {
  it('renders three tspan elements in order: SO, ON, BOARD', () => {
    const markup = renderToStaticMarkup(<Logo />);
    const tspans = markup.match(/<tspan[^>]*>([^<]+)<\/tspan>/g) ?? [];

    const textParts = tspans.map((t) => t.replace(/<[^>]+>/g, ''));
    expect(textParts).toEqual(['SO', 'ON', ' BOARD']);
  });

  it('colors ONLY the "ON" tspan with F1 red #E10600', () => {
    const markup = renderToStaticMarkup(<Logo />);

    // F1 red appears exactly once (on the ON tspan).
    const redMatches = markup.match(/#E10600/gi) ?? [];
    expect(redMatches.length).toBe(1);

    // The single red tspan must contain "ON".
    const redTspan = markup.match(/<tspan[^>]*#E10600[^>]*>([^<]+)<\/tspan>/i);
    expect(redTspan).not.toBeNull();
    expect(redTspan?.[1]).toBe('ON');
  });

  it('colors the other tspans off-white #F5F5F0', () => {
    const markup = renderToStaticMarkup(<Logo />);

    // Off-white appears twice (SO + " BOARD" tspans).
    const offWhiteMatches = markup.match(/#F5F5F0/gi) ?? [];
    expect(offWhiteMatches.length).toBe(2);
  });

  it('respects the size prop and preserves aspect ratio', () => {
    const markup = renderToStaticMarkup(<Logo size={40} />);

    expect(markup).toContain('height="40"');
    // viewBox is 480x80 → width at size=40 is 240
    expect(markup).toContain('width="240"');
  });

  it('emits the glow filter on ON by default', () => {
    const markup = renderToStaticMarkup(<Logo />);
    expect(markup).toContain('filter="url(#soonboard-glow)"');
  });

  it('omits the glow filter when glow=false', () => {
    const markup = renderToStaticMarkup(<Logo glow={false} />);
    expect(markup).not.toContain('filter="url(#soonboard-glow)"');
  });

  it('uses the Orbitron family for the wordmark', () => {
    const markup = renderToStaticMarkup(<Logo />);
    expect(markup).toContain('font-family="Orbitron, sans-serif"');
    expect(markup).toContain('font-weight="900"');
  });

  it('sets aria-label so screen readers announce "SOON BOARD"', () => {
    const markup = renderToStaticMarkup(<Logo />);
    expect(markup).toContain('aria-label="SOON BOARD"');
  });
});
