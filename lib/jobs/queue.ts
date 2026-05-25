import { Queue } from 'bullmq'
import { runtimeEnv } from '@/lib/env/runtime'

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
