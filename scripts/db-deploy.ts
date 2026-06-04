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

  // Use DIRECT_URL for remote database (which bypasses PgBouncer pooling if transaction mode is used, or connects directly)
  // Fall back to DATABASE_URL if DIRECT_URL is not set.
  const dbUrl = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('Error: Neither DIRECT_URL nor DATABASE_URL is defined in .env file.')
    process.exit(1)
  }

  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')

  const cmdArgs = ['exec', 'supabase', 'db', 'push', '--db-url', dbUrl]
  if (isDryRun) {
    cmdArgs.push('--dry-run')
    console.log('Performing remote migration dry-run...')
  } else {
    console.log('Deploying migrations to remote database...')
  }

  const result = spawnSync('pnpm', cmdArgs, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    console.error(`Deployment failed with exit status ${result.status}`)
    process.exit(result.status ?? 1)
  }

  console.log(isDryRun ? 'Dry-run completed successfully.' : 'Migrations deployed successfully.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
