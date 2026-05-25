// scripts/fetch-circuit-maps.ts 통합 테스트 — 합성 SVG 로 buildAll() 전체 흐름 검증.
// submodule 없이 tmp vendor 디렉토리에 SVG 를 쓴 뒤 산출물·인덱스를 확인한다.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAll,
  parseCliArgs,
  readCircuitsConfig,
  svgPathFor,
  type CircuitsConfig,
  type TrackOutlineJson,
} from '../fetch-circuit-maps.js';
import type { TrackOutlinesIndex } from '../_lib/trackOutlinesIndex.js';

const SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <path d="M0,0 L100,0 L100,100 L0,100 Z" stroke="white" fill="none"/>
</svg>`;

const VARIANT = 'minimal/white-outline';

let vendorRoot: string;
let outputDir: string;
let configPath: string;

const NOW = new Date('2026-05-26T00:00:00.000Z');

function writeVendorSvg(layoutId: string): void {
  const dir = join(vendorRoot, 'circuits', VARIANT);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${layoutId}.svg`), SQUARE_SVG);
}

function writeConfig(config: CircuitsConfig): void {
  writeFileSync(configPath, JSON.stringify(config));
}

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'fetch-circuit-maps-'));
  vendorRoot = join(root, 'vendor', 'f1-circuits-svg');
  outputDir = join(root, 'public', 'trackOutlines');
  configPath = join(root, 'circuits.json');
  mkdirSync(outputDir, { recursive: true });
});

afterEach(() => {
  // tmpdir 전체 root 제거. mkdtempSync 의 상위만 알 수 있어 vendorRoot 의 두 단계 위.
  rmSync(join(vendorRoot, '..', '..'), { recursive: true, force: true });
});

describe('parseCliArgs', () => {
  it('parses --key/--year/--step', () => {
    expect(parseCliArgs(['--key=63', '--year=2024', '--step=1.5'])).toEqual({
      filter: { circuit_key: 63, year: 2024 },
      stepUnits: 1.5,
    });
  });
  it('handles empty args (no filter)', () => {
    expect(parseCliArgs([])).toEqual({ filter: {}, stepUnits: undefined });
  });
  it('ignores unrecognized args silently', () => {
    expect(parseCliArgs(['--unknown=foo', '--key=63'])).toEqual({
      filter: { circuit_key: 63 },
      stepUnits: undefined,
    });
  });
});

describe('svgPathFor', () => {
  it('joins vendor + variant + layoutId.svg', () => {
    const p = svgPathFor('/vendor/foo', 'minimal/white-outline', 'bahrain-1');
    expect(p).toBe('/vendor/foo/circuits/minimal/white-outline/bahrain-1.svg');
  });
});

describe('readCircuitsConfig', () => {
  it('reads valid config', () => {
    writeConfig({
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
        },
      ],
    });
    const cfg = readCircuitsConfig(configPath);
    expect(cfg.circuits).toHaveLength(1);
    expect(cfg.circuits[0].circuit_key).toBe(63);
  });

  it('throws on missing circuits array', () => {
    writeFileSync(configPath, JSON.stringify({ default_variant: VARIANT }));
    expect(() => readCircuitsConfig(configPath)).toThrow(/circuits/);
  });

  it('throws on missing default_variant', () => {
    writeFileSync(configPath, JSON.stringify({ circuits: [] }));
    expect(() => readCircuitsConfig(configPath)).toThrow(/default_variant/);
  });
});

describe('buildAll', () => {
  it('builds one circuit and writes track JSON + index', () => {
    writeVendorSvg('bahrain-1');
    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
          direction: 'clockwise',
        },
      ],
    };

    const result = buildAll(cfg, { vendorRoot, outputDir, stepUnits: 10 }, NOW);

    expect(result.built).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);

    const out = JSON.parse(
      readFileSync(join(outputDir, '63-2024.json'), 'utf8'),
    ) as TrackOutlineJson;
    expect(out.circuit_key).toBe(63);
    expect(out.year).toBe(2024);
    expect(out.source).toBe('julesr0y/f1-circuits-svg');
    expect(out.source_file).toBe(`circuits/${VARIANT}/bahrain-1.svg`);
    expect(out.license).toBe('CC-BY-4.0');
    expect(out.viewBox).toEqual([0, 0, 100, 100]);
    expect(out.total_length).toBeCloseTo(400, 1);
    expect(out.polyline.length).toBeGreaterThan(0);
    expect(out.polyline.length).toBe(out.arc_length_table.length);
    expect(out.start_finish_index).toBe(0);
    expect(out.direction).toBe('clockwise');
    expect(out.generated_at).toBe(NOW.toISOString());

    const idx = JSON.parse(
      readFileSync(join(outputDir, 'index.json'), 'utf8'),
    ) as TrackOutlinesIndex;
    expect(idx.entries).toHaveLength(1);
    expect(idx.entries[0].circuit_key).toBe(63);
    expect(idx.entries[0].track).toBe(true);
    expect(idx.entries[0].pitlane).toBe(false);
    expect(idx.entries[0].openf1_transform_confidence).toBeNull();
  });

  it('skips entries when SVG file missing (clear error message)', () => {
    // No vendor SVG written
    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 999,
          circuit_short_name: 'Missing',
          country_name: 'Nowhere',
          year: 2024,
          julesr0y_layout_id: 'missing-1',
        },
      ],
    };
    const result = buildAll(cfg, { vendorRoot, outputDir, stepUnits: 10 }, NOW);
    expect(result.built).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/submodule update --init/);
  });

  it('applies --key/--year filter (single entry)', () => {
    writeVendorSvg('bahrain-1');
    writeVendorSvg('yas-marina-2');
    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
        },
        {
          circuit_key: 70,
          circuit_short_name: 'Yas Marina',
          country_name: 'UAE',
          year: 2024,
          julesr0y_layout_id: 'yas-marina-2',
        },
      ],
    };
    const result = buildAll(
      cfg,
      { vendorRoot, outputDir, filter: { circuit_key: 63 }, stepUnits: 10 },
      NOW,
    );
    expect(result.built.map((b) => b.circuit_key)).toEqual([63]);
  });

  it('throws when filter matches no entries', () => {
    writeVendorSvg('bahrain-1');
    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
        },
      ],
    };
    expect(() =>
      buildAll(cfg, { vendorRoot, outputDir, filter: { circuit_key: 999 } }, NOW),
    ).toThrow(/No circuits matched/);
  });

  it('preserves other entries in index when upserting one', () => {
    writeVendorSvg('bahrain-1');
    const seedIdx: TrackOutlinesIndex = {
      generated_at: '2026-05-22T00:00:00.000Z',
      source: 'julesr0y/f1-circuits-svg',
      license: 'CC-BY-4.0',
      entries: [
        {
          circuit_key: 70,
          year: 2021,
          track: true,
          pitlane: false,
          openf1_transform_confidence: 0.92,
          generated_at: '2026-05-22T00:00:00.000Z',
        },
      ],
    };
    writeFileSync(join(outputDir, 'index.json'), JSON.stringify(seedIdx));

    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
        },
      ],
    };
    buildAll(cfg, { vendorRoot, outputDir, stepUnits: 10 }, NOW);

    const idx = JSON.parse(
      readFileSync(join(outputDir, 'index.json'), 'utf8'),
    ) as TrackOutlinesIndex;
    expect(idx.entries).toHaveLength(2);
    // sorted by circuit_key
    expect(idx.entries[0].circuit_key).toBe(63);
    expect(idx.entries[1].circuit_key).toBe(70);
    expect(idx.entries[1].openf1_transform_confidence).toBe(0.92); // preserved
  });

  it('honors entry-level variant override', () => {
    const altVariant = 'detailed/white-outline';
    mkdirSync(join(vendorRoot, 'circuits', altVariant), { recursive: true });
    writeFileSync(join(vendorRoot, 'circuits', altVariant, 'bahrain-1.svg'), SQUARE_SVG);

    const cfg: CircuitsConfig = {
      default_variant: VARIANT,
      circuits: [
        {
          circuit_key: 63,
          circuit_short_name: 'Sakhir',
          country_name: 'Bahrain',
          year: 2024,
          julesr0y_layout_id: 'bahrain-1',
          variant: altVariant,
        },
      ],
    };
    const result = buildAll(cfg, { vendorRoot, outputDir, stepUnits: 10 }, NOW);
    expect(result.built).toHaveLength(1);

    const out = JSON.parse(
      readFileSync(join(outputDir, '63-2024.json'), 'utf8'),
    ) as TrackOutlineJson;
    expect(out.source_file).toBe(`circuits/${altVariant}/bahrain-1.svg`);
  });
});
