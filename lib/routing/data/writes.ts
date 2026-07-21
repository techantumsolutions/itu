/**
 * Split from impl.ts — behavior preserved. Public API via ./index.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import type { RechargeRoutingSource } from '@/lib/recharge-orchestration/routing-log-fields'
import type {
  LcrEngineSettings,
  ProviderPriorityRow,
  RoutingLogRow,
  RoutingRuleRow,
  RoutingStrategy,
  FallbackStrategy,
} from '@/lib/routing/types'
import { getLcrEngineSettings, getRoutingRule, listProviderPriorities } from './queries'
import { enc, mapSettings } from './shared'

export async function upsertLcrEngineSettings(input: Partial<LcrEngineSettings>): Promise<LcrEngineSettings | null> {
  const existing = await getLcrEngineSettings()
  const payload: Record<string, unknown> = {}
  if (input.enabled !== undefined) payload.enabled = input.enabled
  if (input.routingStrategy !== undefined) payload.routing_strategy = input.routingStrategy
  if (input.fallbackStrategy !== undefined) payload.fallback_strategy = input.fallbackStrategy
  if (input.autoFailover !== undefined) payload.auto_failover = input.autoFailover
  if (input.retryEnabled !== undefined) payload.retry_enabled = input.retryEnabled
  if (input.retryAttempts !== undefined) payload.retry_attempts = input.retryAttempts

  const res = existing
    ? await supabaseRest(`lcr_engine_settings?id=eq.${enc(existing.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(payload),
      })
    : await supabaseRest('lcr_engine_settings', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          enabled: true,
          routing_strategy: 'LEAST_COST',
          fallback_strategy: 'NEXT_PROVIDER',
          auto_failover: true,
          retry_enabled: true,
          retry_attempts: 2,
          ...payload,
        }),
      })

  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? mapSettings(rows[0]) : null
}

export async function replaceProviderPriorities(
  items: Array<{ providerId: string; priority: number }>,
): Promise<ProviderPriorityRow[]> {
  for (const item of items) {
    await supabaseRest(
      `lcr_providers?id=eq.${enc(item.providerId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ priority: item.priority }),
      },
    )
  }
  return listProviderPriorities()
}

export async function createRoutingRule(input: {
  ruleName: string
  countryId?: string | null
  operatorId?: string | null
  productType?: string | null
  providerId: string
  priority?: number
  status?: 'ACTIVE' | 'INACTIVE'
  effectiveFrom?: string | null
  effectiveTo?: string | null
}): Promise<RoutingRuleRow | null> {
  const res = await supabaseRest('routing_rules', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      rule_name: input.ruleName,
      country_id: input.countryId ?? null,
      operator_id: input.operatorId ?? null,
      product_type: input.productType ?? null,
      provider_id: input.providerId,
      priority: input.priority ?? 100,
      status: input.status ?? 'ACTIVE',
      effective_from: input.effectiveFrom ?? null,
      effective_to: input.effectiveTo ?? null,
    }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Record<string, unknown>[]
  return rows[0] ? getRoutingRule(String(rows[0].id)) : null
}

export async function updateRoutingRule(
  id: string,
  input: Partial<{
    ruleName: string
    countryId: string | null
    operatorId: string | null
    productType: string | null
    providerId: string
    priority: number
    status: 'ACTIVE' | 'INACTIVE'
    effectiveFrom: string | null
    effectiveTo: string | null
  }>,
): Promise<RoutingRuleRow | null> {
  const payload: Record<string, unknown> = {}
  if (input.ruleName !== undefined) payload.rule_name = input.ruleName
  if (input.countryId !== undefined) payload.country_id = input.countryId
  if (input.operatorId !== undefined) payload.operator_id = input.operatorId
  if (input.productType !== undefined) payload.product_type = input.productType
  if (input.providerId !== undefined) payload.provider_id = input.providerId
  if (input.priority !== undefined) payload.priority = input.priority
  if (input.status !== undefined) payload.status = input.status
  if (input.effectiveFrom !== undefined) payload.effective_from = input.effectiveFrom
  if (input.effectiveTo !== undefined) payload.effective_to = input.effectiveTo

  const res = await supabaseRest(`routing_rules?id=eq.${enc(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) return null
  return getRoutingRule(id)
}

export async function deleteRoutingRule(id: string): Promise<boolean> {
  const res = await supabaseRest(`routing_rules?id=eq.${enc(id)}`, { method: 'DELETE' })
  return res.ok
}

export async function insertRoutingLog(input: {
  transactionId?: string
  countryId?: string
  operatorId?: string
  productId?: string
  providerId?: string
  routingType: 'RULE' | 'LCR'
  providerCost?: number
  fallbackUsed?: boolean
  status?: string
}): Promise<string | null> {
  const res = await supabaseRest('routing_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      transaction_id: input.transactionId ?? null,
      country_id: input.countryId ?? null,
      operator_id: input.operatorId ?? null,
      product_id: input.productId ?? null,
      provider_id: input.providerId ?? null,
      routing_type: input.routingType,
      provider_cost: input.providerCost ?? null,
      fallback_used: input.fallbackUsed ?? false,
      status: input.status ?? 'SELECTED',
    }),
  })
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{ id?: string }>
  return rows[0]?.id ?? null
}

export async function insertDetailedRoutingLog(input: {
  transactionId: string
  countryCode: string
  operatorCode: string
  planId: string
  routingStrategy: string
  routingRuleMatched: 'Yes' | 'No'
  routingRuleId?: string | null
  routingRuleProvider?: string | null
  selectedProvider?: string | null
  attemptNumber?: number
  /** @deprecated Use providerWholesaleAmount — kept for routing_logs.provider_cost column */
  providerCost?: number
  providerCurrency?: string | null
  providerWholesaleAmount?: number | null
  providerWholesaleCurrency?: string | null
  destinationFaceValue?: number | null
  destinationCurrency?: string | null
  normalizedProviderPrice?: number | null
  userAmount?: number | null
  userCurrency?: string | null
  providerPlanId?: string | null
  providerDestinationAmount?: number | null
  providerDestinationCurrency?: string | null
  providerPriority?: number
  executionResult: string
  failureReason?: string | null
  responseCode?: string | null
  responseMessage?: string | null
  verificationMappingCount?: number | null
  systemPlanId?: string | null
  internalPlanId?: string | null
  providerPlanRawId?: string | null
  routingSource?: RechargeRoutingSource | null
}): Promise<string | null> {
  const wholesaleAmount = input.providerWholesaleAmount ?? input.providerCost ?? null
  const wholesaleCurrency = input.providerWholesaleCurrency ?? input.providerCurrency ?? null
  const destinationFace = input.destinationFaceValue ?? input.providerDestinationAmount ?? null
  const destinationCurrency = input.destinationCurrency ?? input.providerDestinationCurrency ?? null

  const details = {
    routingStrategy: input.routingStrategy,
    routingRuleMatched: input.routingRuleMatched,
    routingRuleId: input.routingRuleId ?? null,
    routingRuleProvider: input.routingRuleProvider ?? null,
    attemptNumber: input.attemptNumber ?? null,
    providerPriority: input.providerPriority ?? null,
    providerCurrency: wholesaleCurrency,
    providerPlanId: input.providerPlanId ?? null,
    providerDestinationAmount: destinationFace,
    providerDestinationCurrency: destinationCurrency,
    provider_wholesale_amount: wholesaleAmount,
    provider_wholesale_currency: wholesaleCurrency,
    destination_face_value: destinationFace,
    destination_currency: destinationCurrency,
    normalized_provider_price: input.normalizedProviderPrice ?? null,
    selected_provider: input.selectedProvider ?? null,
    userAmount: input.userAmount ?? null,
    userCurrency: input.userCurrency ?? null,
    failureReason: input.failureReason ?? null,
    responseCode: input.responseCode ?? null,
    responseMessage: input.responseMessage ?? null,
    verificationMappingCount: input.verificationMappingCount ?? null,
    system_plan_id: input.systemPlanId ?? null,
    internal_plan_id: input.internalPlanId ?? input.planId ?? null,
    provider_id: input.selectedProvider ?? null,
    provider_plan_id: input.providerPlanId ?? null,
    provider_plan_raw_id: input.providerPlanRawId ?? null,
    routing_source: input.routingSource ?? null,
  }

  const res = await supabaseRest('routing_logs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      transaction_id: input.transactionId,
      country_id: input.countryCode,
      operator_id: input.operatorCode,
      product_id: input.planId,
      provider_id: input.selectedProvider || null,
      routing_type: input.routingRuleMatched === 'Yes' ? 'RULE' : 'LCR',
      provider_cost: wholesaleAmount,
      fallback_used: (input.attemptNumber ?? 1) > 1,
      status: JSON.stringify({
        event: input.executionResult,
        ...details
      })
    })
  })

  if (!res.ok) return null
  try {
    const rows = (await res.json()) as Array<{ id?: string }>
    return rows[0]?.id ?? null
  } catch {
    return null
  }
}
