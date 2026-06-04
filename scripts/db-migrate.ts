import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { spawnSync } from 'child_process'

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 1) continue
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

async function main() {
  loadDotEnv()

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('Error: DATABASE_URL is not defined in .env file.')
    process.exit(1)
  }

  // Adjust for local database TLS requirement of supabase CLI
  let targetUrl = dbUrl
  try {
    const parsed = new URL(targetUrl)
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      // Set PGSSLMODE to disable to prevent Supabase CLI TLS connection issues on localhost
      process.env.PGSSLMODE = 'disable'
      if (!parsed.searchParams.has('sslmode')) {
        parsed.searchParams.set('sslmode', 'disable')
        targetUrl = parsed.toString()
      }
    }
  } catch (e) {
    if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
      process.env.PGSSLMODE = 'disable'
      if (!targetUrl.includes('sslmode')) {
        const separator = targetUrl.includes('?') ? '&' : '?'
        targetUrl = `${targetUrl}${separator}sslmode=disable`
      }
    }
  }

  console.log('Applying pending database migrations locally...')
  const result = spawnSync('pnpm', ['exec', 'supabase', 'migration', 'up', '--db-url', targetUrl], {
    stdio: 'inherit',
    shell: true,
    env: process.env, // Ensure child process inherits updated PGSSLMODE env var
  })

  if (result.status !== 0) {
    console.error(`Migration failed with exit status ${result.status}`)
    process.exit(result.status ?? 1)
  }

  console.log('Migrations completed successfully.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
