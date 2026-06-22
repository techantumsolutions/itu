import type { ProviderConfig, NormalizedPlan } from '@/lib/providers/types'

export type SyncStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
export type MappingType = 'AUTO' | 'MANUAL' | 'AI_MATCHED' | 'EXACT_MATCH'
export type CatalogStatus = 'ACTIVE' | 'EXPIRED' | 'DISCONTINUED' | 'INACTIVE'

export type AggregatorProviderRow = {
  id: string
  code: string
  name: string
  adapter_key: ProviderConfig['adapterKey']
  is_active: boolean
  priority: number
  base_url: string | null
  refresh_interval_minutes: number | null
  supported_countries?: string[] | null
  credentials_encrypted?: string | null
  slug?: string | null
  provider_type?: string | null
  auth_type?: string | null
}

export type RawOperatorInput = {
  serviceProviderId: string
  providerOperatorId: string
  providerOperatorName: string
  countryCode?: string | null
  isoCode?: string | null
  mobileCountryCode?: string | null
  logo?: string | null
  operatorType?: string | null
  currency?: string | null
  status?: CatalogStatus | string
  rawResponseJson: unknown
  checksumHash: string
}

export type RawPlanInput = {
  providerId: string
  providerPlanId: string
  providerOperatorRawId?: string | null
  providerPlanName?: string | null
  providerPlanCode?: string | null
  amount?: number | null
  currency?: string | null
  validity?: string | null
  talktime?: string | null
  dataVolume?: string | null
  sms?: string | null
  description?: string | null
  planType?: string | null
  benefitsJson?: unknown
  rawJson: unknown
  checksumHash: string
  status?: CatalogStatus | string
  rawQualityScore?: number | null
  hasDescription?: boolean | null
  hasBenefits?: boolean | null
  hasCategory?: boolean | null
  hasAmount?: boolean | null
  hasValidity?: boolean | null
  hasCurrency?: boolean | null
  rawCompletenessPercent?: number | null
  catalogStatus?: string | null
  confidenceLevel?: string | null
  confidenceScore?: number | null
  serviceDomain?: string | null
  serviceDomainConfidence?: number | null
  serviceDomainSource?: string | null
  countryCode?: string | null
  destinationAmount?: number | null
  destinationCurrency?: string | null
}

export type SystemOperatorInput = {
  systemOperatorName: string
  slug: string
  countryId: string
  logo?: string | null
  operatorType?: string | null
  status?: CatalogStatus | string
  operatorDomain?: string | null
  operatorDomainConfidence?: number | null
  domainClassificationSource?: string | null
  serviceDomain?: string | null
  serviceDomainConfidence?: number | null
  serviceDomainSource?: string | null
}

export type SystemPlanInput = {
  systemOperatorId: string
  internalPlanId?: string | null
  systemPlanName: string
  slug: string
  amount?: number | null
  currency?: string | null
  validity?: string | null
  talktime?: string | null
  dataVolume?: string | null
  sms?: string | null
  planType?: string | null
  description?: string | null
  normalizedSignature: string
  status?: CatalogStatus | string
  catalogStatus?: string | null
  confidenceLevel?: string | null
  confidenceScore?: number | null
  serviceDomain?: string | null
  serviceDomainConfidence?: number | null
  serviceDomainSource?: string | null
  countryCode?: string | null
}

export type DuplicateCandidate = {
  systemPlanId: string
  score: number
  reason: string
  comparison: Record<string, unknown>
}

export type AggregatorNormalizedPlan = {
  providerPlanRawId: string
  normalized: NormalizedPlan
  systemOperatorId: string
  internalPlanId: string
  systemPlanId: string
  duplicateCandidates: DuplicateCandidate[]
}

export type AggregatorSyncResult = {
  providerId: string
  providerCode: string
  fetchedRaw: number
  rawOperators: number
  normalized: number
  systemOperators: number
  systemPlans: number
  mappedPlans: number
  duplicateSuggestions: number
  skippedOperators?: number
  operatorMappings?: number
  durationMs: number
  syncedCountries?: string[]
  warnings?: string[]
  diagnostics?: Record<string, unknown>
  verificationDashboard?: {
    totalSystemPlans: number
    duplicatePlansFound: number
    duplicatePlansMerged: number
    activePlans: number
    inactivePlans: number
    websiteEligiblePlans: number
  }
}
