/// @vitest-environment jsdom
// US-2 — useDisplayTime: 정상 진행 throttle(poll) + 시크(뒤로 점프) 즉시 반영.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DataSourceProvider } from '../DataSourceContext';
import { useDisplayTime } from '../useDisplayTime';
import type { DataSource } from '../../../shared/DataSource';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function makeFakeDs(startMs = 0) {
  let current = new Date(startMs);
  const listeners = new Set<(t: Date) => void>();
  const ds = {
    getDisplayTime: () => current,
    onDisplayTimeChange: (h: (t: Date) => void) => {
      listeners.add(h);
      return () => listeners.delete(h);
    },
  } as unknown as DataSource;
  return {
    ds,
    set(ms: number, notify = false) {
      current = new Date(ms);
      if (notify) for (const l of listeners) l(current);
    },
  };
}

function Probe({ onValue, intervalMs }: { onValue: (ms: number) => void; intervalMs?: number }) {
  const t = useDisplayTime(intervalMs);
  onValue(t.valueOf());
  return null;
}

describe('useDisplayTime', () => {
  it('정상 진행은 intervalMs polling 으로 추적', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(0);
    const seen: number[] = [];
    render(
      <DataSourceProvider ds={f.ds}>
        <Probe onValue={(v) => seen.push(v)} intervalMs={500} />
      </DataSourceProvider>,
    );
    expect(seen.at(-1)).toBe(0);
    // notify 없이 시간 진행 → 다음 poll(500ms) 에 반영
    act(() => {
      f.set(1000);
      vi.advanceTimersByTime(500);
    });
    expect(seen.at(-1)).toBe(1000);
  });

  it('뒤로 점프(시크)는 구독으로 즉시 반영 (interval 안 기다림)', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(10_000);
    const seen: number[] = [];
    render(
      <DataSourceProvider ds={f.ds}>
        <Probe onValue={(v) => seen.push(v)} intervalMs={5000} />
      </DataSourceProvider>,
    );
    expect(seen.at(-1)).toBe(10_000);
    act(() => {
      f.set(2_000, true); // 8s 뒤로 시크 + notify
    });
    expect(seen.at(-1)).toBe(2_000);
  });

  it('큰 폭 앞으로 점프(시크)도 구독으로 즉시 반영 (interval 안 기다림)', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(0);
    const seen: number[] = [];
    render(
      <DataSourceProvider ds={f.ds}>
        <Probe onValue={(v) => seen.push(v)} intervalMs={5000} />
      </DataSourceProvider>,
    );
    expect(seen.at(-1)).toBe(0);
    act(() => {
      f.set(3_000, true); // 3s 앞으로 점프 (>2000ms 임계) → 즉시
    });
    expect(seen.at(-1)).toBe(3_000);
  });

  it('unmount 시 interval/구독 정리 (이후 갱신 없음)', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(0);
    const seen: number[] = [];
    const { unmount } = render(
      <DataSourceProvider ds={f.ds}>
        <Probe onValue={(v) => seen.push(v)} intervalMs={500} />
      </DataSourceProvider>,
    );
    unmount();
    const countAfterUnmount = seen.length;
    act(() => {
      f.set(9999, true);
      vi.advanceTimersByTime(2000);
    });
    expect(seen.length).toBe(countAfterUnmount);
  });
});
