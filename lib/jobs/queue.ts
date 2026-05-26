import { Queue } from 'bullmq'
import { runtimeEnv } from '@/lib/env/runtime'

export const PROVIDER_SYNC_JOBS = {
  fullSync: 'provider-full-sync',
  fetchOperators: 'fetch-operators',
  fetchPlans: 'fetch-plans',
  normalizeOperators: 'normalize-operators',
  normalizePlans: 'normalize-plans',
  detectDuplicates: 'detect-duplicates',
  updateCache: 'update-cache',
} as const

export const PROVIDER_HEALTH_JOBS = {
  healthCheck: 'provider-health',
} as const

function connectionOpts() {
  const url = runtimeEnv('REDIS_URL')
  if (!url) return null
  return { connection: { url } as Record<string, unknown> }
}

let providerSyncQueue: Queue | null = null
let providerHealthQueue: Queue | null = null

export function getProviderSyncQueue(): Queue | null {
  const opts = connectionOpts()
  if (!opts) return null
  if (!providerSyncQueue) providerSyncQueue = new Queue('provider-sync', opts as any)
  return providerSyncQueue
}

export function getProviderHealthQueue(): Queue | null {
  const opts = connectionOpts()
  if (!opts) return null
  if (!providerHealthQueue) providerHealthQueue = new Queue('provider-health', opts as any)
  return providerHealthQueue
}

export async function enqueueProviderSync(providerId: string, options?: { immediate?: boolean }) {
  const q = getProviderSyncQueue()
  if (!q) return null
  return q.add(
    PROVIDER_SYNC_JOBS.fullSync,
    { providerId },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
      delay: options?.immediate === false ? 5_000 : 0,
    },
  )
}

export async function getQueueSnapshot() {
  const sync = getProviderSyncQueue()
  const health = getProviderHealthQueue()
  const [syncCounts, healthCounts] = await Promise.all([
    sync?.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed').catch(() => null) ?? null,
    health?.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed').catch(() => null) ?? null,
  ])
  return {
    redisConfigured: Boolean(runtimeEnv('REDIS_URL')),
    providerSync: syncCounts,
    providerHealth: healthCounts,
  }
}
