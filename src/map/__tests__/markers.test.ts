// src/map/markers.ts — plan §4.1 + §4.5.2 회귀.

import { describe, expect, it } from 'vitest';
import { drawMarker, drawSlmIndicator } from '../markers.js';
import { mapStyles } from '../mapStyles.js';

interface MockCall {
  method: string;
  args: unknown[];
}

function makeMockCtx(): { ctx: CanvasRenderingContext2D; calls: MockCall[] } {
  const calls: MockCall[] = [];
  const props: Record<string, unknown> = {};
  const record =
    (method: string) =>
    (...args: unknown[]): void => {
      calls.push({ method, args });
    };
  const ctx = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (typeof prop === 'string' && prop in props) return props[prop];
        return record(String(prop));
      },
      set(_target, prop: string, value) {
        props[String(prop)] = value;
        calls.push({ method: `set:${String(prop)}`, args: [value] });
        return true;
      },
    },
  ) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('drawMarker — normal state', () => {
  it('arc + fill + stroke + driver_number fillText 호출 (showLabel=false 면 라벨 없음)', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
    });
    const methods = calls.map((c) => c.method);
    // 순서: beginPath → arc → set:fillStyle (teamColour) → fill → set:strokeStyle → set:lineWidth → stroke → set:fillStyle (border color) → fillText (number)
    expect(methods.indexOf('beginPath')).toBeLessThan(methods.indexOf('arc'));
    expect(methods.indexOf('arc')).toBeLessThan(methods.indexOf('fill'));
    expect(methods.indexOf('fill')).toBeLessThan(methods.indexOf('stroke'));
    const fillTextCalls = calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(1);
    expect(fillTextCalls[0].args[0]).toBe('44');
  });

  it('showLabel=true 면 라벨 fillText 한 번 더 호출 (총 2회)', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: true,
    });
    const fillTextCalls = calls.filter((c) => c.method === 'fillText');
    expect(fillTextCalls).toHaveLength(2);
    expect(fillTextCalls[0].args[0]).toBe('44');
    expect(fillTextCalls[1].args[0]).toBe('HAM');
  });

  it('teamColour 가 ctx.fillStyle 로 설정됨', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#3671c6',
      driverNumber: 1,
      nameAcronym: 'VER',
      showLabel: false,
    });
    const fillStyleSet = calls.filter((c) => c.method === 'set:fillStyle');
    expect(fillStyleSet[0].args[0]).toBe('#3671c6'); // 첫 번째는 team color
  });

  it('size 미지정 시 mapStyles.markerSizeMin 사용', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#fff',
      driverNumber: 1,
      nameAcronym: 'VER',
      showLabel: false,
    });
    const arcCall = calls.find((c) => c.method === 'arc');
    // arc(x, y, radius, 0, 2π) — radius = markerSizeMin / 2
    expect(arcCall?.args[2]).toBe(mapStyles.markerSizeMin / 2);
  });

  it('size 명시 시 그 값 사용', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#fff',
      driverNumber: 1,
      nameAcronym: 'VER',
      showLabel: false,
      size: 28,
    });
    const arcCall = calls.find((c) => c.method === 'arc');
    expect(arcCall?.args[2]).toBe(14);
  });

  it('라벨 위치 — 마커 아래 chip 안 (y + radius + labelOffsetPx + labelChipPaddingY)', () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#fff',
      driverNumber: 1,
      nameAcronym: 'VER',
      showLabel: true,
      size: 20,
    });
    const fillTextCalls = calls.filter((c) => c.method === 'fillText');
    const labelCall = fillTextCalls[1];
    // y=200, radius=10, labelOffsetPx + labelChipPaddingY → chip 내부 텍스트 baseline.
    const expected = 200 + 10 + mapStyles.labelOffsetPx + mapStyles.labelChipPaddingY;
    expect(labelCall.args[2]).toBe(expected);
  });
});

describe('drawSlmIndicator — placeholder (plan §4.5.2)', () => {
  it('데이터 입수 전 항상 false', () => {
    expect(drawSlmIndicator(44, true)).toBe(false);
    expect(drawSlmIndicator(1, false)).toBe(false);
  });
});

describe('drawMarker — state 분기 (Phase 7)', () => {
  it("state='disconnected' → globalAlpha=0.5 + save/restore 로 격리 (이전 'set 1' 패턴 대체)", () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
      state: 'disconnected',
    });
    const methods = calls.map((c) => c.method);
    const alphas = calls.filter((c) => c.method === 'set:globalAlpha').map((c) => c.args[0]);
    expect(alphas).toEqual([mapStyles.disconnectedAlpha]); // 0.5 만 set, 복원은 restore() 가 처리
    expect(methods).toContain('save');
    expect(methods).toContain('restore');
    expect(methods.indexOf('save')).toBeLessThan(methods.indexOf('set:globalAlpha'));
    expect(methods.lastIndexOf('restore')).toBeGreaterThan(methods.indexOf('set:globalAlpha'));
  });
  it("state='retired' → fill 이 retiredFill (textMuted), teamColour 무시", () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
      state: 'retired',
    });
    const firstFillStyle = calls.find((c) => c.method === 'set:fillStyle');
    expect(firstFillStyle?.args[0]).toBe(mapStyles.retiredFill);
  });
  it("state='normal' (default) → 기존 동작 유지, globalAlpha 미변경", () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
    });
    const alphas = calls.filter((c) => c.method === 'set:globalAlpha');
    expect(alphas).toHaveLength(0);
  });

  it("state='pit-in-progress' → setLineDash([3,2]) 호출 + 종료 시 reset ([])", () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
      state: 'pit-in-progress',
    });
    const dashCalls = calls.filter((c) => c.method === 'setLineDash').map((c) => c.args[0]);
    expect(dashCalls).toEqual([[3, 2], []]);
  });

  it('A1 회귀 — drawMarker 가 save/restore 로 ctx state 격리 (모든 state 에서)', () => {
    for (const state of ['normal', 'disconnected', 'retired', 'pit-in-progress', 'pit-stopped'] as const) {
      const { ctx, calls } = makeMockCtx();
      drawMarker(ctx, {
        position: [100, 200],
        teamColour: '#ff0000',
        driverNumber: 44,
        nameAcronym: 'HAM',
        showLabel: false,
        state,
      });
      const methods = calls.map((c) => c.method);
      expect(methods[0]).toBe('save');
      expect(methods[methods.length - 1]).toBe('restore');
    }
  });

  it("state='pit-stopped' → arc radius = markerSizeMin × pitStoppedScale / 2", () => {
    const { ctx, calls } = makeMockCtx();
    drawMarker(ctx, {
      position: [100, 200],
      teamColour: '#ff0000',
      driverNumber: 44,
      nameAcronym: 'HAM',
      showLabel: false,
      state: 'pit-stopped',
    });
    const arc = calls.find((c) => c.method === 'arc');
    expect(arc?.args[2]).toBeCloseTo((mapStyles.markerSizeMin * mapStyles.pitStoppedScale) / 2);
  });
});
