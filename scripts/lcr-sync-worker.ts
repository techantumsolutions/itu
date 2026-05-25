/**
 * Run: REDIS_URL=redis://localhost:6379 npx tsx scripts/lcr-sync-worker.ts
 * Processes BullMQ jobs from queue "provider-sync".
 */
import { Worker } from 'bullmq'
import { ingestProviderPlans } from '@/lib/uti/ingestion'
import { supabaseRest } from '@/lib/db/supabase-rest'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'

const url = process.env.REDIS_URL
if (!url) {
  console.error('REDIS_URL is required')
  process.exit(1)
}

type JobPayload = { providerId: string }

async function getProviderConfig(providerId: string) {
  const res = await supabaseRest(
    `lcr_providers?id=eq.${encodeURIComponent(providerId)}&select=id,code,name,adapter_key,is_active,priority,refresh_interval_minutes,supported_countries,base_url,credentials_encrypted&limit=1`,
  )
  if (!res.ok) throw new Error(await res.text())
  const rows = (await res.json()) as any[]
  const p = rows?.[0]
  if (!p) throw new Error('provider_not_found')
  return rowToProviderConfig(p)
}

// eslint-disable-next-line no-console
console.log('[lcr-sync-worker] starting…')

const worker = new Worker<JobPayload>(
  'provider-sync',
  async (job) => {
    const provider = await getProviderConfig(job.data.providerId)
    if (!provider.isActive) return { skipped: true }
    return ingestProviderPlans(provider)
  },
  { connection: { url } as any }
)

worker.on('completed', (job) => {
  // eslint-disable-next-line no-console
  console.log('[lcr-sync-worker] completed', job.id)
})
worker.on('failed', (job, err) => {
  // eslint-disable-next-line no-console
  console.error('[lcr-sync-worker] failed', job?.id, err)
})
