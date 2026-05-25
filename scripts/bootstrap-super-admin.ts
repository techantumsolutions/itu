/**
 * Creates or updates the canonical super-admin Auth user + profiles row.
 *   npm run bootstrap:admin
 */
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { runtimeEnv } from '../lib/env/runtime'
import { bootstrapSuperAdmin } from '../lib/auth/bootstrap-super-admin'

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

  if (!runtimeEnv('SUPABASE_URL') || !runtimeEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }
  if (!runtimeEnv('SUPABASE_ANON_KEY')) {
    console.warn('Warning: SUPABASE_ANON_KEY is not set — email login will fail until you add it from Supabase → Settings → API.')
  }

  const result = await bootstrapSuperAdmin()
  console.log(
    result.created
      ? `Created Auth user ${result.email} (${result.userId})`
      : `Updated password for ${result.email} (${result.userId})`,
  )
  console.log(`Profile app_role set to super_admin`)
  console.log('')
  console.log('Sign in at /admin/login with:')
  console.log(`  Email:    ${result.email}`)
  console.log(
    result.passwordSource === 'env'
      ? '  Password: ADMIN_BOOTSTRAP_PASSWORD from .env'
      : '  Password: 1234567890 (dev default)',
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
