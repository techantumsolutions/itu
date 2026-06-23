import { supabaseRest } from '@/lib/db/supabase-rest'
import { batchLoadSystemPlanMappedDetails } from '@/lib/catalog/system-plan-mapped-details'
import type { PlanRechargeValue } from '@/lib/catalog/raw-plan-recharge'

export type { PlanRechargeValue } from '@/lib/catalog/raw-plan-recharge'
export { rechargeValueFromRawPlan } from '@/lib/catalog/raw-plan-recharge'

function enc(v: string): string {
  return encodeURIComponent(v)
}

/** Batch-resolve customer-facing recharge value via plan_mappings → provider_plans_raw. */
export async function batchLoadSystemPlanRechargeValues(
  systemPlanIds: string[],
): Promise<Map<string, PlanRechargeValue>> {
  const mapped = await batchLoadSystemPlanMappedDetails(systemPlanIds)
  const result = new Map<string, PlanRechargeValue>()
  for (const [systemPlanId, details] of mapped) {
    result.set(systemPlanId, details.recharge)
  }
  return result
}

export function formatPlanRechargeValue(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '—'
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
  const code = (currency ?? '').trim().toUpperCase()
  return code ? `${formatted} ${code}` : formatted
}

/** Resolve recharge values keyed by internal_plan.id via linked system_plans. */
export async function batchLoadInternalPlanRechargeValues(
  internalPlanIds: string[],
): Promise<Map<string, PlanRechargeValue>> {
  const result = new Map<string, PlanRechargeValue>()
  const uniqueIds = [...new Set(internalPlanIds.filter(Boolean))]
  if (!uniqueIds.length) return result

  const internalToSystem = new Map<string, string>()
  for (let i = 0; i < uniqueIds.length; i += 50) {
    const chunk = uniqueIds.slice(i, i + 50)
    const res = await supabaseRest(
      `system_plans?internal_plan_id=in.(${chunk.map(enc).join(',')})&select=id,internal_plan_id&status=eq.ACTIVE`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ id: string; internal_plan_id?: string | null }>
    for (const row of rows) {
      if (row.internal_plan_id && row.id) {
        internalToSystem.set(row.internal_plan_id, row.id)
      }
    }
  }

  const rechargeBySystem = await batchLoadSystemPlanRechargeValues([...internalToSystem.values()])
  for (const [internalPlanId, systemPlanId] of internalToSystem) {
    const recharge = rechargeBySystem.get(systemPlanId)
    if (recharge) result.set(internalPlanId, recharge)
  }
  return result
}

import { normalizeProviderCostSync } from '@/lib/routing/normalize-provider-cost'

export function derivedDisplayPrices(amount: number, currency: string): { price_inr: number; price_eur: number } {
  const inr = normalizeProviderCostSync({
    provider_price: amount,
    provider_currency: currency,
    base_currency: 'INR',
  })
  const eur = normalizeProviderCostSync({
    provider_price: amount,
    provider_currency: currency,
    base_currency: 'EUR',
  })
  return {
    price_inr: inr.success ? Math.round(inr.normalized_provider_price) : 0,
    price_eur: eur.success ? Number(eur.normalized_provider_price.toFixed(2)) : 0,
  }
}

// Re-export batch loader for callers that only need mapped catalog details.
export { batchLoadSystemPlanMappedDetails } from '@/lib/catalog/system-plan-mapped-details'
export type { SystemPlanMappedDetails } from '@/lib/catalog/system-plan-mapped-details'
