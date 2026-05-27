import { describe, expect, it, vi } from 'vitest';
import { drawSlmZones, loadSlmZones } from '../slmZones';
import type { SlmZone } from '../slmZones';
import type { ViewportTransform } from '../viewport';

function makeCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '' as CanvasLineCap,
    font: '',
    textBaseline: '' as CanvasTextBaseline,
  } as unknown as CanvasRenderingContext2D;
}

const POLY: Array<[number, number]> = [
  [0, 0],
  [400, 0],
  [400, 400],
  [0, 400],
  [0, 0],
];
const ARC = [0, 400, 800, 1200, 1600];
const VIEWPORT: ViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
const ZONES: SlmZone[] = [
  { id: 1, s_start: 200, s_end: 600, label: 'Zone A' },
  { id: 2, s_start: 1000, s_end: 1400 },
];

describe('drawSlmZones', () => {
  it('strokes each zone segment + labels with custom label or default', () => {
    const ctx = makeCtx();
    drawSlmZones(ctx, ZONES, POLY, ARC, VIEWPORT);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    const calls = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('Zone A');
    expect(calls[1][0]).toBe('SLM ▶');
  });

  it('no-op when zones empty', () => {
    const ctx = makeCtx();
    drawSlmZones(ctx, [], POLY, ARC, VIEWPORT);
    expect(ctx.stroke).not.toHaveBeenCalled();
  });
});

describe('loadSlmZones', () => {
  it('returns null on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadSlmZones(63, 2026, fetchImpl)).toBeNull();
  });

  it('parses zones JSON on 200', async () => {
    const payload = {
      circuit_key: 63,
      year: 2026,
      zones: ZONES,
      source: 'FIA',
      generated_at: new Date().toISOString(),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadSlmZones(63, 2026, fetchImpl);
    expect(result?.zones).toHaveLength(2);
  });
});
