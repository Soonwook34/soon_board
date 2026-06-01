/// @vitest-environment jsdom
// US-3 — useLatestBefore / useAllBefore / useAggregate 가 throttled t 로 ds 메서드 위임.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { DataSourceProvider } from '../DataSourceContext';
import { useLatestBefore } from '../useLatestBefore';
import { useAllBefore } from '../useAllBefore';
import { useAggregate } from '../useAggregate';
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
    // t 에 의존하는 결과를 돌려줘 위임 + t 전달을 검증.
    getLatestBefore: (endpoint: string, t: Date, filters?: unknown) => ({
      endpoint,
      tMs: t.valueOf(),
      filters,
    }),
    getAllBefore: (endpoint: string, t: Date) => [{ endpoint, tMs: t.valueOf() }],
    getAggregateBefore: (aggregate: string, t: Date) => ({ aggregate, tMs: t.valueOf() }),
  } as unknown as DataSource;
  return {
    ds,
    set(ms: number, notify = false) {
      current = new Date(ms);
      if (notify) for (const l of listeners) l(current);
    },
  };
}

function LatestProbe({ onValue }: { onValue: (v: unknown) => void }) {
  const v = useLatestBefore('position', { filters: { position: 1 }, intervalMs: 500 });
  onValue(v);
  return null;
}

describe('query hooks', () => {
  it('useLatestBefore 가 endpoint/현재 t/filters 로 위임', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(1000);
    const seen: unknown[] = [];
    render(
      <DataSourceProvider ds={f.ds}>
        <LatestProbe onValue={(v) => seen.push(v)} />
      </DataSourceProvider>,
    );
    expect(seen.at(-1)).toEqual({ endpoint: 'position', tMs: 1000, filters: { position: 1 } });
  });

  it('t 변경 시 재계산 (시크 즉시 반영)', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(1000);
    const seen: Array<{ tMs: number }> = [];
    render(
      <DataSourceProvider ds={f.ds}>
        <LatestProbe onValue={(v) => seen.push(v as { tMs: number })} />
      </DataSourceProvider>,
    );
    act(() => {
      f.set(500, true); // 뒤로 시크
    });
    expect(seen.at(-1)?.tMs).toBe(500);
  });

  it('useAllBefore 배열 / useAggregate 객체 위임', () => {
    vi.useFakeTimers();
    const f = makeFakeDs(2000);
    const all: unknown[] = [];
    const agg: unknown[] = [];
    function Both() {
      all.push(useAllBefore('race_control', { intervalMs: 500 }));
      agg.push(useAggregate('fastest_lap', 500));
      return null;
    }
    render(
      <DataSourceProvider ds={f.ds}>
        <Both />
      </DataSourceProvider>,
    );
    expect(all.at(-1)).toEqual([{ endpoint: 'race_control', tMs: 2000 }]);
    expect(agg.at(-1)).toEqual({ aggregate: 'fastest_lap', tMs: 2000 });
  });
});
