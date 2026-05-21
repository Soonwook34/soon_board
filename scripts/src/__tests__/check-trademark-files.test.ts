import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanForTrademarkAssets } from '../check-trademark-files.js';

describe('scanForTrademarkAssets', () => {
  let tmpRoot: string;

  beforeEach(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'soon-board-trademark-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('returns no hits on a clean repo', async () => {
    await fs.writeFile(path.join(tmpRoot, 'README.md'), '# clean');
    await fs.mkdir(path.join(tmpRoot, 'apps', 'web', 'public', 'fonts'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRoot, 'apps', 'web', 'public', 'fonts', 'Orbitron-Regular.woff2'),
      'fake',
    );
    await fs.writeFile(
      path.join(tmpRoot, 'apps', 'web', 'public', 'fonts', 'Orbit-Regular.woff2'),
      'fake',
    );

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits).toEqual([]);
  });

  it('detects a planted Formula1-Bold.ttf', async () => {
    await fs.mkdir(path.join(tmpRoot, 'apps', 'web', 'public', 'fonts'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRoot, 'apps', 'web', 'public', 'fonts', 'Formula1-Bold.ttf'),
      'fake-trademark-asset',
    );

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits.length).toBe(1);
    expect(hits[0].reason).toBe('trademark-font-file');
    expect(hits[0].path).toContain('Formula1-Bold.ttf');
  });

  it('detects Formula1-* files in any directory depth', async () => {
    await fs.mkdir(path.join(tmpRoot, 'a', 'b', 'c'), { recursive: true });
    await fs.writeFile(path.join(tmpRoot, 'a', 'b', 'c', 'Formula1-Black.woff2'), 'fake');

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits.length).toBe(1);
    expect(hits[0].path).toContain('Formula1-Black.woff2');
  });

  it('detects a non-empty font/ directory at repo root', async () => {
    await fs.mkdir(path.join(tmpRoot, 'font'), { recursive: true });
    await fs.writeFile(path.join(tmpRoot, 'font', 'placeholder.txt'), 'anything');

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits.some((h) => h.reason === 'trademark-font-dir')).toBe(true);
  });

  it('ignores skip-listed directories (node_modules, .git, dist)', async () => {
    await fs.mkdir(path.join(tmpRoot, 'node_modules', 'sub'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRoot, 'node_modules', 'sub', 'Formula1-Bold.ttf'),
      'transitive dep should not flag',
    );

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits).toEqual([]);
  });

  it('is case-insensitive on the Formula1 prefix', async () => {
    await fs.writeFile(path.join(tmpRoot, 'formula1-italic.otf'), 'fake');

    const hits = await scanForTrademarkAssets(tmpRoot);

    expect(hits.length).toBe(1);
  });
});
