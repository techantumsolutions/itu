import type { ProviderConfig } from '@/lib/providers/types'
import { normalizeCountryList } from '@/lib/lcr/countries'

export type SyncCatalogOptions = {
  /** ISO 3166-1 alpha-3 country codes to sync (e.g. IND for India). */
  countries?: string[]
}

export function resolveSyncCountries(config: ProviderConfig, options?: SyncCatalogOptions): string[] {
  const fromRequest = normalizeCountryList(options?.countries)
  if (fromRequest.length) return fromRequest
  return normalizeCountryList(config.supportedCountries)
}
