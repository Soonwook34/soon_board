/// @vitest-environment node
// 재발방지 가드 — undated `getSessionResult` 는 시간 컷이 안 되므로(인수18) 컴포넌트가 게이트 없이
// 직접 쓰면 미래 누설(예: Leaderboard DNF ✕ 가 t=0 부터 노출). out-status 진입점은 derived/driverOutStatus
// (시간 컷) 하나로 통일. panels/** · detailPanel/** 에서 getSessionResult 직접 사용은 화이트리스트만 허용.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dashboardDir = dirname(dirname(fileURLToPath(import.meta.url))); // src/dashboard
const SCAN_DIRS = ['panels', 'detailPanel'];

// 게이트(display_time ≥ session.date_end)를 보유해 누설하지 않는 소비처만 직접 사용 허용.
const WHITELIST = new Set(['detailPanel/SessionResult.tsx']);

// 한계: 문자열 스캔이라 aliasing(const g = ds.getSessionResult; g(n))·주석 내 표기는 못 잡는다.
// 현실 회귀(컴포넌트가 ds.getSessionResult(...) 직접 호출)는 포착. 엄격화(ESLint 규칙)는 plan §6.

function collectSources(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === '__tests__') continue; // 테스트의 fake override 는 스캔 대상 아님
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectSources(full));
    else if (/\.tsx?$/.test(ent.name)) out.push(full);
  }
  return out;
}

describe('future-leak guard — getSessionResult 직접 사용 제한', () => {
  it('panels/** · detailPanel/** 에서 getSessionResult( 사용처는 화이트리스트뿐', () => {
    const offenders: string[] = [];
    for (const sub of SCAN_DIRS) {
      for (const file of collectSources(join(dashboardDir, sub))) {
        if (readFileSync(file, 'utf8').includes('getSessionResult(')) {
          offenders.push(relative(dashboardDir, file).replace(/\\/g, '/'));
        }
      }
    }
    const unexpected = offenders.filter((f) => !WHITELIST.has(f));
    expect(unexpected, `미래 누설 위험: 게이트 없이 getSessionResult 직접 사용 — driverOutAt 헬퍼를 쓰세요: ${unexpected.join(', ')}`).toEqual([]);
  });
});
