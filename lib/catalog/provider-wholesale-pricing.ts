import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import type { NormalizedPlan } from '@/lib/providers/types'

export type WholesalePricing = {
  wholesaleAmount: number | null
  wholesaleCurrency: string | null
  destinationAmount: number | null
  destinationCurrency: string | null
}

function finiteAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function currencyCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return code || null
}

/** Wholesale cost ITU pays the B2B provider (never destination face value). */
export function wholesaleCostFromNormalizedPlan(
  plan: Pick<
    NormalizedPlan,
    | 'wholesaleAmount'
    | 'wholesaleCurrency'
    | 'retailAmount'
    | 'retailCurrency'
    | 'destinationAmount'
    | 'destinationUnit'
  >,
): WholesalePricing {
  const destinationAmount = finiteAmount(plan.destinationAmount)
  const destinationCurrency = currencyCode(plan.destinationUnit)

  const wholesaleAmount =
    finiteAmount(plan.wholesaleAmount) ??
    finiteAmount(plan.retailAmount)
  const wholesaleCurrency =
    currencyCode(plan.wholesaleCurrency) ?? currencyCode(plan.retailCurrency)

  return {
    wholesaleAmount,
    wholesaleCurrency,
    destinationAmount,
    destinationCurrency,
  }
}

export function resolveWholesalePricing(input: {
  rawJson?: unknown
  amount?: number | null
  currency?: string | null
  wholesaleAmount?: number | null
  wholesaleCurrency?: string | null
  retailAmount?: number | null
  retailCurrency?: string | null
  destinationAmount?: number | null
  destinationCurrency?: string | null
}): WholesalePricing {
  const extracted = extractPricingFromRaw(input.rawJson ?? null)

  const destinationAmount =
    finiteAmount(input.destinationAmount) ??
    finiteAmount(extracted.basePrice)
  const destinationCurrency =
    currencyCode(input.destinationCurrency) ?? currencyCode(extracted.currency)

  let wholesaleAmount =
    finiteAmount(input.wholesaleAmount) ??
    finiteAmount(extracted.providerCost) ??
    finiteAmount(input.amount) ??
    finiteAmount(input.retailAmount)

  let wholesaleCurrency =
    currencyCode(input.wholesaleCurrency) ??
    currencyCode(input.currency) ??
    currencyCode(input.retailCurrency) ??
    currencyCode(extracted.currency)

  // If column amount equals destination face value, prefer extracted wholesale/send cost.
  if (
    wholesaleAmount != null &&
    destinationAmount != null &&
    wholesaleAmount === destinationAmount &&
    finiteAmount(extracted.providerCost) != null &&
    extracted.providerCost !== destinationAmount
  ) {
    wholesaleAmount = finiteAmount(extracted.providerCost)
  }

  if (
    wholesaleAmount != null &&
    destinationAmount != null &&
    wholesaleAmount === destinationAmount &&
    finiteAmount(input.retailAmount) != null &&
    input.retailAmount !== destinationAmount
  ) {
    wholesaleAmount = finiteAmount(input.retailAmount)
  }

  // Ding-style: explicit send/receive in raw JSON when extractor missed them.
  if (input.rawJson && typeof input.rawJson === 'object') {
    const raw = input.rawJson as Record<string, unknown>
    const minimum = raw.Minimum as Record<string, unknown> | undefined
    const sendValue = finiteAmount(minimum?.SendValue)
    const sendCurrency = currencyCode(minimum?.SendCurrencyIso)
    const receiveValue = finiteAmount(minimum?.ReceiveValue)
    const receiveCurrency = currencyCode(minimum?.ReceiveCurrencyIso)

    if (sendValue != null) {
      wholesaleAmount = sendValue
      wholesaleCurrency = sendCurrency ?? wholesaleCurrency
    }
    if (receiveValue != null) {
      return {
        wholesaleAmount,
        wholesaleCurrency,
        destinationAmount: receiveValue,
        destinationCurrency: receiveCurrency ?? destinationCurrency,
      }
    }
  }

  return {
    wholesaleAmount,
    wholesaleCurrency,
    destinationAmount,
    destinationCurrency,
  }
}

export function planMappingPricingKey(
  internalPlanId: string,
  providerId: string,
  providerPlanId?: string | null,
): string {
  return `${internalPlanId}:${providerId}:${providerPlanId ?? ''}`
}
