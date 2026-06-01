// US-8 — totalLaps: raceDistance.json fetch + graceful degrade + 캐시 (인수 21).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetRaceDistanceCache, loadRaceDistance, totalLapsFor } from '../totalLaps';

afterEach(() => {
  _resetRaceDistanceCache();
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('loadRaceDistance', () => {
  it('정상 응답 → (circuit_key, year) 룩업', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        generated_at: '2026-05-22T01:00:00Z',
        entries: [
          { circuit_key: 63, year: 2024, total_laps: 57 },
          { circuit_key: 30, year: 2024, total_laps: 58 },
        ],
      }),
    );
    const map = await loadRaceDistance(fetchImpl as unknown as typeof fetch);
    expect(totalLapsFor(map, 63, 2024)).toBe(57);
    expect(totalLapsFor(map, 30, 2024)).toBe(58);
    expect(totalLapsFor(map, 999, 2024)).toBeNull(); // 미존재 → null (UI L??)
  });

  it('1회만 fetch (캐시)', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ entries: [] }));
    await loadRaceDistance(fetchImpl as unknown as typeof fetch);
    await loadRaceDistance(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('graceful degrade — 404 면 빈 Map (throw 안 함)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => jsonResponse({}, 404));
    const map = await loadRaceDistance(fetchImpl as unknown as typeof fetch);
    expect(map.size).toBe(0);
    expect(totalLapsFor(map, 63, 2024)).toBeNull();
  });

  it('graceful degrade — fetch reject 면 빈 Map (throw 안 함)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const map = await loadRaceDistance(fetchImpl as unknown as typeof fetch);
    expect(map.size).toBe(0);
  });
});
