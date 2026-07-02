import { loadEnvConfig } from '@next/env'
import { supabaseRest } from '../lib/db/supabase-rest'

loadEnvConfig(process.cwd())

async function main() {
  const runs = await supabaseRest(
    'sync_runs?select=provider_code,status,started_at,finished_at,error_message&order=started_at.desc&limit=12',
    { cache: 'no-store' },
  )
  console.log('Recent sync_runs:', JSON.stringify(await runs.json(), null, 2))

  const runningLogs = await supabaseRest(
    'sync_logs?stage=eq.full-sync&status=eq.RUNNING&select=service_provider_id,started_at&limit=20',
    { cache: 'no-store' },
  )
  console.log('RUNNING full-sync logs:', JSON.stringify(await runningLogs.json(), null, 2))
}

main()
