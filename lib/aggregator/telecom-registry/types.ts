export type DomainOperatorRegistryRow = {
  id?: string
  countryIso3: string
  operatorName: string
  normalizedName: string
  slug: string
  aliases: string[]
  mcc?: string | null
  mnc?: string | null
  domain: string
  isActive: boolean
  source: string
}

export type RegistryMatchMethod = 'exact' | 'normalized' | 'alias' | 'fuzzy'

export type RegistryMatchResult = {
  matched: true
  row: DomainOperatorRegistryRow
  matchMethod: RegistryMatchMethod
  similarity: number
  matchedValue: string
}

export type RegistryUpsertInput = {
  countryIso3: string
  operatorName: string
  normalizedName: string
  slug: string
  aliases: string[]
  mcc?: string | null
  mnc?: string | null
  domain?: string
  source: string
}

export type MccMncRecord = {
  mcc?: string
  mnc?: string
  iso?: string
  country?: string
  countryCode?: string
  countryName?: string
  network?: string
  brand?: string
  operator?: string
  status?: string
  type?: string
}
