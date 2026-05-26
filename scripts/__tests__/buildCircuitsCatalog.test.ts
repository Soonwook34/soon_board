// scripts/build-circuits-catalog.ts — OpenF1 sessions → (key, year) 후보 enumeration 회귀.

import { describe, expect, it, vi } from 'vitest';
import { buildCircuitsCatalog, parseCliArgs } from '../build-circuits-catalog.js';
import type { OpenF1Client } from '../_lib/openf1Client.js';

function makeClient(sessionsByYear: Record<number, unknown[]>): { client: OpenF1Client; yearCalls: number[] } {
  const yearCalls: number[] = [];
  const get = vi.fn(async (path: string, params?: Record<string, unknown>) => {
    if (path !== '/v1/sessions') throw new Error(`mock: unexpected ${path}`);
    const year = Number(params?.year);
    yearCalls.push(year);
    return sessionsByYear[year] ?? [];
  });
  return { client: { get } as unknown as OpenF1Client, yearCalls };
}

describe('build-circuits-catalog — dedup + sort', () => {
  it('2 year × 3 sessions (1 중복 (key, year)) → 3 entries + session_count 정확', async () => {
    const { client } = makeClient({
      2023: [
        { session_key: 100, circuit_key: 63, circuit_short_name: 'Sakhir', country_name: 'Bahrain', year: 2023 },
        { session_key: 101, circuit_key: 63, circuit_short_name: 'Sakhir', country_name: 'Bahrain', year: 2023 }, // 같은 (63, 2023) — Practice + Race 등
        { session_key: 200, circuit_key: 70, circuit_short_name: 'Yas Marina', country_name: 'UAE', year: 2023 },
      ],
      2024: [
        { session_key: 300, circuit_key: 63, circuit_short_name: 'Sakhir', country_name: 'Bahrain', year: 2024 },
      ],
    });
    const result = await buildCircuitsCatalog({
      from: 2023,
      to: 2024,
      client,
      now: new Date('2026-05-27T00:00:00.000Z'),
    });

    expect(result.entries).toHaveLength(3);
    expect(result.entries.map((e) => `${e.circuit_key}-${e.year}`)).toEqual([
      '63-2023',
      '63-2024',
      '70-2023',
    ]);

    const sakhir23 = result.entries.find((e) => e.circuit_key === 63 && e.year === 2023)!;
    expect(sakhir23.session_count).toBe(2);
    expect(sakhir23.first_session_key).toBe(100); // 둘 중 작은 값
    expect(result.source).toBe('OpenF1 sessions');
    expect(result.generated_at).toBe('2026-05-27T00:00:00.000Z');
  });
});

describe('build-circuits-catalog — year range', () => {
  it('--from=2024 --to=2024 → 단 1 year 만 호출', async () => {
    const { client, yearCalls } = makeClient({
      2024: [
        { session_key: 1, circuit_key: 63, circuit_short_name: 'Sakhir', country_name: 'Bahrain', year: 2024 },
      ],
    });
    await buildCircuitsCatalog({ from: 2024, to: 2024, client });
    expect(yearCalls).toEqual([2024]);
  });

  it('from > to → throw', async () => {
    const { client } = makeClient({});
    await expect(buildCircuitsCatalog({ from: 2025, to: 2024, client })).rejects.toThrow(/from/);
  });
});

describe('build-circuits-catalog — empty result', () => {
  it('빈 sessions → entries=[] (정상)', async () => {
    const { client } = makeClient({});
    const r = await buildCircuitsCatalog({ from: 2023, to: 2023, client });
    expect(r.entries).toEqual([]);
  });
});

describe('parseCliArgs', () => {
  it('--from + --to + --output', () => {
    const a = parseCliArgs(['--from=2024', '--to=2026', '--output=foo.json']);
    expect(a).toEqual({ from: 2024, to: 2026, output: 'foo.json' });
  });

  it('인자 없음', () => {
    expect(parseCliArgs([])).toEqual({});
  });
});
