import { describe, expect, it, vi } from 'vitest';
import { SyntheticDataSource } from '../SyntheticDataSource';

const SQUARE: Array<[number, number]> = [
  [0, 0],
  [400, 0],
  [400, 400],
  [0, 400],
  [0, 0],
];
const PERIMETER = 1600;

function makeDs(opts?: Partial<ConstructorParameters<typeof SyntheticDataSource>[0]>) {
  let wallMs = 1_700_000_000_000;
  let scheduledCb: (() => void) | null = null;
  const ds = new SyntheticDataSource({
    driverNumbers: [1, 2, 3, 4, 5],
    samplesPerSecond: 10,
    polyline: SQUARE,
    totalArcLength: PERIMETER,
    startEpochMs: wallMs,
    cruiseSpeed: 30,
    tickIntervalMs: 100,
    now: () => wallMs,
    setIntervalImpl: (cb, _ms) => {
      scheduledCb = cb;
      return 1;
    },
    clearIntervalImpl: () => {
      scheduledCb = null;
    },
    ...opts,
  });
  return {
    ds,
    advance(ms: number) {
      const steps = Math.max(1, Math.floor(ms / 100));
      for (let i = 0; i < steps; i++) {
        wallMs += 100;
        scheduledCb?.();
      }
    },
    setWall: (ms: number) => {
      wallMs = ms;
    },
  };
}

describe('SyntheticDataSource', () => {
  it('emits samples per driver at the configured sps cadence', () => {
    const onSample = vi.fn();
    const { ds, advance } = makeDs({ onSample });
    ds.start();
    advance(1000);
    const callsForDriver1 = onSample.mock.calls.filter((c) => c[0] === 1).length;
    expect(callsForDriver1).toBeGreaterThanOrEqual(9);
    expect(callsForDriver1).toBeLessThanOrEqual(12);
  });

  it('ring buffer stays bounded under sustained input (LiveDataSource 60s parity)', () => {
    // LiveDataSource uses 60s ring buffer (30s display + 30s margin).
    // After 90s of 10Hz input, each driver should plateau ~ 60s × 10sps = 600 + small slack.
    const { ds, advance } = makeDs();
    ds.start();
    advance(90_000);
    for (const drv of [1, 2, 3, 4, 5]) {
      const size = ds._bufferSize(drv);
      expect(size).toBeLessThanOrEqual(10 * 60 + 5);
      expect(size).toBeGreaterThanOrEqual(10 * 60 - 50);
    }
  });

  it('drivers are phase-distributed around the polyline', () => {
    const samples: Array<[number, number, number]> = [];
    const { ds, advance } = makeDs({
      onSample: (drv, s) => samples.push([drv, s.x, s.y]),
    });
    ds.start();
    advance(100);
    // First tick: each driver at distinct arc position (5 drivers → 320 spacing).
    const driverSamples = new Map<number, [number, number]>();
    for (const [drv, x, y] of samples) if (!driverSamples.has(drv)) driverSamples.set(drv, [x, y]);
    const positions = Array.from(driverSamples.values());
    const distinctXY = new Set(positions.map(([x, y]) => `${Math.round(x)},${Math.round(y)}`));
    expect(distinctXY.size).toBeGreaterThanOrEqual(4);
  });

  it('getSamplePair returns null before any sample', () => {
    const { ds } = makeDs();
    expect(ds.getSamplePair(1, new Date())).toBeNull();
  });

  it('getStreamState transitions buffering → live → buffering on stop', () => {
    const { ds } = makeDs();
    expect(ds.getStreamState()).toBe('buffering');
    ds.start();
    expect(ds.getStreamState()).toBe('live');
    ds.stop();
    expect(ds.getStreamState()).toBe('buffering');
  });

  it('onDisplayTimeChange fires after first sample', () => {
    const handler = vi.fn();
    const { ds, advance } = makeDs();
    ds.onDisplayTimeChange(handler);
    ds.start();
    advance(100);
    expect(handler).toHaveBeenCalled();
  });

  it('dashboard methods throw (LiveDataSource parity)', () => {
    const { ds } = makeDs();
    expect(() => ds.getLatestBefore('drivers', new Date())).toThrow();
    expect(() => ds.getLapAt(1, new Date())).toThrow();
    expect(() => ds.getStintForLap(1, 1)).toThrow();
  });
});
