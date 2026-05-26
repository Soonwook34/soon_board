// daily-data-refresh.yml 구조 검증 — plan main-page-implementation.md §12 단계 12 / 인수 15.
// GitHub Actions YAML은 런타임에서 실행되지 않으므로 의도된 cron, concurrency,
// permissions, step shape, 미구현 스크립트 가드 등이 회귀 없이 보존되는지 텍스트로 확인.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const yml = readFileSync(
  resolve(__dirname, '..', '..', '.github', 'workflows', 'daily-data-refresh.yml'),
  'utf8',
);

describe('daily-data-refresh.yml', () => {
  it('runs on cron 01:00 UTC daily plus manual workflow_dispatch', () => {
    expect(yml).toMatch(/cron:\s*'0 1 \* \* \*'/);
    expect(yml).toContain('workflow_dispatch:');
  });

  it('declares contents: write permission for the commit step', () => {
    expect(yml).toMatch(/permissions:\s*[\s\S]*?contents:\s*write/);
  });

  it('uses concurrency group data-refresh with cancel-in-progress: false', () => {
    expect(yml).toMatch(/concurrency:\s*[\s\S]*?group:\s*data-refresh/);
    expect(yml).toMatch(/cancel-in-progress:\s*false/);
  });

  it('uses Node 20 with npm cache', () => {
    expect(yml).toContain('node-version: 20');
    expect(yml).toContain('cache: npm');
    expect(yml).toContain('npm ci');
  });

  it('invokes fetch-season-catalog via tsx with --all (batch mode for all known seasons)', () => {
    expect(yml).toMatch(/Fetch season catalog[\s\S]*?npx tsx scripts\/fetch-season-catalog\.ts --all/);
  });

  it('guards race-distance and circuit-maps steps with hashFiles so missing scripts skip cleanly', () => {
    expect(yml).toMatch(/hashFiles\('scripts\/fetch-race-distance\.ts'\)\s*!=\s*''/);
    // Phase 14 부터 일요일 maps step 은 build-all-circuits.ts 단일 호출 (Phase 1+2+8 orchestrate).
    // 가드는 weekday step + bulk step 양쪽에 존재 — 같이 skip되어 로그 직관성 ↑.
    const circuitGuardCount = yml.match(/hashFiles\('scripts\/build-all-circuits\.ts'\)\s*!=\s*''/g);
    expect(circuitGuardCount).not.toBeNull();
    expect(circuitGuardCount!.length).toBe(2);
  });

  it('gates circuit-maps step on Sunday via date -u +%u == 7', () => {
    expect(yml).toContain('date -u +%u');
    expect(yml).toMatch(/= "7"/);
    expect(yml).toMatch(/steps\.weekday\.outputs\.run == 'true'/);
  });

  it('commits via github-actions[bot] with a single combined commit message', () => {
    expect(yml).toContain('github-actions[bot]');
    expect(yml).toContain("git commit -m \"data: daily refresh\"");
    expect(yml).toMatch(/git diff --staged --quiet \|\| git commit/);
    expect(yml).toContain('git push');
  });

  it('stages all three data directories in the commit step', () => {
    expect(yml).toContain('public/seasons/');
    expect(yml).toContain('public/raceDistance.json');
    expect(yml).toContain('public/trackOutlines/');
  });
});
