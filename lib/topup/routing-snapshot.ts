import type { RoutingProviderCandidate, RoutingResolveResult } from '@/lib/routing/types'
import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'

export type EvaluatedProviderSnapshot = {
  providerId: string
  providerName: string
  activeStatus: boolean
  onlineStatus: string
  mappingExists: boolean
  costPrice: number | null
  currency: string | null
  destinationFaceValue: number | null
  destinationCurrency: string | null
  normalizedPrice: number | null
  margin: number | null
  priority: number
  eligibility: boolean
  filterReason: string
}

export type RoutingDecisionSnapshot = {
  transaction_id: string
  internal_plan_id: string
  system_plan_id: string | null
  routing_strategy: string
  routing_rule_matched: boolean
  routing_rule_id: string | null
  routing_rule_provider: string | null
  candidate_provider_count: number
  eligible_provider_count: number
  filtered_provider_count: number
  selected_provider: string | null
  selected_provider_id: string | null
  selected_provider_plan_id: string | null
  selected_provider_cost: number | null
  selected_provider_currency: string | null
  fallback_queue: string[]
  routing_decision_reason: string
  evaluated_providers: EvaluatedProviderSnapshot[]
  internal_plan_id_verify: string
  mapping_count: number
  provider_selection_timestamp: string
  /** Frozen primary candidate for post-payment execution (no re-LCR). */
  locked_candidate: RoutingProviderCandidate | null
}

export type LcrSelectionResult = {
  routingType: string
  ruleApplied: string
  ruleName?: string
  ruleId?: string
  selectedProviderId: string | null
  selectedProviderName: string | null
  selectedProviderPlanId: string | null
  selectedProviderCost: number | null
  selectedProviderCurrency: string | null
  routingDecisionReason: string
}

export function buildEvaluatedProviderSnapshots(routingResult: RoutingResolveResult): EvaluatedProviderSnapshot[] {
  return (routingResult.evaluated || []).map((e: RoutingProviderCandidate & { filterReason?: string; reason?: string }) => {
    const isFiltered = !e.eligible
    const filterReason = e.filterReason || e.reason || (e.eligible ? 'ELIGIBLE' : 'PRICE_MISSING')
    return {
      providerId: e.providerId,
      providerName: e.providerName || e.providerId,
      activeStatus: e.activeStatus ?? e.eligible,
      onlineStatus: e.onlineStatus ?? 'unknown',
      mappingExists: e.mappingExists ?? true,
      costPrice: e.provider_wholesale_amount ?? e.price ?? null,
      currency: e.provider_wholesale_currency ?? e.currency ?? null,
      destinationFaceValue: e.destination_face_value ?? null,
      destinationCurrency: e.destination_currency ?? null,
      normalizedPrice: e.normalized_provider_price ?? null,
      margin: e.margin ?? null,
      priority: e.providerPriority ?? 100,
      eligibility: e.eligible,
      filterReason,
    }
  })
}

export async function buildRoutingDecisionSnapshot(input: {
  transactionId: string
  planId: string
  systemPlanId?: string
  routingResult: RoutingResolveResult
  /** Final locked provider (may differ from routing primary when failover pre-validation runs). */
  lockedCandidate?: RoutingProviderCandidate
  fallbackQueue?: string[]
}): Promise<{ snapshot: RoutingDecisionSnapshot; lcrResult: LcrSelectionResult } | null> {
  const { routingResult } = input
  const selected = input.lockedCandidate ?? routingResult.selected
  if (!selected) return null

  const evaluated_providers = buildEvaluatedProviderSnapshots(routingResult)
  const candidate_provider_count = evaluated_providers.filter((e) => e.mappingExists !== false).length
  const eligible_provider_count = evaluated_providers.filter((e) => e.eligibility).length
  const filtered_provider_count = candidate_provider_count - eligible_provider_count
  const routingDecisionReason =
    routingResult.routing_decision_reason ||
    (routingResult.routingType === 'RULE' ? 'RULE_MATCHED' : 'LEAST_COST_SELECTED')

  const planLink = await resolveSystemPlanFromInternalPlan(input.systemPlanId || input.planId)
  const canonicalInternalPlanId = planLink?.internalPlanId ?? input.planId
  const canonicalSystemPlanId = input.systemPlanId ?? planLink?.systemPlanId ?? null

  const selectedProviderCost = selected.provider_wholesale_amount ?? selected.price ?? null
  const selectedProviderCurrency = selected.provider_wholesale_currency ?? selected.currency ?? null
  const fallbackQueue =
    input.fallbackQueue ??
    (routingResult.fallbacks ?? []).map((f) => f.providerName || f.providerId)

  const snapshot: RoutingDecisionSnapshot = {
    transaction_id: input.transactionId,
    internal_plan_id: canonicalInternalPlanId,
    system_plan_id: canonicalSystemPlanId,
    routing_strategy: routingResult.settings?.routingStrategy || 'LEAST_COST',
    routing_rule_matched: routingResult.routingType === 'RULE',
    routing_rule_id: routingResult.ruleId || null,
    routing_rule_provider:
      routingResult.routingType === 'RULE'
        ? routingResult.selected?.providerName || routingResult.selected?.providerId || null
        : null,
    candidate_provider_count,
    eligible_provider_count,
    filtered_provider_count,
    selected_provider: selected.providerName || selected.providerId || null,
    selected_provider_id: selected.providerId,
    selected_provider_plan_id: selected.providerPlanId ?? null,
    selected_provider_cost: selectedProviderCost,
    selected_provider_currency: selectedProviderCurrency,
    fallback_queue: fallbackQueue,
    routing_decision_reason: routingDecisionReason,
    evaluated_providers,
    internal_plan_id_verify: canonicalInternalPlanId,
    mapping_count: routingResult.mapping_count ?? candidate_provider_count,
    provider_selection_timestamp: new Date().toISOString(),
    locked_candidate: selected,
  }

  const lcrResult: LcrSelectionResult = {
    routingType: routingResult.routingType,
    ruleApplied: routingResult.ruleApplied,
    ruleName: routingResult.ruleName,
    ruleId: routingResult.ruleId,
    selectedProviderId: selected.providerId,
    selectedProviderName: selected.providerName || selected.providerId,
    selectedProviderPlanId: selected.providerPlanId ?? '',
    selectedProviderCost: selectedProviderCost,
    selectedProviderCurrency: selectedProviderCurrency ?? null,
    routingDecisionReason,
  }

  return { snapshot, lcrResult }
}
