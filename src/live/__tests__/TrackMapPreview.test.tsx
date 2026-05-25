/// @vitest-environment jsdom
// src/live/TrackMapPreview.tsx — 로딩/성공/404/error/circuitKey 변경 검증.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TrackMapPreview } from '../TrackMapPreview.js';
import type { TrackOutlineJson } from '../../../scripts/_lib/trackOutlinesSchema.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeTrack(circuitKey: number, year: number): TrackOutlineJson {
  return {
    circuit_key: circuitKey,
    year,
    circuit_short_name: 'Test',
    country_name: 'Testland',
    source: 'julesr0y/f1-circuits-svg',
    source_file: 'x',
    license: 'CC-BY-4.0',
    viewBox: [0, 0, 500, 500],
    polyline: [
      [0, 0],
      [500, 0],
      [500, 500],
      [0, 500],
      [0, 0],
    ],
    arc_length_table: [0, 500, 1000, 1500, 2000],
    total_length: 2000,
    start_finish_index: 0,
    direction: 'clockwise',
    generated_at: '2026-05-26T00:00:00.000Z',
  };
}

afterEach(() => cleanup());

describe('TrackMapPreview', () => {
  it('shows loading placeholder before fetch resolves', () => {
    const never = new Promise<Response>(() => {});
    render(<TrackMapPreview circuitKey={63} year={2024} fetchImpl={() => never} />);
    expect(screen.getByTestId('trackmap-loading').textContent).toMatch(/로딩 중/);
  });

  it('renders canvas after successful fetch', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(makeTrack(63, 2024)));
    render(<TrackMapPreview circuitKey={63} year={2024} fetchImpl={fetchImpl} />);
    await waitFor(() => {
      expect(screen.getByTestId('trackmap-canvas')).toBeDefined();
    });
    // Fetch was hit with the expected path
    expect(fetchImpl).toHaveBeenCalledWith('/trackOutlines/63-2024.json');
  });

  it('shows missing-data fallback on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    render(<TrackMapPreview circuitKey={999} year={2024} fetchImpl={fetchImpl} />);
    await waitFor(() => {
      expect(screen.getByTestId('trackmap-missing').textContent).toMatch(/준비되지 않았습니다/);
    });
  });

  it('shows error message on non-404 failure', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }));
    render(<TrackMapPreview circuitKey={63} year={2024} fetchImpl={fetchImpl} />);
    await waitFor(() => {
      const el = screen.getByTestId('trackmap-error');
      expect(el.textContent).toMatch(/HTTP 500/);
    });
  });

  it('shows error message on network rejection', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    render(<TrackMapPreview circuitKey={63} year={2024} fetchImpl={fetchImpl} />);
    await waitFor(() => {
      expect(screen.getByTestId('trackmap-error').textContent).toMatch(/network down/);
    });
  });

  it('re-fetches when circuitKey changes', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('63-2024')) return jsonResponse(makeTrack(63, 2024));
      if (u.includes('70-2021')) return jsonResponse(makeTrack(70, 2021));
      return new Response('', { status: 404 });
    });
    const { rerender } = render(
      <TrackMapPreview circuitKey={63} year={2024} fetchImpl={fetchImpl} />,
    );
    await waitFor(() => expect(screen.getByTestId('trackmap-canvas')).toBeDefined());
    expect(fetchImpl).toHaveBeenCalledWith('/trackOutlines/63-2024.json');

    rerender(<TrackMapPreview circuitKey={70} year={2021} fetchImpl={fetchImpl} />);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledWith('/trackOutlines/70-2021.json'));
  });
});
