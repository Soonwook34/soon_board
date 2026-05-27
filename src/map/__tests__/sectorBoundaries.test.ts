import { describe, expect, it, vi } from 'vitest';
import { drawSectorBoundaries, loadSectorBoundaries, sectorColors } from '../sectorBoundaries';
import type { SectorBoundary } from '../sectorBoundaries';
import type { ViewportTransform } from '../viewport';

function makeCtx() {
  return {
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
}

const VIEWPORT: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
const BOUNDARIES: SectorBoundary[] = [
  { sector: 1, end_xy: [100, 50], arc_length_s: 100 },
  { sector: 2, end_xy: [200, 150], arc_length_s: 600 },
  { sector: 3, end_xy: [0, 0], arc_length_s: 0 },
];

describe('drawSectorBoundaries', () => {
  it('draws all 3 boundaries with sector-specific colors on a normal canvas', () => {
    const ctx = makeCtx();
    drawSectorBoundaries(ctx, BOUNDARIES, VIEWPORT, { canvasWidth: 800, canvasHeight: 600 });
    expect(ctx.arc).toHaveBeenCalledTimes(3);
    expect(ctx.fill).toHaveBeenCalledTimes(3);
    expect(ctx.stroke).toHaveBeenCalledTimes(3);
  });

  it('skips rendering when canvas is too small (§4.5.3)', () => {
    const ctx = makeCtx();
    drawSectorBoundaries(ctx, BOUNDARIES, VIEWPORT, { canvasWidth: 300, canvasHeight: 300 });
    expect(ctx.arc).not.toHaveBeenCalled();
    expect(ctx.fill).not.toHaveBeenCalled();
  });

  it('skips when boundaries empty', () => {
    const ctx = makeCtx();
    drawSectorBoundaries(ctx, [], VIEWPORT, { canvasWidth: 800, canvasHeight: 600 });
    expect(ctx.arc).not.toHaveBeenCalled();
  });

  it('sectorColors mapping exists for 1/2/3', () => {
    expect(sectorColors[1]).toBeTruthy();
    expect(sectorColors[2]).toBeTruthy();
    expect(sectorColors[3]).toBeTruthy();
    expect(sectorColors[1]).not.toBe(sectorColors[2]);
  });
});

describe('loadSectorBoundaries', () => {
  it('returns null on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const result = await loadSectorBoundaries(63, 2024, fetchImpl);
    expect(result).toBeNull();
  });

  it('parses sectors JSON on 200', async () => {
    const payload = {
      circuit_key: 63,
      year: 2024,
      boundaries: BOUNDARIES,
      method: 'i1_i2_speed_trap_derive',
      accuracy_note: 'test',
      generated_at: new Date().toISOString(),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSectorBoundaries(63, 2024, fetchImpl);
    expect(result?.boundaries).toHaveLength(3);
  });

  it('throws on non-404 error response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(loadSectorBoundaries(63, 2024, fetchImpl)).rejects.toThrow(/HTTP 500/);
  });
});
