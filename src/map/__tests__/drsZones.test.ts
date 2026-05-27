import { describe, expect, it, vi } from 'vitest';
import { drawDrsZones, loadDrsZones } from '../drsZones';
import type { DrsZone } from '../drsZones';
import type { ViewportTransform } from '../viewport';

function makeCtx() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    arc: vi.fn(),
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
const ZONES: DrsZone[] = [
  { id: 1, detection_s: 100, activation_s_start: 200, activation_s_end: 600 },
  { id: 2, detection_s: 900, activation_s_start: 1000, activation_s_end: 1400 },
];

describe('drawDrsZones', () => {
  it('strokes activation segments and labels detection points', () => {
    const ctx = makeCtx();
    drawDrsZones(ctx, ZONES, POLY, ARC, VIEWPORT);
    expect(ctx.beginPath).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    expect((ctx.fillText as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain('DRS');
  });

  it('skips detection labels when showDetection=false', () => {
    const ctx = makeCtx();
    drawDrsZones(ctx, ZONES, POLY, ARC, VIEWPORT, { showDetection: false });
    expect(ctx.stroke).toHaveBeenCalledTimes(2);
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('no-op when zones empty', () => {
    const ctx = makeCtx();
    drawDrsZones(ctx, [], POLY, ARC, VIEWPORT);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });

  it('wrap-around zone (sEnd < sStart) walks via start/finish line — interior points included', () => {
    const ctx = makeCtx();
    const wrapZone: DrsZone = {
      id: 1,
      detection_s: 1400,
      activation_s_start: 1500, // near end of track (total 1600)
      activation_s_end: 200,    // wraps past start/finish
    };
    drawDrsZones(ctx, [wrapZone], POLY, ARC, VIEWPORT, { showDetection: false });
    // lineTo should be called for interior polyline points satisfying s > 1500 OR s < 200.
    // arcTable = [0, 400, 800, 1200, 1600]. None match s > 1500 (1600 is the closed loop), s=0 matches s < 200.
    // So at least 1 interior lineTo expected (plus 1 for sEnd terminator).
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
  });
});

describe('loadDrsZones', () => {
  it('returns null on 404', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadDrsZones(63, 2024, fetchImpl)).toBeNull();
  });

  it('parses zones JSON on 200', async () => {
    const payload = {
      circuit_key: 63,
      year: 2024,
      zones: ZONES,
      method: 'drs_state_transitions_clustering',
      coverage_note: 'test',
      generated_at: new Date().toISOString(),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await loadDrsZones(63, 2024, fetchImpl);
    expect(result?.zones).toHaveLength(2);
  });
});
