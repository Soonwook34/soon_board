/// @vitest-environment jsdom
// src/shared/Footer.tsx — RTL 기반 4 line 표기 + generated_at 동기 검증.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetCatalogStore,
  configureCatalogStore,
} from '../../main/stores/catalogStore.js';
import type { SeasonsIndex } from '../seasonData.js';
import { Footer } from '../Footer.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const SAMPLE_INDEX: SeasonsIndex = {
  generated_at: '2026-05-26T01:00:00Z',
  seasons: [{ year: 2024, generated_at: '2026-05-22T07:26:20Z', source: 'openf1.org/v1' }],
};

afterEach(() => {
  _resetCatalogStore();
  cleanup();
});

describe('Footer', () => {
  it('renders all four required attribution lines', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });

    render(<Footer />);
    expect(screen.getByTestId('footer-track-attr')).toBeDefined();
    expect(screen.getByTestId('footer-data-attr')).toBeDefined();
    expect(screen.getByTestId('footer-disclaimer')).toBeDefined();
    expect(screen.getByTestId('footer-generated-at')).toBeDefined();

    // Verify text content
    expect(screen.getByTestId('footer-track-attr').textContent).toContain('Track maps');
    expect(screen.getByTestId('footer-track-attr').textContent).toContain('julesr0y/f1-circuits-svg');
    expect(screen.getByTestId('footer-track-attr').textContent).toContain('CC BY 4.0');
    expect(screen.getByTestId('footer-data-attr').textContent).toContain('OpenF1.org');
    expect(screen.getByTestId('footer-disclaimer').textContent).toContain(
      'Unofficial fan project',
    );
    expect(screen.getByTestId('footer-disclaimer').textContent).toContain(
      'Not affiliated with Formula 1',
    );
  });

  it('renders generated_at "pending…" before index loads', () => {
    const never = new Promise<Response>(() => {}); // never resolves
    configureCatalogStore({ fetchImpl: () => never });
    render(<Footer />);
    expect(screen.getByTestId('footer-generated-at').textContent).toMatch(/pending/i);
  });

  it('updates generated_at after index loads', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });
    render(<Footer />);
    await waitFor(() => {
      expect(screen.getByTestId('footer-generated-at').textContent).toMatch(/2026-05-26/);
    });
    // Format includes UTC + HH:MM
    expect(screen.getByTestId('footer-generated-at').textContent).toMatch(/01:00 UTC/);
  });

  it('links open in new tab with noopener for security', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(SAMPLE_INDEX));
    configureCatalogStore({ fetchImpl });
    const { container } = render(<Footer />);
    const links = container.querySelectorAll('a');
    expect(links.length).toBeGreaterThanOrEqual(3); // julesr0y + CC BY + OpenF1
    for (const link of Array.from(links)) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
    }
  });
});
