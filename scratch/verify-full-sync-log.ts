/** Quick DING MEX sync to verify full-sync log finalization */
import * as fs from 'fs'
import * as path from 'path'

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
    if (match) {
      let value = match[2] || ''
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
      process.env[match[1]] = value.trim()
    }
  }
}
loadEnv()

import { syncProviderCatalog } from '../lib/lcr/sync-catalog'
import { supabaseRest } from '../lib/db/supabase-rest'

const DING_ID = 'bb376d0e-2cd6-4958-8956-4a9881948f86'

async function main() {
  const before = await supabaseRest(
    `sync_logs?service_provider_id=eq.${DING_ID}&stage=eq.full-sync&select=status,finished_at&order=started_at.desc&limit=3`,
    { cache: 'no-store' },
  )
  console.log('Before latest full-sync logs:', await before.json())

  const t0 = Date.now()
  const result = await syncProviderCatalog(DING_ID, { countries: ['MEX'] })
  console.log(`Sync done in ${((Date.now() - t0) / 1000).toFixed(1)}s`, {
    mapped: result.mappedPlans,
    normalized: result.normalized,
  })

  const after = await supabaseRest(
    `sync_logs?service_provider_id=eq.${DING_ID}&stage=eq.full-sync&select=status,finished_at,error_message&order=started_at.desc&limit=3`,
    { cache: 'no-store' },
  )
  console.log('After latest full-sync logs:', await after.json())
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
