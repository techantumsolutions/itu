import { supabaseRest } from '@/lib/db/supabase-rest'
import { batchLoadSystemPlanMappedDetails } from '@/lib/catalog/system-plan-mapped-details'
import type { PlanRechargeValue } from '@/lib/catalog/raw-plan-recharge'
import { normalizeProviderCostSync } from '@/lib/routing/normalize-provider-cost'

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

/** Legacy catalog `plans` table recharge face value by SKU. */
export async function batchLoadLegacySkuRechargeValues(
  skuCodes: string[],
): Promise<Map<string, PlanRechargeValue>> {
  const result = new Map<string, PlanRechargeValue>()
  const unique = [...new Set(skuCodes.map((s) => s.trim()).filter(Boolean))]
  if (!unique.length) return result

  const finite = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }

  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50)
    const res = await supabaseRest(
      `plans?sku_code=in.(${chunk.map(enc).join(',')})&select=sku_code,min_receive_amount,receive_currency,price_inr`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{
      sku_code?: string | null
      min_receive_amount?: number | string | null
      receive_currency?: string | null
      price_inr?: number | string | null
    }>
    for (const row of rows) {
      const sku = String(row.sku_code ?? '').trim()
      if (!sku) continue
      const amount = finite(row.min_receive_amount) ?? finite(row.price_inr)
      if (amount == null) continue
      const currency =
        String(row.receive_currency ?? '').trim().toUpperCase() ||
        (finite(row.price_inr) != null ? 'INR' : '')
      if (!currency) continue
      result.set(sku, { amount, currency })
    }
  }

  return result
}

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
