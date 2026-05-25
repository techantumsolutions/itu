export type ProviderAdapterKey = 'dtone' | 'ding' | 'reloadly' | 'custom'

export type ProviderAuth = {
  kind: 'basic' | 'bearer' | 'apiKey' | 'custom'
  apiKey?: string
  apiSecret?: string
  clientId?: string
  clientSecret?: string
  token?: string
  extra?: Record<string, string>
}

export type ProviderConfig = {
  id: string
  code: string
  name: string
  adapterKey: ProviderAdapterKey
  baseUrl?: string
  isActive: boolean
  priority: number
  refreshIntervalMinutes: number
  supportedCountries: string[]
  auth?: ProviderAuth
}

export type RawPlanRecord = {
  providerPlanId: string
  raw: unknown
}

export type NormalizedBenefit = {
  type: 'DATA' | 'VOICE' | 'SMS' | 'BONUS' | 'COMBO' | 'AIRTIME' | 'OTHER'
  amountBase?: number
  promotionBonus?: number
  totalExcludingTax?: number
  totalIncludingTax?: number
  unit?: string
  unitType?: string
  additionalInformation?: string
}

export type NormalizedPlan = {
  providerId: string
  providerCode: string
  providerPlanId: string
  countryIso3: string
  operatorRef: string
  operatorName?: string
  service: string
  subservice?: string
  planType: string
  availabilityZones?: string[]
  tags?: string[]
  name?: string
  description?: string
  destinationAmount?: number
  destinationUnit?: string
  retailAmount?: number
  retailCurrency?: string
  wholesaleAmount?: number
  wholesaleCurrency?: string
  validityDays?: number
  benefits: NormalizedBenefit[]
  requiredFields: string[][]
  raw: unknown
}

export type ProviderSyncResult = {
  providerId: string
  fetchedRaw: number
  normalized: number
  durationMs: number
}

export interface ProviderConnector {
  readonly adapterKey: ProviderAdapterKey
  fetchRawPlans(config: ProviderConfig): Promise<RawPlanRecord[]>
  normalizePlans(input: { config: ProviderConfig; raw: RawPlanRecord[] }): Promise<NormalizedPlan[]>
  healthCheck?(config: ProviderConfig): Promise<{ ok: boolean; latencyMs?: number; message?: string }>
}

