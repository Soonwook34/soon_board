import { promises as fs } from 'node:fs';
import path from 'node:path';

const TRADEMARK_PATTERNS = [
  /^Formula1[-_].*\.(ttf|otf|woff2?|eot)$/i,
];

const TRADEMARK_DIRS = ['font'];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.astro', '.wrangler', '.omc']);

interface Hit {
  path: string;
  reason: 'trademark-font-file' | 'trademark-font-dir';
}

export async function scanForTrademarkAssets(rootDir: string): Promise<Hit[]> {
  const hits: Hit[] = [];

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (TRADEMARK_DIRS.includes(entry.name)) {
          const inner = await fs.readdir(full);
          if (inner.length > 0) {
            hits.push({ path: full, reason: 'trademark-font-dir' });
          }
        }
        await walk(full);
      } else if (entry.isFile()) {
        if (TRADEMARK_PATTERNS.some((re) => re.test(entry.name))) {
          hits.push({ path: full, reason: 'trademark-font-file' });
        }
      }
    }
  }

  await walk(rootDir);
  return hits;
}

async function main(): Promise<void> {
  const root = process.argv[2] ?? process.cwd();
  const hits = await scanForTrademarkAssets(root);

  if (hits.length === 0) {
    console.info('[trademark-guard] clean — no Formula1-* assets or font/ contents found');
    process.exit(0);
  }

  console.error('[trademark-guard] FAILED — trademark-contaminated assets detected:');
  for (const hit of hits) {
    console.error(`  - ${hit.path} (${hit.reason})`);
  }
  console.error('');
  console.error('These files MUST NOT be committed (see THIRD_PARTY_LICENSES.md).');
  console.error('Remove them, then add to .gitignore. F1/FOM typefaces are proprietary and');
  console.error('cannot be redistributed under SOON BOARD\'s non-commercial fan license.');
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[trademark-guard] error:', err);
    process.exit(2);
  });
}
