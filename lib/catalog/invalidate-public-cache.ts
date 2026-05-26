import { cacheDelByPrefix } from '@/lib/cache/redis'

/** Bust public catalog API caches after admin sync writes new data. */
export async function invalidatePublicCatalogCache(): Promise<void> {
  await Promise.all([
    cacheDelByPrefix('catalog:public:'),
    cacheDelByPrefix('catalog:operators:'),
    cacheDelByPrefix('catalog:plans:'),
    cacheDelByPrefix('aggregator:'),
  ])
}
