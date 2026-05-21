import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCssUrl,
  fetchAllFonts,
  FONT_SPECS,
  makeFontFilename,
  parseGoogleCssToWoff2Urls,
} from '../fetch-fonts.js';

describe('buildCssUrl', () => {
  it('builds Orbitron URL with all weights', () => {
    const url = buildCssUrl({ family: 'Orbitron', weights: [400, 700, 900] });
    expect(url).toBe(
      'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap',
    );
  });

  it('includes subset for Orbit Korean', () => {
    const url = buildCssUrl({ family: 'Orbit', weights: [400, 700], subset: 'korean' });
    expect(url).toContain('family=Orbit:wght@400;700');
    expect(url).toContain('&subset=korean');
  });

  it('URL-encodes multi-word families', () => {
    const url = buildCssUrl({ family: 'JetBrains Mono', weights: [400, 500] });
    expect(url).toContain('family=JetBrains+Mono');
  });
});

describe('parseGoogleCssToWoff2Urls', () => {
  it('parses well-formed @font-face blocks', () => {
    const css = `
      /* latin */
      @font-face {
        font-family: 'Orbitron';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/orbitron/v31/yMJMMIlzdpvBhQQL_SC3X9yhF25.woff2) format('woff2');
      }
      @font-face {
        font-family: 'Orbitron';
        font-style: normal;
        font-weight: 900;
        font-display: swap;
        src: url(https://fonts.gstatic.com/s/orbitron/v31/yMJMMIlzdpvBhQQL_SC3X9yhF26.woff2) format('woff2');
      }
    `;

    const out = parseGoogleCssToWoff2Urls(css);

    expect(out).toHaveLength(2);
    expect(out[0].weight).toBe(400);
    expect(out[0].url).toMatch(/^https:\/\/fonts\.gstatic\.com\/.*\.woff2$/);
    expect(out[1].weight).toBe(900);
  });

  it('returns empty array when family unknown / response empty', () => {
    expect(parseGoogleCssToWoff2Urls('')).toEqual([]);
    expect(parseGoogleCssToWoff2Urls('/* nothing useful */')).toEqual([]);
  });
});

describe('makeFontFilename', () => {
  it.each([
    ['Orbitron', 400, 'normal', 'Orbitron-Regular.woff2'],
    ['Orbitron', 700, 'normal', 'Orbitron-Bold.woff2'],
    ['Orbitron', 900, 'normal', 'Orbitron-Black.woff2'],
    ['Orbit', 400, 'normal', 'Orbit-Regular.woff2'],
    ['JetBrains Mono', 500, 'normal', 'JetBrainsMono-Medium.woff2'],
    ['Orbitron', 400, 'italic', 'Orbitron-RegularItalic.woff2'],
  ])('maps %s %s %s → %s', (family, weight, style, expected) => {
    expect(makeFontFilename(family, weight as number, style)).toBe(expected);
  });
});

describe('fetchAllFonts', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'soon-board-fonts-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('writes woff2 files and a lockfile within budget', async () => {
    const fakeWoff2 = Buffer.from('FAKE_WOFF2_PAYLOAD');
    const cssFor = (family: string, weights: number[]): string =>
      weights
        .map(
          (w) => `@font-face {
            font-family: '${family}';
            font-style: normal;
            font-weight: ${w};
            font-display: swap;
            src: url(https://fonts.gstatic.com/${family}-${w}.woff2) format('woff2');
          }`,
        )
        .join('\n');

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('fonts.googleapis.com/css2')) {
        const familyMatch = url.match(/family=([^:&]+):wght@([\d;]+)/);
        const family = familyMatch?.[1].replace(/\+/g, ' ') ?? 'Unknown';
        const weights = (familyMatch?.[2].split(';') ?? []).map(Number);
        return new Response(cssFor(family, weights), {
          status: 200,
          headers: { 'Content-Type': 'text/css' },
        });
      }
      if (url.endsWith('.woff2')) {
        return new Response(fakeWoff2, { status: 200 });
      }
      throw new Error(`unhandled fetch ${url}`);
    });

    const lock = await fetchAllFonts(tmpDir, fetchImpl as unknown as typeof fetch);

    // Expected: 3 Orbitron + 2 Orbit + 2 JetBrains Mono = 7 files.
    const totalWeights = FONT_SPECS.reduce((acc, s) => acc + s.weights.length, 0);
    expect(lock.files).toHaveLength(totalWeights);
    expect(lock.total_bytes).toBe(fakeWoff2.byteLength * totalWeights);

    // Every file landed on disk with the expected name.
    for (const file of lock.files) {
      const stat = await fs.stat(path.join(tmpDir, file.filename));
      expect(stat.size).toBe(file.bytes);
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('throws when CSS response contains no woff2', async () => {
    const fetchImpl = vi.fn(async () => new Response('/* no @font-face */', { status: 200 }));

    await expect(fetchAllFonts(tmpDir, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /no woff2 URLs found/,
    );
  });

  it('rejects when total size exceeds fail budget', async () => {
    // Make a "woff2" payload large enough to blow the 1.5 MB budget once × 7 files.
    const bigPayload = Buffer.alloc(300_000, 0x42); // 300 KB × 7 = 2.1 MB
    const cssFor = (family: string, weights: number[]): string =>
      weights
        .map(
          (w) => `@font-face {
            font-family: '${family}';
            font-style: normal;
            font-weight: ${w};
            font-display: swap;
            src: url(https://example/${family}-${w}.woff2) format('woff2');
          }`,
        )
        .join('\n');

    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('fonts.googleapis.com/css2')) {
        const m = url.match(/family=([^:&]+):wght@([\d;]+)/);
        const family = m?.[1].replace(/\+/g, ' ') ?? '';
        const weights = (m?.[2].split(';') ?? []).map(Number);
        return new Response(cssFor(family, weights), { status: 200 });
      }
      return new Response(bigPayload, { status: 200 });
    });

    await expect(fetchAllFonts(tmpDir, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /exceeds fail budget/,
    );
  });
});
