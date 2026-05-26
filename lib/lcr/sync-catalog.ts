import { aggGetProvider, isAggregatorSchemaReady } from '@/lib/aggregator/repository'
import { syncAggregatorProvider } from '@/lib/aggregator/sync-service'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import type { SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { ingestProviderPlans } from '@/lib/uti/ingestion'

/** Sync provider catalog using the full aggregator pipeline when available, otherwise legacy LCR ingestion. */
export async function syncProviderCatalog(providerId: string, options?: SyncCatalogOptions) {
  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) throw new Error('provider_not_found')

  const config = rowToProviderConfig(providerRow as Record<string, unknown>)
  if (!(await isAggregatorSchemaReady())) {
    return ingestProviderPlans(config, options)
  }

  return syncAggregatorProvider(providerId, options)
}
