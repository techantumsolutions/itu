import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'

export type RawPlanPricingRow = {
  amount?: number | null
  currency?: string | null
  wholesale_amount?: number | null
  wholesale_currency?: string | null
  source_amount?: number | null
  source_currency?: string | null
  retail_amount?: number | null
  retail_currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
}

export type ExtractedPricingAmounts = {
  wholesale_amount: number | null
  wholesale_currency: string | null
  destination_amount: number | null
  destination_currency: string | null
  source_amount: number | null
  source_currency: string | null
  retail_amount: number | null
  retail_currency: string | null
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return code || null
}

/** Treat 0, null, undefined, and empty strings as invalid. */
export function positiveAmount(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

function readJsonAmount(raw: unknown, keys: string[]): number | null {
  if (!raw || typeof raw !== 'object') return null
  const stack: unknown[] = [raw]
  const normalizedKeys = new Set(keys.map((k) => k.replace(/[^a-z0-9]/gi, '').toLowerCase()))

  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      stack.push(...node)
      continue
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nk = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (normalizedKeys.has(nk)) {
        const amount = positiveAmount(value)
        if (amount != null) return amount
      }
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return null
}

function readJsonCurrency(raw: unknown, keys: string[]): string | null {
  if (!raw || typeof raw !== 'object') return null
  const stack: unknown[] = [raw]
  const normalizedKeys = new Set(keys.map((k) => k.replace(/[^a-z0-9]/gi, '').toLowerCase()))

  while (stack.length) {
    const node = stack.pop()
    if (!node || typeof node !== 'object') continue
    if (Array.isArray(node)) {
      stack.push(...node)
      continue
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const nk = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
      if (normalizedKeys.has(nk)) {
        const currency = normalizeCurrency(value)
        if (currency) return currency
      }
      if (value && typeof value === 'object') stack.push(value)
    }
  }
  return null
}

/** Extract display tiers from provider_plans_raw (columns + raw_json). */
export function extractPricingAmounts(
  raw: RawPlanPricingRow | null | undefined,
): ExtractedPricingAmounts {
  const empty: ExtractedPricingAmounts = {
    wholesale_amount: null,
    wholesale_currency: null,
    destination_amount: null,
    destination_currency: null,
    source_amount: null,
    source_currency: null,
    retail_amount: null,
    retail_currency: null,
  }
  if (!raw) return empty

  const wholesale = resolveWholesalePricing({
    rawJson: raw.raw_json,
    amount: raw.amount ?? null,
    currency: raw.currency ?? null,
    wholesaleAmount: raw.wholesale_amount ?? null,
    wholesaleCurrency: raw.wholesale_currency ?? null,
    retailAmount: raw.retail_amount ?? null,
    retailCurrency: raw.retail_currency ?? null,
    destinationAmount: raw.destination_amount ?? null,
    destinationCurrency: raw.destination_currency ?? null,
  })
  const extracted = extractPricingFromRaw(raw.raw_json ?? null)

  const wholesale_amount =
    positiveAmount(raw.wholesale_amount) ??
    positiveAmount(raw.amount) ??
    readJsonAmount(raw.raw_json, [
      'wholesale_amount',
      'wholesaleAmount',
      'wholesaleprice',
      'sendvalue',
      'providercost',
    ]) ??
    positiveAmount(wholesale.wholesaleAmount) ??
    positiveAmount(extracted.providerCost) ??
    null

  const destination_amount =
    positiveAmount(raw.destination_amount) ??
    readJsonAmount(raw.raw_json, [
      'destination_amount',
      'destinationAmount',
      'receivevalue',
      'receiveamount',
      'facevalue',
      'baseprice',
    ]) ??
    positiveAmount(wholesale.destinationAmount) ??
    positiveAmount(extracted.basePrice) ??
    null

  const source_amount =
    positiveAmount(raw.source_amount) ??
    readJsonAmount(raw.raw_json, ['source_amount', 'sourceAmount', 'sourcevalue']) ??
    null

  const retail_amount =
    positiveAmount(raw.retail_amount) ??
    readJsonAmount(raw.raw_json, ['retail_amount', 'retailAmount', 'retailprice']) ??
    positiveAmount(extracted.finalPrice) ??
    null

  const wholesale_currency =
    normalizeCurrency(raw.wholesale_currency) ??
    normalizeCurrency(raw.currency) ??
    wholesale.wholesaleCurrency ??
    readJsonCurrency(raw.raw_json, ['wholesalecurrency', 'sendcurrency', 'sourcecurrency']) ??
    extracted.currency ??
    null

  const destination_currency =
    normalizeCurrency(raw.destination_currency) ??
    wholesale.destinationCurrency ??
    readJsonCurrency(raw.raw_json, ['destinationcurrency', 'receivecurrency', 'currencyunit']) ??
    null

  const source_currency =
    normalizeCurrency(raw.source_currency) ??
    readJsonCurrency(raw.raw_json, ['sourcecurrency']) ??
    null

  const retail_currency =
    normalizeCurrency(raw.retail_currency) ??
    readJsonCurrency(raw.raw_json, ['retailcurrency']) ??
    null

  return {
    wholesale_amount,
    wholesale_currency,
    destination_amount,
    destination_currency,
    source_amount,
    source_currency,
    retail_amount,
    retail_currency,
  }
}

function firstValidTier(
  tiers: Array<{ amount: number | null; currency: string | null }>,
): { amount: number | null; currency: string | null } {
  for (const tier of tiers) {
    if (positiveAmount(tier.amount) != null) {
      return { amount: tier.amount, currency: tier.currency }
    }
  }
  return { amount: null, currency: null }
}

/**
 * Provider Cost display: wholesale_amount → source_amount → retail_amount → N/A
 */
export function resolveProviderWholesaleCost(
  raw: RawPlanPricingRow | null | undefined,
): { amount: number | null; currency: string | null; display: string } {
  const tiers = extractPricingAmounts(raw)
  const { amount, currency } = firstValidTier([
    { amount: tiers.wholesale_amount, currency: tiers.wholesale_currency },
    { amount: tiers.source_amount, currency: tiers.source_currency },
    { amount: tiers.retail_amount, currency: tiers.retail_currency },
  ])
  return {
    amount,
    currency,
    display: formatPricingDisplay(amount, currency),
  }
}

/**
 * Recharge Cost display: wholesale_amount → destination_amount → source_amount → retail_amount → N/A
 */
export function resolveRechargeCostDisplay(
  raw: RawPlanPricingRow | null | undefined,
): { amount: number | null; currency: string | null; display: string } {
  const tiers = extractPricingAmounts(raw)
  const { amount, currency } = firstValidTier([
    { amount: tiers.wholesale_amount, currency: tiers.wholesale_currency },
    { amount: tiers.destination_amount, currency: tiers.destination_currency },
    { amount: tiers.source_amount, currency: tiers.source_currency },
    { amount: tiers.retail_amount, currency: tiers.retail_currency },
  ])
  return {
    amount,
    currency,
    display: formatPricingDisplay(amount, currency),
  }
}

export function formatPricingDisplay(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (positiveAmount(amount) == null) return 'N/A'
  const formatted = amount!.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
  return currency ? `${formatted} ${currency}` : formatted
}

/** @deprecated Use formatPricingDisplay */
export function formatProviderCostDisplay(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  return formatPricingDisplay(amount, currency)
}
