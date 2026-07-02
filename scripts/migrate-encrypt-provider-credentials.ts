import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { migrateAllProviderCredentialsToEncrypted } from '@/lib/aggregator/credentials'

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

  console.log('Encrypting plaintext provider credentials in lcr_providers (idempotent)…')
  const result = await migrateAllProviderCredentialsToEncrypted()
  console.log(
    `Done. scanned=${result.scanned} encrypted=${result.encrypted} skipped=${result.skipped} errors=${result.errors}`,
  )
  if (result.errors > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
