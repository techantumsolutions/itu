import { Queue } from 'bullmq'
import { buildBullMqConnection, resolveRedisUrl } from '@/lib/cache/redis-connection'

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

/** Catalog sync can run many minutes — keep locks alive past default 30s. */
export const PROVIDER_SYNC_LOCK_MS = 15 * 60 * 1000
export const PROVIDER_SYNC_STALLED_INTERVAL_MS = 60_000
export const PROVIDER_SYNC_MAX_STALLED = 2

function connectionOpts() {
  return buildBullMqConnection()
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

export function providerFullSyncJobId(providerId: string): string {
  return `provider-full-sync:${providerId}`
}

export async function enqueueProviderSync(
  providerId: string,
  options?: { immediate?: boolean; requestId?: string },
) {
  const q = getProviderSyncQueue()
  if (!q) return null
  let requestId = options?.requestId
  if (!requestId) {
    try {
      const { getRequestId, newRequestId } = await import('@/lib/observability/context')
      requestId = getRequestId() || newRequestId()
    } catch {
      requestId = undefined
    }
  }
  const jobId = providerFullSyncJobId(providerId)
  // Deterministic jobId dedupes concurrent enqueue (cron + manual).
  // If a job with this id is already waiting/active/delayed, BullMQ throws — treat as success.
  try {
    return await q.add(
      PROVIDER_SYNC_JOBS.fullSync,
      { providerId, requestId },
      {
        jobId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 100,
        removeOnFail: 200,
        delay: options?.immediate === false ? 5_000 : 0,
      },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/already exists|JobId/i.test(msg)) {
      const existing = await q.getJob(jobId)
      return existing
    }
    throw err
  }
}

export async function getQueueSnapshot() {
  const sync = getProviderSyncQueue()
  const health = getProviderHealthQueue()
  const [syncCounts, healthCounts] = await Promise.all([
    sync?.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed').catch(() => null) ?? null,
    health?.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed').catch(() => null) ?? null,
  ])
  return {
    redisConfigured: Boolean(resolveRedisUrl()),
    providerSync: syncCounts,
    providerHealth: healthCounts,
  }
}
