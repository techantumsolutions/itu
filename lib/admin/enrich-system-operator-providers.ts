import { getNormalizedBaseName } from '@/lib/aggregator/repository'
import { canonicalOperatorName } from '@/lib/aggregator/operator-normalizer'
import { ISO3_TO_ISO2 } from '@/lib/lcr/countries'

export type CountryLookupRow = {
  name: string
  iso2: string
  iso3: string
}

export type RawOperatorProviderSource = {
  service_provider_id: string
  provider_operator_name: string
  iso_code?: string | null
  country_code?: string | null
}

export type SystemOperatorProviderTarget = {
  id: string
  system_operator_name: string
  country_id: string
}

export function buildCountryLookupByIso3(
  countries: Array<{ id?: string; name?: string; iso2?: string; iso3?: string }>,
): Map<string, CountryLookupRow> {
  const map = new Map<string, CountryLookupRow>()
  for (const c of countries) {
    const iso3 = String(c.iso3 ?? c.id ?? '')
      .trim()
      .toUpperCase()
    if (!iso3) continue
    map.set(iso3, {
      name: String(c.name ?? '').trim(),
      iso2: String(c.iso2 ?? ISO3_TO_ISO2[iso3] ?? '')
        .trim()
        .toUpperCase(),
      iso3,
    })
  }
  return map
}

function operatorKeysMatch(
  systemName: string,
  rawName: string,
  countryIso3: string,
  countryLookup: Map<string, CountryLookupRow>,
): boolean {
  const countryId = countryIso3.trim().toUpperCase()
  const systemKey = normalizedOperatorKey(systemName, countryId, countryLookup)
  const rawKey = normalizedOperatorKey(rawName, countryId, countryLookup)
  if (systemKey && rawKey && systemKey === rawKey) return true

  const systemCanon = canonicalOperatorName(systemName).trim().toLowerCase()
  const rawCanon = canonicalOperatorName(rawName).trim().toLowerCase()
  return Boolean(systemCanon && rawCanon && systemCanon === rawCanon)
}

function normalizedOperatorKey(
  name: string,
  countryIso3: string,
  countryLookup: Map<string, CountryLookupRow>,
): string {
  const country = countryLookup.get(countryIso3.trim().toUpperCase())
  if (!country) return name.trim().toLowerCase()
  return getNormalizedBaseName(name, country.name, country.iso2, country.iso3).trim().toLowerCase()
}

/** Infer provider IDs from raw operator rows when operator_mappings is missing. */
export function inferProviderIdsFromRawOperators(
  systemOperator: SystemOperatorProviderTarget,
  rawOperators: RawOperatorProviderSource[],
  countryLookup: Map<string, CountryLookupRow>,
): string[] {
  const countryId = String(systemOperator.country_id ?? '').trim().toUpperCase()
  if (!countryId) return []

  const providerIds = new Set<string>()
  for (const raw of rawOperators) {
    const rawCountry = String(raw.iso_code ?? raw.country_code ?? '')
      .trim()
      .toUpperCase()
    if (!rawCountry || rawCountry !== countryId) continue

    if (!operatorKeysMatch(systemOperator.system_operator_name, raw.provider_operator_name, countryId, countryLookup)) {
      continue
    }
    const providerId = String(raw.service_provider_id ?? '').trim()
    if (providerId) providerIds.add(providerId)
  }

  return Array.from(providerIds)
}

export function resolveSystemOperatorProviderIds(
  systemOperator: SystemOperatorProviderTarget,
  mappedProviderIds: string[],
  rawOperators: RawOperatorProviderSource[],
  countryLookup: Map<string, CountryLookupRow>,
  planProviderIds: string[] = [],
): string[] {
  const merged = new Set<string>([...mappedProviderIds, ...planProviderIds])
  for (const id of inferProviderIdsFromRawOperators(systemOperator, rawOperators, countryLookup)) {
    merged.add(id)
  }
  return Array.from(merged)
}