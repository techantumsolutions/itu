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
  fallbackUsed: boolean
  status: string
  createdAt: string
}

export type RoutingResolveInput = {
  countryId: string
  operatorId: string
  productId: string
  transactionAmount?: number
  transactionId?: string
  service?: string
  productType?: string
}

export type RoutingProviderCandidate = {
  providerId: string
  providerPlanId: string
  providerCode?: string
  providerName?: string
  price: number
  currency?: string
  margin?: number
  providerPriority: number
  score?: number
  eligible: boolean
  reason?: string
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
