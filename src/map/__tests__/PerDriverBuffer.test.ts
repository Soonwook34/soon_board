// src/map/PerDriverBuffer.ts — plan §3.3 + §5.2 + 인수 6번 (가라지) 회귀.

import { describe, expect, it } from 'vitest';
import { PerDriverBuffer, SENTINEL_THRESHOLD } from '../PerDriverBuffer.js';
import type { DriverSample } from '../interpolation.js';

function sample(date: number, x: number, y: number, s = 0, n = 0): DriverSample {
  return { date, rawXY: [x, y], s, n };
}

describe('PerDriverBuffer.push — 정렬 + sentinel', () => {
  it('시간순 삽입 (append 빠른 경로)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    b.push(44, sample(300, 70, 70));
    expect(b.size(44)).toBe(3);
  });
  it('역순 push 시에도 시간순으로 정렬됨 (느린 경로 binary insert)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(300, 70, 70));
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    const pair = b.findPair(44, 150);
    expect(pair).not.toBeNull();
    expect(pair?.s1.date).toBe(100);
    expect(pair && pair.s2 && pair.s2.date).toBe(200);
  });
  it('sentinel (|x|+|y| < 50) 은 push 무시', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 10, 10)); // |x|+|y|=20 < 50 → sentinel
    b.push(44, sample(200, 100, 100)); // valid
    expect(b.size(44)).toBe(1);
    expect(b.findPair(44, 150)?.s1.date).toBe(200);
  });
  it('SENTINEL_THRESHOLD 정확히 50: |x|+|y|=49 → sentinel, =50 → 통과', () => {
    expect(SENTINEL_THRESHOLD).toBe(50);
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 24, 25)); // 49 < 50 → sentinel
    b.push(44, sample(200, 25, 25)); // 50 >= 50 → 통과
    expect(b.size(44)).toBe(1);
    expect(b.findPair(44, 150)?.s1.date).toBe(200);
  });
});

describe('PerDriverBuffer.findPair', () => {
  it('sample 0건 → null', () => {
    const b = new PerDriverBuffer();
    expect(b.findPair(44, 100)).toBeNull();
  });
  it('단일 sample → freeze (s2 = null)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    const p = b.findPair(44, 200);
    expect(p?.s2).toBeNull();
    expect(p?.s1.date).toBe(100);
  });
  it('t 가 양옆 사이 → {s1, s2}', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    b.push(44, sample(300, 70, 70));
    const p = b.findPair(44, 250);
    expect(p?.s1.date).toBe(200);
    expect(p && p.s2 && p.s2.date).toBe(300);
  });
  it('t 가 첫 sample 보다 이전 → freeze (s1 = 첫 sample, s2 = null)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    const p = b.findPair(44, 50);
    expect(p?.s1.date).toBe(100);
    expect(p?.s2).toBeNull();
  });
  it('t 가 마지막 sample 이후 → freeze', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    const p = b.findPair(44, 500);
    expect(p?.s1.date).toBe(200);
    expect(p?.s2).toBeNull();
  });
  it('차량별 독립 — 다른 driver 의 buffer 가 영향 없음', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(11, sample(200, 60, 60));
    expect(b.findPair(44, 150)?.s1.date).toBe(100);
    expect(b.findPair(11, 150)?.s1.date).toBe(200);
    expect(b.findPair(99, 150)).toBeNull();
  });
});

describe('PerDriverBuffer.trim', () => {
  it('beforeT 이전 sample 제거, 새 sample 영향 없음', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(44, sample(200, 60, 60));
    b.push(44, sample(300, 70, 70));
    b.push(44, sample(400, 80, 80));
    b.trim(250);
    // 100, 200 은 < 250 → 폐기. 300, 400 보존.
    expect(b.size(44)).toBe(2);
    expect(b.findPair(44, 350)?.s1.date).toBe(300);
  });
  it('차량별 마지막 1건은 freeze 용 항상 보존 (size ≥ 1)', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.trim(9999);
    expect(b.size(44)).toBe(1); // 마지막 1건 보존
  });
});

describe('PerDriverBuffer.drivers', () => {
  it('push 된 차량만 enumerate', () => {
    const b = new PerDriverBuffer();
    b.push(44, sample(100, 50, 50));
    b.push(11, sample(200, 60, 60));
    b.push(1, sample(300, 70, 70));
    expect([...b.drivers()].sort((a, b) => a - b)).toEqual([1, 11, 44]);
  });
});
