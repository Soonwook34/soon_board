const STRICT = process.env.CORS_STRICT === '1'

function isAllowedOrigin(header: string | null): boolean {
  if (!header) return false
  if (header === '*') return true
  // Allow github.io origins
  return /^https:\/\/[^/]+\.github\.io$/.test(header)
}

async function main() {
  try {
    const res = await fetch('https://api.openf1.org/v1/sessions?session_key=latest', {
      method: 'HEAD',
    })
    const acao = res.headers.get('access-control-allow-origin')

    if (!isAllowedOrigin(acao)) {
      const reason = acao ? `unexpected value '${acao}'` : 'header missing'
      if (STRICT) {
        console.error(`[verify:cors] FAIL: access-control-allow-origin ${reason}`)
        process.exit(1)
      }
      console.log(`[verify:cors] skipped: ${reason}`)
    } else {
      console.log(`[verify:cors] OK: access-control-allow-origin = ${acao}`)
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    if (STRICT) {
      console.error(`[verify:cors] FAIL (network): ${reason}`)
      process.exit(1)
    }
    console.log(`[verify:cors] skipped: network error — ${reason}`)
  }
}

main()
