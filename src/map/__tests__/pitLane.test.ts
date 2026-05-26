// src/map/pitLane.ts — plan §5.5 회귀.

import { describe, expect, it, vi } from 'vitest';
import { isInPitlane, loadPitlane, PITLANE_PROXIMITY } from '../pitLane.js';
import type { Point2D } from '../viewport.js';

const PITLANE: Point2D[] = [
  [0, 0],
  [100, 0],
  [200, 0],
];
const PITLANE_S = [0, 100, 200];

describe('loadPitlane', () => {
  it('200 OK → PitlaneJson 반환', async () => {
    const body = {
      circuit_key: 63,
      year: 2024,
      source: 'OpenF1 pit + location self-trace',
      license: 'CC0-1.0',
      polyline: [
        [0, 0],
        [100, 0],
      ],
      arc_length_table: [0, 100],
      total_length: 100,
      generated_at: '2024-01-01T00:00:00Z',
    };
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    ) as unknown as typeof fetch;
    const result = await loadPitlane(63, 2024, fetchImpl);
    expect(result?.circuit_key).toBe(63);
    expect(result?.polyline.length).toBe(2);
    expect(fetchImpl).toHaveBeenCalledWith('/trackOutlines/pitlane_63-2024.json');
  });

  it('404 → null (라이브 폴백 OK)', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await loadPitlane(63, 2024, fetchImpl)).toBeNull();
  });

  it('non-404 error 는 throw', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof fetch;
    await expect(loadPitlane(63, 2024, fetchImpl)).rejects.toThrow(/HTTP 500/);
  });
});

describe('isInPitlane', () => {
  it('polyline 위 점 → true (|n| 작음)', () => {
    expect(isInPitlane([50, 0], PITLANE, PITLANE_S)).toBe(true);
  });
  it('|n| < PITLANE_PROXIMITY 안 → true', () => {
    expect(isInPitlane([50, 5], PITLANE, PITLANE_S)).toBe(true); // n=5 < 10
  });
  it('|n| > PITLANE_PROXIMITY → false', () => {
    expect(isInPitlane([50, 50], PITLANE, PITLANE_S)).toBe(false); // n=50 > 10
  });
  it('빈 polyline → false (no-op 안전 가드)', () => {
    expect(isInPitlane([50, 5], [], [])).toBe(false);
    expect(isInPitlane([50, 5], [[0, 0]], [0])).toBe(false);
  });
  it('PITLANE_PROXIMITY === 10', () => {
    expect(PITLANE_PROXIMITY).toBe(10);
  });
});
