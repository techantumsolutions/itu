import { cacheDelByPrefixes } from '@/lib/cache/redis'

/** Bust public catalog API caches after admin sync writes new data. */
export async function invalidatePublicCatalogCache(): Promise<void> {
  await cacheDelByPrefixes(['catalog:', 'aggregator:'])
}
