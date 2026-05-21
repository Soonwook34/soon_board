import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Fetch SOON BOARD self-hosted webfonts from Google Fonts CSS API
 * and write them to apps/web/public/fonts/ with a lockfile of hashes + sizes.
 *
 * Plan v2.3 §1.3 — Orbitron + Orbit + JetBrains Mono. Total budget ≤ 1.5 MB (warn at 1.0 MB).
 */

export interface FontSpec {
  family: string;
  weights: number[];
  subset?: string;
  styles?: string[];
}

export interface FontFile {
  family: string;
  weight: number;
  style: string;
  url: string;
  filename: string;
  bytes: number;
  sha256: string;
}

export interface FontsLock {
  generated_at: string;
  user_agent: string;
  total_bytes: number;
  budget_warn_bytes: number;
  budget_fail_bytes: number;
  files: FontFile[];
}

export const FONT_SPECS: FontSpec[] = [
  { family: 'Orbitron', weights: [400, 700, 900] },
  { family: 'Orbit', weights: [400, 700], subset: 'korean' },
  { family: 'JetBrains Mono', weights: [400, 500] },
];

const GOOGLE_FONTS_CSS_BASE = 'https://fonts.googleapis.com/css2';
// Modern UA tricks Google CSS API into serving woff2 URLs (not older formats).
export const GOOGLE_FONTS_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const BUDGET_WARN_BYTES = 1_000_000; // 1 MB
export const BUDGET_FAIL_BYTES = 1_500_000; // 1.5 MB

export function buildCssUrl(spec: FontSpec): string {
  const familyParam = `family=${spec.family.replace(/ /g, '+')}:wght@${spec.weights.join(';')}`;
  const subsetParam = spec.subset ? `&subset=${spec.subset}` : '';
  return `${GOOGLE_FONTS_CSS_BASE}?${familyParam}&display=swap${subsetParam}`;
}

interface CssEntry {
  url: string;
  weight: number;
  style: string;
}

export function parseGoogleCssToWoff2Urls(css: string): CssEntry[] {
  const blocks = css.split('@font-face').slice(1);
  const out: CssEntry[] = [];

  for (const block of blocks) {
    const weightMatch = block.match(/font-weight:\s*(\d+)/);
    const styleMatch = block.match(/font-style:\s*(\w+)/);
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)\s*format\(['"]woff2['"]\)/);
    if (urlMatch && weightMatch) {
      out.push({
        url: urlMatch[1],
        weight: Number(weightMatch[1]),
        style: styleMatch?.[1] ?? 'normal',
      });
    }
  }

  return out;
}

export function makeFontFilename(family: string, weight: number, style: string): string {
  const slug = family.replace(/ /g, '');
  const weightName =
    {
      400: 'Regular',
      500: 'Medium',
      600: 'SemiBold',
      700: 'Bold',
      800: 'ExtraBold',
      900: 'Black',
    }[weight] ?? String(weight);
  const styleName = style === 'italic' ? 'Italic' : '';
  return `${slug}-${weightName}${styleName}.woff2`;
}

export async function fetchOne(
  spec: FontSpec,
  outDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FontFile[]> {
  const cssUrl = buildCssUrl(spec);
  const cssRes = await fetchImpl(cssUrl, { headers: { 'User-Agent': GOOGLE_FONTS_UA } });
  if (!cssRes.ok) {
    throw new Error(`[fetch-fonts] CSS request failed for ${spec.family}: ${cssRes.status}`);
  }
  const css = await cssRes.text();
  const entries = parseGoogleCssToWoff2Urls(css);

  if (entries.length === 0) {
    throw new Error(
      `[fetch-fonts] no woff2 URLs found in CSS response for ${spec.family}. ` +
        `The font may not exist on Google Fonts (verify https://fonts.google.com/specimen/${encodeURIComponent(
          spec.family,
        )}).`,
    );
  }

  // Filter to only the weights we asked for (the API may return more for fallback).
  const wanted = entries.filter((e) => spec.weights.includes(e.weight));
  const files: FontFile[] = [];

  for (const entry of wanted) {
    const woffRes = await fetchImpl(entry.url);
    if (!woffRes.ok) {
      throw new Error(`[fetch-fonts] woff2 fetch failed: ${woffRes.status} ${entry.url}`);
    }
    const buf = Buffer.from(await woffRes.arrayBuffer());
    const filename = makeFontFilename(spec.family, entry.weight, entry.style);
    const outPath = path.join(outDir, filename);
    await fs.writeFile(outPath, buf);

    const sha256 = createHash('sha256').update(buf).digest('hex');

    files.push({
      family: spec.family,
      weight: entry.weight,
      style: entry.style,
      url: entry.url,
      filename,
      bytes: buf.byteLength,
      sha256,
    });
  }

  return files;
}

export async function fetchAllFonts(
  outDir: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FontsLock> {
  await fs.mkdir(outDir, { recursive: true });
  const allFiles: FontFile[] = [];

  for (const spec of FONT_SPECS) {
    const files = await fetchOne(spec, outDir, fetchImpl);
    allFiles.push(...files);
  }

  const totalBytes = allFiles.reduce((acc, f) => acc + f.bytes, 0);

  if (totalBytes > BUDGET_FAIL_BYTES) {
    throw new Error(
      `[fetch-fonts] total font bytes ${totalBytes} exceeds fail budget ${BUDGET_FAIL_BYTES} (Plan AC-20b).`,
    );
  }

  return {
    generated_at: new Date().toISOString(),
    user_agent: GOOGLE_FONTS_UA,
    total_bytes: totalBytes,
    budget_warn_bytes: BUDGET_WARN_BYTES,
    budget_fail_bytes: BUDGET_FAIL_BYTES,
    files: allFiles,
  };
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(process.cwd());
  const outDir = path.join(repoRoot, 'apps', 'web', 'public', 'fonts');
  const lockPath = path.join(outDir, 'fonts.lock.json');

  console.info(`[fetch-fonts] writing fonts to ${outDir}`);
  const lock = await fetchAllFonts(outDir);
  await fs.writeFile(lockPath, JSON.stringify(lock, null, 2) + '\n');
  console.info(`[fetch-fonts] wrote ${lock.files.length} files, total ${lock.total_bytes} bytes`);
  if (lock.total_bytes > BUDGET_WARN_BYTES) {
    console.warn(
      `[fetch-fonts] WARN total ${lock.total_bytes}B exceeds soft budget ${BUDGET_WARN_BYTES}B (Plan AC-20b).`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[fetch-fonts]', err);
    process.exit(1);
  });
}
