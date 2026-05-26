// src/map/stateBadges.ts — plan §4.2 + 인수 7번 회귀.

import { describe, expect, it } from 'vitest';
import { PerDriverBuffer } from '../PerDriverBuffer.js';
import {
  classifyDriverState,
  drawStateBadge,
  GAP_DISCONNECT_MS,
} from '../stateBadges.js';
import type { DriverSample } from '../interpolation.js';

function sample(date: number, x: number, y: number, s = 0): DriverSample {
  return { date, rawXY: [x, y], s, n: 0 };
}

interface MockCall {
  method: string;
  args: unknown[];
}
function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const props: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (typeof prop === 'string' && prop in props) return props[prop];
        return (...args: unknown[]) => {
          calls.push({ method: String(prop), args });
        };
      },
      set(_t, prop: string, value) {
        props[String(prop)] = value;
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('classifyDriverState — 기본 분기 (buffer-only)', () => {
  it('sample 0건 → normal (drawMarker 호출은 외부에서 건너뜀)', () => {
    const b = new PerDriverBuffer();
    expect(classifyDriverState(b, 44, 1000)).toBe('normal');
  });
  it('latest sample 가 1.5s 이하 전 → normal', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(classifyDriverState(b, 44, 1500)).toBe('normal'); // gap 500
    expect(classifyDriverState(b, 44, 2500)).toBe('normal'); // gap 1500 (경계, 초과 아님)
  });
  it('latest sample > 1.5s 전 → disconnected (plan §4.2 인수 7)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(classifyDriverState(b, 44, 2501)).toBe('disconnected');
    expect(classifyDriverState(b, 44, 5000)).toBe('disconnected');
  });
  it('GAP_DISCONNECT_MS === 1500 (plan §4.2)', () => {
    expect(GAP_DISCONNECT_MS).toBe(1500);
  });
});

describe('classifyDriverState — opts hint (Phase 12+ wire)', () => {
  it('isDnf=true → retired (다른 조건 무시)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(classifyDriverState(b, 44, 5000, { isDnf: true })).toBe('retired');
  });
  it('isInPit=true → pit-in-progress', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(classifyDriverState(b, 44, 1100, { isInPit: true })).toBe('pit-in-progress');
  });
  it('isPitStopped=true → pit-stopped (isInPit 보다 우선)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(
      classifyDriverState(b, 44, 1100, { isInPit: true, isPitStopped: true }),
    ).toBe('pit-stopped');
  });
  it('isDnf 가 pit/disconnect 보다 우선', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(1000, 100, 100));
    expect(
      classifyDriverState(b, 44, 5000, { isDnf: true, isInPit: true }),
    ).toBe('retired');
  });
});

describe('drawStateBadge', () => {
  it('disconnected → arc + fill + fillText("?")', () => {
    const { ctx, calls } = makeMockCtx();
    drawStateBadge(ctx, [100, 100], 'disconnected', { markerRadius: 10 });
    const methods = calls.map((c) => c.method);
    expect(methods).toContain('arc');
    expect(methods).toContain('fill');
    const textCall = calls.find((c) => c.method === 'fillText');
    expect(textCall?.args[0]).toBe('?');
  });
  it('normal → no-op (호출 0건)', () => {
    const { ctx, calls } = makeMockCtx();
    drawStateBadge(ctx, [100, 100], 'normal');
    expect(calls).toHaveLength(0);
  });
  it('retired/pit-* → no-op (Phase 7 MVP)', () => {
    const { ctx: c1, calls: calls1 } = makeMockCtx();
    drawStateBadge(c1, [100, 100], 'retired');
    expect(calls1).toHaveLength(0);
    const { ctx: c2, calls: calls2 } = makeMockCtx();
    drawStateBadge(c2, [100, 100], 'pit-in-progress');
    expect(calls2).toHaveLength(0);
  });
});
