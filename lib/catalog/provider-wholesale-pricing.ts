import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import type { NormalizedPlan } from '@/lib/providers/types'
import { isValueTopupSkuRaw, resolveValueTopupPricing, resolveValueTopupWholesaleFromRow } from '@/lib/catalog/valuetopup-pricing'

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
    | 'raw'
  >,
): WholesalePricing {
  if (plan.raw) {
    const fromRaw = resolveWholesalePricing({
      rawJson: plan.raw,
      wholesaleAmount: plan.wholesaleAmount ?? null,
      wholesaleCurrency: plan.wholesaleCurrency ?? null,
      retailAmount: plan.retailAmount ?? null,
      retailCurrency: plan.retailCurrency ?? null,
      destinationAmount: plan.destinationAmount ?? null,
      destinationCurrency: plan.destinationUnit ?? null,
    })
    if (fromRaw.wholesaleAmount != null) {
      return fromRaw
    }
  }

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

function isDtoneProductRaw(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  const r = raw as Record<string, unknown>
  const dest = r.destination
  return (
    dest != null &&
    typeof dest === 'object' &&
    (r.source != null || (r.prices != null && typeof r.prices === 'object'))
  )
}

/** DT One: source / prices.wholesale = ITU cost; destination = customer face value. */
function resolveDtoneWholesaleFromRaw(raw: Record<string, unknown>): WholesalePricing {
  const dest = raw.destination as Record<string, unknown> | undefined
  const src = raw.source as Record<string, unknown> | undefined
  const prices = raw.prices as Record<string, unknown> | undefined
  const wholesale = prices?.wholesale as Record<string, unknown> | undefined

  const destinationAmount = finiteAmount(dest?.amount)
  const destinationCurrency = currencyCode(dest?.unit)

  const wholesaleAmount = finiteAmount(wholesale?.amount) ?? finiteAmount(src?.amount)
  const wholesaleCurrency = currencyCode(wholesale?.unit) ?? currencyCode(src?.unit)

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
    null

  // ValueTopup: provider_plans_raw.amount/currency = EUR distributor cost; raw JSON = destination.
  if (input.rawJson && isValueTopupSkuRaw(input.rawJson)) {
    const vt = resolveValueTopupPricing(input.rawJson as Record<string, unknown>)
    const fromRow = resolveValueTopupWholesaleFromRow({
      amount: input.amount,
      currency: input.currency,
      rawJson: input.rawJson,
    })
    return {
      wholesaleAmount: fromRow.wholesaleAmount ?? vt.wholesaleAmount ?? wholesaleAmount,
      wholesaleCurrency: fromRow.wholesaleCurrency ?? vt.wholesaleCurrency ?? wholesaleCurrency,
      destinationAmount:
        vt.destinationAmount ??
        finiteAmount(input.destinationAmount) ??
        finiteAmount(extracted.basePrice),
      destinationCurrency:
        vt.destinationCurrency ??
        currencyCode(input.destinationCurrency) ??
        (extracted.basePrice != null ? currencyCode(extracted.currency) : null),
    }
  }

  // DT One: never use destination.amount or provider_plans_raw.amount as wholesale.
  if (input.rawJson && isDtoneProductRaw(input.rawJson)) {
    const dt = resolveDtoneWholesaleFromRaw(input.rawJson as Record<string, unknown>)
    if (dt.wholesaleAmount != null) {
      return {
        wholesaleAmount: dt.wholesaleAmount,
        wholesaleCurrency: dt.wholesaleCurrency,
        destinationAmount:
          dt.destinationAmount ??
          finiteAmount(input.destinationAmount) ??
          finiteAmount(extracted.basePrice),
        destinationCurrency:
          dt.destinationCurrency ??
          currencyCode(input.destinationCurrency) ??
          (extracted.basePrice != null ? currencyCode(extracted.currency) : null),
      }
    }
  }

  // Legacy rows: amount column may store destination face value — do not treat as wholesale.
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
