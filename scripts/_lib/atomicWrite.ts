// POSIX atomic write — tmp 파일에 쓴 뒤 fs.renameSync로 교체.
// critic C3: index.json·{year}.json 부분 write가 production 산출물에 노출되면
// 런타임 fetch가 JSON.parse 실패 → 무한 stall. rename은 atomic이라 부분 상태가 보이지 않음.

import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface WriteJsonAtomicOptions {
  /** Pretty-print with 2-space indent. Default false (minified) — 시즌 JSON은 무게가 critical. */
  pretty?: boolean;
}

export function writeJsonAtomicSync(
  filePath: string,
  value: unknown,
  opts: WriteJsonAtomicOptions = {},
): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const body = opts.pretty ? JSON.stringify(value, null, 2) + '\n' : JSON.stringify(value);
  writeFileSync(tmp, body, 'utf8');
  renameSync(tmp, filePath);
}
