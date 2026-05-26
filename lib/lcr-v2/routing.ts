import { resolveProvider } from '@/lib/routing/routing-engine-service'
import type { LcrEngineSettings, RoutingType } from '@/lib/routing/types'

export type LcrV2Decision = {
  internalPlanId: string
  selected: {
    providerId: string
    providerPlanId: string
    providerCode?: string
    providerName?: string
    price?: number
    currency?: string
  } | null
  fallbacks: Array<{ providerId: string; providerPlanId: string; price?: number; currency?: string }>
  evaluated: Array<{ providerId: string; eligible: boolean; reason?: string; score?: number; price?: number; currency?: string }>
  ruleApplied: string
  routingType?: RoutingType
  ruleId?: string
  ruleName?: string
  logId?: string
  settings?: LcrEngineSettings | null
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
    selected: result.selected
      ? {
          providerId: result.selected.providerId,
          providerPlanId: result.selected.providerPlanId,
          providerCode: result.selected.providerCode,
          providerName: result.selected.providerName,
          price: result.selected.price,
          currency: result.selected.currency,
        }
      : null,
    fallbacks: result.fallbacks.map((f) => ({
      providerId: f.providerId,
      providerPlanId: f.providerPlanId,
      price: f.price,
      currency: f.currency,
    })),
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
  }
}
