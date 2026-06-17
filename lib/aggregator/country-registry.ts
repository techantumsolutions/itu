import { supabaseRest } from '@/lib/db/supabase-rest'
import { normalizeCountry } from '@/lib/aggregator/country-normalizer'

export type CountryRegistryEntry = {
  id: string
  name: string
  iso2: string
  iso3: string
  dial_prefix: string
  min_length: number
  max_length: number
}

export type CountryRegistry = {
  iso3Map: Map<string, CountryRegistryEntry>
  iso2Map: Map<string, CountryRegistryEntry>
  nameMap: Map<string, CountryRegistryEntry>
  entries: CountryRegistryEntry[]
}

export type CountryLookupInput = {
  countryName?: string | null
  iso2?: string | null
  iso3?: string | null
}

let cachedRegistry: CountryRegistry | null = null
let loadPromise: Promise<CountryRegistry> | null = null

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase()
}

function buildRegistry(entries: CountryRegistryEntry[]): CountryRegistry {
  const iso3Map = new Map<string, CountryRegistryEntry>()
  const iso2Map = new Map<string, CountryRegistryEntry>()
  const nameMap = new Map<string, CountryRegistryEntry>()

  for (const entry of entries) {
    const iso3 = entry.iso3.toUpperCase()
    const iso2 = entry.iso2.toUpperCase()
    iso3Map.set(iso3, entry)
    iso2Map.set(iso2, entry)
    nameMap.set(normalizeNameKey(entry.name), entry)
  }

  return { iso3Map, iso2Map, nameMap, entries }
}

/** Load all countries from the database once and build in-memory lookup maps. */
export async function loadCountryRegistry(force = false): Promise<CountryRegistry> {
  if (!force && cachedRegistry) return cachedRegistry
  if (!force && loadPromise) return loadPromise

  loadPromise = (async () => {
    const res = await supabaseRest(
      'countries?select=id,name,iso2,iso3,dial_prefix,min_length,max_length&limit=1000',
      { cache: 'no-store' },
    )
    if (!res.ok) {
      throw new Error(`Failed to load country registry: ${await res.text()}`)
    }
    const rows = (await res.json()) as CountryRegistryEntry[]
    cachedRegistry = buildRegistry(rows)
    return cachedRegistry
  })()

  try {
    return await loadPromise
  } finally {
    loadPromise = null
  }
}

export function resetCountryRegistryCache(): void {
  cachedRegistry = null
  loadPromise = null
}

export function lookupCountryInRegistry(
  registry: CountryRegistry,
  input: CountryLookupInput,
): CountryRegistryEntry | null {
  const norm = normalizeCountry(input)

  if (norm?.iso3) {
    const byIso3 = registry.iso3Map.get(norm.iso3.toUpperCase())
    if (byIso3) return byIso3
  }

  const directIso3 = (input.iso3 ?? '').trim().toUpperCase()
  if (directIso3.length === 3) {
    const byIso3 = registry.iso3Map.get(directIso3)
    if (byIso3) return byIso3
  }

  if (norm?.iso2) {
    const byIso2 = registry.iso2Map.get(norm.iso2.toUpperCase())
    if (byIso2) return byIso2
  }

  const directIso2 = (input.iso2 ?? '').trim().toUpperCase()
  if (directIso2.length === 2) {
    const byIso2 = registry.iso2Map.get(directIso2)
    if (byIso2) return byIso2
  }

  const name = (input.countryName ?? norm?.canonicalName ?? '').trim()
  if (name) {
    const byName = registry.nameMap.get(normalizeNameKey(name))
    if (byName) return byName
  }

  return null
}

export async function lookupCountry(input: CountryLookupInput): Promise<CountryRegistryEntry | null> {
  const registry = await loadCountryRegistry()
  return lookupCountryInRegistry(registry, input)
}

export function getCanonicalCountry(
  registry: CountryRegistry,
  iso3: string,
): CountryRegistryEntry | null {
  return registry.iso3Map.get(iso3.trim().toUpperCase()) ?? null
}

export function logUnknownCountry(provider: string, input: CountryLookupInput): void {
  console.warn(
    [
      'Unknown country from provider',
      `provider: ${provider}`,
      `rawName: ${input.countryName ?? ''}`,
      `iso2: ${input.iso2 ?? ''}`,
      `iso3: ${input.iso3 ?? ''}`,
    ].join('\n'),
  )
}
