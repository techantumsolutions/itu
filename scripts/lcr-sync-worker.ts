/**
 * Run: REDIS_URL=redis://localhost:6379 npx tsx scripts/lcr-sync-worker.ts
 * Processes BullMQ jobs from queue "provider-sync".
 */
import { Worker } from 'bullmq'
import { syncProviderCatalog } from '@/lib/lcr/sync-catalog'
import { validateCountriesTable } from '@/lib/aggregator/country-startup-validation'

const url = process.env.REDIS_URL
if (!url) {
  console.error('REDIS_URL is required')
  process.exit(1)
}

await validateCountriesTable().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

type JobPayload = { providerId: string }

// eslint-disable-next-line no-console
console.log('[lcr-sync-worker] starting…')

const worker = new Worker<JobPayload>(
  'provider-sync',
  async (job) => {
    return syncProviderCatalog(job.data.providerId)
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
