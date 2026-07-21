import { resolveProvider } from '@/lib/routing/routing-engine-service'
import type { LcrEngineSettings, RoutingProviderCandidate, RoutingType } from '@/lib/routing/types'

export type LcrV2Decision = {
  internalPlanId: string
  selected: RoutingProviderCandidate | null
  fallbacks: RoutingProviderCandidate[]
  evaluated: Array<{
    providerId: string
    eligible: boolean
    reason?: string
    score?: number
    price?: number
    currency?: string
  }>
  ruleApplied: string
  routingType?: RoutingType
  ruleId?: string
  ruleName?: string
  logId?: string
  settings?: LcrEngineSettings | null
  routing_decision_reason?: string
  mapping_count?: number
}

/** Backward-compatible adapter: delegates to centralized RoutingEngineService. */
export async function routeInternalPlan(input: {
  internalPlanId: string
  countryIso3?: string
  operatorRef?: string
  service?: string
  productType?: string
  transactionId?: string
  transactionAmount?: number
}): Promise<LcrV2Decision> {
  const result = await resolveProvider({
    countryId: input.countryIso3 ?? '',
    operatorId: input.operatorRef ?? '',
    productId: input.internalPlanId,
    service: input.service,
    productType: input.productType ?? input.service,
    transactionId: input.transactionId,
    transactionAmount: input.transactionAmount,
  })

  return {
    internalPlanId: input.internalPlanId,
    selected: result.selected,
    fallbacks: result.fallbacks,
    evaluated: result.evaluated.map((e) => ({
      providerId: e.providerId,
      eligible: e.eligible,
      reason: e.reason,
      score: e.score,
      price: e.price,
      currency: e.currency,
    })),
    ruleApplied: result.ruleApplied,
    routingType: result.routingType,
    ruleId: result.ruleId,
    ruleName: result.ruleName,
    logId: result.logId,
    settings: result.settings,
    routing_decision_reason: result.routing_decision_reason,
    mapping_count: result.mapping_count,
  }
}
