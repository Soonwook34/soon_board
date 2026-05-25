/// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useNowSecond } from '../useNowSecond';

function pushHistory(search: string): void {
  window.history.pushState({}, '', `/${search}`);
}

function Probe({ onValue }: { onValue: (n: number) => void }): null {
  const now = useNowSecond();
  onValue(now);
  return null;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  pushHistory('');
});

describe('useNowSecond — simulation (plan §12 단계 14 + 인수 16, 17)', () => {
  it('returns frozen simulated ms when ?now=ISO8601 is set (DEV env)', () => {
    pushHistory('?now=2024-03-02T15:00:00Z');
    const seen: number[] = [];
    render(<Probe onValue={(n) => seen.push(n)} />);
    const initial = seen[0];
    expect(initial).toBe(Date.UTC(2024, 2, 2, 15, 0, 0));
  });

  it('does NOT register setInterval when simulation is active (frozen mode)', () => {
    pushHistory('?now=2024-03-02T15:00:00Z');
    const setSpy = vi.spyOn(window, 'setInterval');
    render(<Probe onValue={() => {}} />);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('returns Date.now()-ish value and registers setInterval when no ?now param', () => {
    pushHistory('');
    const setSpy = vi.spyOn(window, 'setInterval');
    const beforeMs = Date.now();
    const seen: number[] = [];
    render(<Probe onValue={(n) => seen.push(n)} />);
    const afterMs = Date.now();
    expect(seen[0]).toBeGreaterThanOrEqual(beforeMs);
    expect(seen[0]).toBeLessThanOrEqual(afterMs);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it('ignores invalid ISO ?now value (falls back to real Date.now)', () => {
    pushHistory('?now=not-a-date');
    const setSpy = vi.spyOn(window, 'setInterval');
    const beforeMs = Date.now();
    const seen: number[] = [];
    render(<Probe onValue={(n) => seen.push(n)} />);
    expect(seen[0]).toBeGreaterThanOrEqual(beforeMs);
    expect(setSpy).toHaveBeenCalled();
  });
});
