import { extractPricingFromRaw } from '@/lib/pricing/provider-pricing-extractor'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'

export type ProviderRawPlanRow = {
  id: string
  provider_id: string
  provider_plan_id: string
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  catalog_status?: string | null
  raw_json?: unknown
}

export type ProviderRechargeAmountField = 'send_value' | 'face_value' | 'none'

export type ResolvedProviderRechargeAmount = {
  providerAmount: number | null
  providerCurrency: string | null
  amountField: ProviderRechargeAmountField
  minAmount: number | null
  maxAmount: number | null
  receiveAmount: number | null
  receiveCurrency: string | null
}

function finiteAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function currencyCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return code || null
}

function numFromRaw(obj: Record<string, unknown> | undefined, path: string): number | null {
  if (!obj) return null
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }
  return finiteAmount(current)
}

function currencyFromRaw(obj: Record<string, unknown> | undefined, path: string): string | null {
  if (!obj) return null
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (!current || typeof current !== 'object') return null
    current = (current as Record<string, unknown>)[part]
  }
  return currencyCode(current)
}

/** Ding expects SendValue in send currency (Minimum.SendValue), not customer retail price. */
export function resolveDingRechargeAmount(rawPlan: ProviderRawPlanRow | null | undefined): ResolvedProviderRechargeAmount {
  const raw = (rawPlan?.raw_json ?? {}) as Record<string, unknown>
  const minimum = raw.Minimum as Record<string, unknown> | undefined
  const maximum = raw.Maximum as Record<string, unknown> | undefined

  const sendValue =
    numFromRaw(raw, 'Minimum.SendValue') ??
    finiteAmount(rawPlan?.amount) ??
    resolveWholesalePricing({
      rawJson: rawPlan?.raw_json,
      amount: rawPlan?.amount,
      currency: rawPlan?.currency,
    }).wholesaleAmount

  const sendCurrency =
    currencyFromRaw(raw, 'Minimum.SendCurrencyIso') ??
    currencyCode(rawPlan?.currency) ??
    resolveWholesalePricing({
      rawJson: rawPlan?.raw_json,
      amount: rawPlan?.amount,
      currency: rawPlan?.currency,
    }).wholesaleCurrency

  const receiveAmount =
    numFromRaw(raw, 'Minimum.ReceiveValue') ?? finiteAmount(rawPlan?.destination_amount)
  const receiveCurrency =
    currencyFromRaw(raw, 'Minimum.ReceiveCurrencyIso') ?? currencyCode(rawPlan?.destination_currency)

  const minAmount = sendValue
  const maxAmount =
    numFromRaw(raw, 'Maximum.SendValue') ??
    (minimum?.SendValue != null ? sendValue : null) ??
    sendValue

  return {
    providerAmount: sendValue,
    providerCurrency: sendCurrency,
    amountField: 'send_value',
    minAmount,
    maxAmount,
    receiveAmount,
    receiveCurrency,
  }
}

/** ValueTopup expects face value (min.faceValue) in min.faceValueCurrency. */
export function resolveValueTopupRechargeAmount(
  rawPlan: ProviderRawPlanRow | null | undefined,
  providerPlanId?: string,
): ResolvedProviderRechargeAmount {
  const raw = (rawPlan?.raw_json ?? {}) as Record<string, unknown>
  const minBlock = raw.min as Record<string, unknown> | undefined
  const maxBlock = raw.max as Record<string, unknown> | undefined

  const sep = (providerPlanId ?? '').indexOf(':')
  const amountFromId = sep > 0 ? finiteAmount((providerPlanId ?? '').slice(sep + 1)) : null

  const faceValue =
    amountFromId ??
    finiteAmount(minBlock?.faceValue) ??
    finiteAmount(rawPlan?.destination_amount) ??
    finiteAmount(rawPlan?.amount)

  const faceCurrency =
    currencyFromRaw(raw, 'min.faceValueCurrency') ??
    currencyCode(rawPlan?.destination_currency) ??
    currencyCode(rawPlan?.currency) ??
    'USD'

  const minAmount = finiteAmount(minBlock?.faceValue) ?? faceValue
  const maxAmount = finiteAmount(maxBlock?.faceValue) ?? minAmount

  return {
    providerAmount: faceValue,
    providerCurrency: faceCurrency,
    amountField: 'face_value',
    minAmount,
    maxAmount,
    receiveAmount: faceValue,
    receiveCurrency: faceCurrency,
  }
}

/** DT One uses a fixed product_id; amount is embedded in the product. */
export function resolveDtoneRechargeAmount(
  rawPlan: ProviderRawPlanRow | null | undefined,
): ResolvedProviderRechargeAmount {
  const raw = (rawPlan?.raw_json ?? {}) as Record<string, unknown>
  const destination = raw.destination as Record<string, unknown> | undefined

  return {
    providerAmount: null,
    providerCurrency: null,
    amountField: 'none',
    minAmount: null,
    maxAmount: null,
    receiveAmount:
      finiteAmount(destination?.amount) ?? finiteAmount(rawPlan?.destination_amount),
    receiveCurrency:
      currencyCode(destination?.unit) ?? currencyCode(rawPlan?.destination_currency),
  }
}

/** Resolve the provider-specific recharge amount from catalog raw plan data. */
export function resolveProviderRechargeAmount(input: {
  adapterKey: string
  rawPlan: ProviderRawPlanRow | null | undefined
  providerPlanId?: string
}): ResolvedProviderRechargeAmount {
  const adapter = (input.adapterKey || '').toLowerCase()
  if (adapter === 'ding') return resolveDingRechargeAmount(input.rawPlan)
  if (adapter === 'valuetopup') {
    return resolveValueTopupRechargeAmount(input.rawPlan, input.providerPlanId)
  }
  if (adapter === 'dtone') return resolveDtoneRechargeAmount(input.rawPlan)

  const extracted = extractPricingFromRaw(input.rawPlan?.raw_json ?? null)
  const wholesale = resolveWholesalePricing({
    rawJson: input.rawPlan?.raw_json,
    amount: input.rawPlan?.amount,
    currency: input.rawPlan?.currency,
    destinationAmount: input.rawPlan?.destination_amount,
    destinationCurrency: input.rawPlan?.destination_currency,
  })

  const providerAmount =
    wholesale.wholesaleAmount ??
    finiteAmount(extracted.providerCost) ??
    finiteAmount(extracted.basePrice)

  return {
    providerAmount,
    providerCurrency:
      wholesale.wholesaleCurrency ?? currencyCode(extracted.currency) ?? currencyCode(input.rawPlan?.currency),
    amountField: providerAmount != null ? 'send_value' : 'none',
    minAmount: finiteAmount(extracted.min) ?? providerAmount,
    maxAmount: finiteAmount(extracted.max) ?? providerAmount,
    receiveAmount: wholesale.destinationAmount ?? finiteAmount(extracted.basePrice),
    receiveCurrency:
      wholesale.destinationCurrency ?? currencyCode(extracted.currency) ?? currencyCode(input.rawPlan?.destination_currency),
  }
}

/** Check whether a resolved amount falls within provider min/max bounds. */
export function isAmountWithinProviderRange(
  amount: number | null,
  min: number | null,
  max: number | null,
): boolean {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return false
  if (min != null && amount < min - 0.001) return false
  if (max != null && amount > max + 0.001) return false
  return true
}
