/**
 * Smoke test for Docker stacks (dev or prod).
 * Usage:
 *   npx tsx scripts/docker-smoke-test.ts
 *   npx tsx scripts/docker-smoke-test.ts --web http://localhost:3010 --socket http://localhost:3001
 */
type Check = { name: string; ok: boolean; detail: string }

async function checkUrl(name: string, url: string): Promise<Check> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const body = await res.text()
    const ok = res.ok && body.includes('"ok":true')
    return { name, ok, detail: ok ? `${res.status}` : `status=${res.status} body=${body.slice(0, 120)}` }
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

async function main() {
  const args = process.argv.slice(2)
  const webBase = args.includes('--web') ? args[args.indexOf('--web') + 1] : 'http://localhost:3010'
  const socketBase = args.includes('--socket') ? args[args.indexOf('--socket') + 1] : 'http://localhost:3001'
  const base = webBase.replace(/\/$/, '')

  const checks = await Promise.all([
    checkUrl('web /api/health (live)', `${base}/api/health`),
    checkUrl('web /api/health/ready', `${base}/api/health/ready`),
    checkUrl('socket /health', `${socketBase.replace(/\/$/, '')}/health`),
  ])

  console.log('\n=== Docker Smoke Test ===\n')
  let failed = 0
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`)
    if (!c.ok) failed++
  }

  if (failed > 0) {
    console.log(`\n${failed} check(s) failed`)
    process.exit(1)
  }
  console.log('\nAll checks passed')
}

void main()
