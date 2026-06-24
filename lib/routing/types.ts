export type RoutingStrategy = 'LEAST_COST' | 'PRIORITY' | 'HIGHEST_MARGIN'
export type FallbackStrategy = 'NEXT_PROVIDER' | 'PRIORITY_PROVIDER'
export type RoutingType = 'RULE' | 'LCR'

export type LcrEngineSettings = {
  id: string
  enabled: boolean
  routingStrategy: RoutingStrategy
  fallbackStrategy: FallbackStrategy
  autoFailover: boolean
  retryEnabled: boolean
  retryAttempts: number
}

export type ProviderPriorityRow = {
  id: string
  providerId: string
  providerCode?: string
  providerName?: string
  priority: number
}

export type RoutingRuleRow = {
  id: string
  ruleName: string
  countryId: string | null
  operatorId: string | null
  productType: string | null
  providerId: string
  providerCode?: string
  providerName?: string
  priority: number
  status: 'ACTIVE' | 'INACTIVE'
  effectiveFrom: string | null
  effectiveTo: string | null
  createdAt: string
  updatedAt: string
}

export type RoutingLogRow = {
  id: string
  transactionId: string | null
  countryId: string | null
  operatorId: string | null
  productId: string | null
  providerId: string | null
  providerCode?: string
  providerName?: string
  routingType: RoutingType
  providerCost: number | null
  providerCurrency?: string | null
  providerWholesaleAmount?: number | null
  providerWholesaleCurrency?: string | null
  destinationFaceValue?: number | null
  destinationCurrency?: string | null
  normalizedProviderPrice?: number | null
  userAmount?: number | null
  userCurrency?: string | null
  fallbackUsed: boolean
  status: string
  createdAt: string
}

export type RoutingResolveInput = {
  countryId: string
  operatorId: string
  productId: string
  /** When set, plan_mappings are loaded for this system_plans.id (matches admin/products). */
  systemPlanId?: string
  transactionAmount?: number
  transactionId?: string
  service?: string
  productType?: string
}

import type { ProviderPayloadStrategy } from '@/lib/routing/provider-payload-strategy'

export type RoutingProviderCandidate = {
  providerId: string
  providerPlanId?: string
  providerCode?: string
  providerName?: string
  /** @deprecated Use provider_wholesale_amount — kept for routing logs */
  price: number
  /** @deprecated Use provider_wholesale_currency */
  currency?: string
  provider_wholesale_amount?: number
  provider_wholesale_currency?: string
  normalized_provider_price?: number
  normalized_provider_currency?: string
  destination_face_value?: number
  destination_currency?: string
  providerPayloadStrategy?: ProviderPayloadStrategy
  margin?: number
  providerPriority: number
  score?: number
  eligible: boolean
  reason?: string
  filterReason?: string
  mappingExists?: boolean
  activeStatus?: boolean
  onlineStatus?: string
}

export type RoutingResolveResult = {
  routingType: RoutingType
  ruleId?: string
  ruleName?: string
  selected: RoutingProviderCandidate | null
  fallbacks: RoutingProviderCandidate[]
  evaluated: RoutingProviderCandidate[]
  ruleApplied: string
  settings: LcrEngineSettings | null
  logId?: string
}
