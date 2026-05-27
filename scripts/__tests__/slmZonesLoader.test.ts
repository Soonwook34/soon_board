import { describe, expect, it } from 'vitest';
import { loadSlmZonesFromRaw, type SlmRawFile } from '../_lib/slmZonesLoader.js';

const RAW: SlmRawFile = {
  license: 'FIA',
  circuits: [
    {
      circuit_key: 63,
      year: 2026,
      zones: [
        { description: 'T4 → T5', s_start_hint: 1200, s_end_hint: 1800, label: 'Zone A' },
        { description: 'T8 → T9', s_start_hint: 3000, s_end_hint: 3600 },
      ],
    },
    { circuit_key: 99, year: 2026, zones: [] },
  ],
};

describe('loadSlmZonesFromRaw', () => {
  it('converts raw hints to SlmZone[] with sequential ids', () => {
    const zones = loadSlmZonesFromRaw({ raw: RAW, circuit_key: 63, year: 2026, totalLength: 5000 });
    expect(zones).not.toBeNull();
    expect(zones).toHaveLength(2);
    expect(zones![0]).toEqual({ id: 1, s_start: 1200, s_end: 1800, label: 'Zone A' });
    expect(zones![1]).toEqual({ id: 2, s_start: 3000, s_end: 3600 });
  });

  it('returns null when (key, year) not found in raw', () => {
    expect(
      loadSlmZonesFromRaw({ raw: RAW, circuit_key: 100, year: 2026, totalLength: 5000 }),
    ).toBeNull();
  });

  it('returns empty array when entry has zero zones', () => {
    const zones = loadSlmZonesFromRaw({ raw: RAW, circuit_key: 99, year: 2026, totalLength: 5000 });
    expect(zones).toEqual([]);
  });

  it('clamps negative s_start to 0 and over-length s_end to totalLength', () => {
    const odd: SlmRawFile = {
      circuits: [
        {
          circuit_key: 1,
          year: 2026,
          zones: [{ s_start_hint: -100, s_end_hint: 99999 }],
        },
      ],
    };
    const zones = loadSlmZonesFromRaw({ raw: odd, circuit_key: 1, year: 2026, totalLength: 5000 });
    expect(zones![0].s_start).toBe(0);
    expect(zones![0].s_end).toBe(5000);
  });
});
