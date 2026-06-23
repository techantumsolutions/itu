import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'

export type PlanRechargeValue = {
  amount: number
  currency: string
}

type RawPlanPricing = {
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
}

/** Same recharge face-value logic as admin products provider-cost popup. */
export function rechargeValueFromRawPlan(
  raw: RawPlanPricing | null | undefined,
): { amount: number | null; currency: string | null } {
  if (!raw) return { amount: null, currency: null }

  const wholesale = resolveWholesalePricing({
    rawJson: raw.raw_json,
    amount: raw.amount ?? null,
    currency: raw.currency ?? null,
    destinationAmount: raw.destination_amount ?? null,
    destinationCurrency: raw.destination_currency ?? null,
  })
  const extracted = extractPricingFromRaw(raw.raw_json ?? null)

  const amount =
    wholesale.destinationAmount ??
    raw.destination_amount ??
    extracted.basePrice ??
    extracted.finalPrice ??
    null

  const currency =
    wholesale.destinationCurrency ??
    raw.destination_currency ??
    (extracted.basePrice != null ? extracted.currency : null) ??
    null

  return { amount, currency }
}
