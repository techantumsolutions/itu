import {
  extractDisplayPriceFromName,
  normalizeDisplayAmount,
  type SystemPlanMergeRow,
} from '@/lib/aggregator/plan-display-merge'
import type { PlanRechargeValue } from '@/lib/catalog/plan-recharge-value'

export type SystemPlanRechargeSource = 'system_price' | 'display_name' | 'mapping_raw'

export type SystemPlanRechargeIdentity = PlanRechargeValue & {
  source: SystemPlanRechargeSource
}

function positiveAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * Recharge value for merge + admin popup parity.
 * Priority:
 * 1. system_plans.price / amount + currency
 * 2. Normalized face value from plan display name
 * 3. Mapping-derived recharge (admin popup provider_plans_raw path)
 */
export function resolveSystemPlanRechargeIdentity(input: {
  amount?: number | null
  currency?: string | null
  price?: number | null
  systemPlanName?: string | null
  countryCode?: string | null
  mappingRecharge?: PlanRechargeValue | null
}): SystemPlanRechargeIdentity | null {
  const priceAmount = positiveAmount(input.price ?? input.amount)
  const priceCurrency = String(input.currency ?? '').trim().toUpperCase()
  if (priceAmount != null && priceCurrency) {
    return { amount: priceAmount, currency: priceCurrency, source: 'system_price' }
  }

  const fromName = extractDisplayPriceFromName(input.systemPlanName, input.countryCode)
  if (fromName) {
    return {
      amount: fromName.amount,
      currency: fromName.currency,
      source: 'display_name',
    }
  }

  const mapping = input.mappingRecharge
  if (mapping && positiveAmount(mapping.amount) != null && mapping.currency) {
    return {
      amount: mapping.amount,
      currency: mapping.currency.toUpperCase(),
      source: 'mapping_raw',
    }
  }

  return null
}

export function buildCountryOperatorRechargeMergeKey(input: {
  countryCode: string
  systemOperatorId: string
  recharge: PlanRechargeValue
}): string {
  const country = input.countryCode.trim().toUpperCase() || 'UNK'
  const operatorId = input.systemOperatorId.trim()
  const currency = input.recharge.currency.trim().toUpperCase()
  const amount = normalizeDisplayAmount(input.recharge.amount)
  return `${country}:${operatorId}:${currency}:${amount}`
}

export type CountryOperatorRechargeGroup = {
  key: string
  countryCode: string
  systemOperatorId: string
  recharge: PlanRechargeValue
  plans: SystemPlanMergeRow[]
}

/**
 * Group system plans by same country + operator + recharge value only.
 * Skips plans where recharge identity cannot be resolved.
 */
export function groupPlansByCountryOperatorRecharge(
  plans: SystemPlanMergeRow[],
  mappingRechargeByPlanId: Map<string, PlanRechargeValue>,
): Map<string, CountryOperatorRechargeGroup> {
  const groups = new Map<string, CountryOperatorRechargeGroup>()

  for (const plan of plans) {
    const operatorId = String(plan.system_operator_id ?? '').trim()
    const countryCode = (String(plan.country_code ?? 'UNK').trim().toUpperCase()) || 'UNK'
    if (!operatorId) continue

    const identity = resolveSystemPlanRechargeIdentity({
      amount: plan.amount,
      currency: plan.currency,
      systemPlanName: plan.system_plan_name,
      countryCode,
      mappingRecharge: mappingRechargeByPlanId.get(plan.id) ?? null,
    })
    if (!identity) continue

    const key = buildCountryOperatorRechargeMergeKey({
      countryCode,
      systemOperatorId: operatorId,
      recharge: { amount: identity.amount, currency: identity.currency },
    })

    const existing = groups.get(key)
    if (existing) {
      if (!existing.plans.some((row) => row.id === plan.id)) existing.plans.push(plan)
      continue
    }

    groups.set(key, {
      key,
      countryCode,
      systemOperatorId: operatorId,
      recharge: { amount: identity.amount, currency: identity.currency },
      plans: [plan],
    })
  }

  return groups
}
