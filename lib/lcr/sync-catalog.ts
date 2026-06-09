import { aggGetProvider, isAggregatorSchemaReady } from '@/lib/aggregator/repository'
import { runFullSyncPipeline } from '@/lib/aggregator/pipeline/stage-executor'
import type { SyncCatalogOptions } from '@/lib/lcr/sync-options'

/** Sync provider catalog using the full 8-step aggregator staging pipeline. */
export async function syncProviderCatalog(providerId: string, options?: SyncCatalogOptions) {
  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) throw new Error('provider_not_found')

  if (!(await isAggregatorSchemaReady())) {
    throw new Error('Aggregator staging schema not initialized')
  }

  return runFullSyncPipeline(providerId)
}
