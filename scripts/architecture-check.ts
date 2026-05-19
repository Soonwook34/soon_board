import { readFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import * as path from 'node:path'

const ALLOWED_FILE = path.resolve('src/store/timelineStore.ts')
// Match bare `mode === 'live'` but not `s.mode === 'live'` (selector form is allowed)
const LIVE_LITERAL = /(?<!\.\s*|\w)mode\s*===\s*['"]live['"]/

interface Offender {
  file: string
  line: number
  text: string
}

async function walkSrc(dir: string): Promise<string[]> {
  const entries = await readdir(dir)
  const results: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry)
    const info = await stat(full)
    if (info.isDirectory()) {
      const sub = await walkSrc(full)
      results.push(...sub)
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full)
    }
  }
  return results
}

async function main() {
  const srcDir = path.resolve('src')
  const files = await walkSrc(srcDir)

  const offenders: Offender[] = []

  for (const file of files) {
    const resolved = path.resolve(file)
    if (resolved === ALLOWED_FILE) continue

    const content = await readFile(file, 'utf8')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (LIVE_LITERAL.test(lines[i])) {
        offenders.push({ file: resolved, line: i + 1, text: lines[i].trim() })
      }
    }
  }

  if (offenders.length > 0) {
    process.stderr.write('[architecture-check] FAIL — mode === "live" literal found outside timelineStore:\n')
    for (const o of offenders) {
      process.stderr.write(`  ${o.file}:${o.line}: ${o.text}\n`)
    }
    process.exit(1)
  }

  console.log('[architecture-check] OK')
  process.exit(0)
}

main().catch((err) => {
  process.stderr.write(`[architecture-check] ERROR: ${String(err)}\n`)
  process.exit(1)
})
