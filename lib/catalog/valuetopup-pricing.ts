import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import type { WholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'

function finiteAmount(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function currencyCode(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase()
  return code || null
}

function readBlockAmount(
  block: Record<string, unknown> | undefined,
  keys: string[],
): number | null {
  if (!block) return null
  for (const key of keys) {
    const amount = finiteAmount(block[key])
    if (amount != null) return amount
  }
  return null
}

function readBlockCurrency(
  block: Record<string, unknown> | undefined,
  keys: string[],
): string | null {
  if (!block) return null
  for (const key of keys) {
    const code = currencyCode(block[key])
    if (code) return code
  }
  return null
}

/**
 * ValueTopup / IIMMPACT catalog SKU pricing.
 *
 * API semantics (catalog `/catalog/skus` payLoad items):
 * - `min.faceValue` + `min.faceValueCurrency` = destination face value delivered to subscriber
 * - `min.faceValueInWalletCurrency` = explicit distributor purchase price in wallet/settlement currency
 * - `discount` = percentage off face value (fallback only when wallet price is absent)
 *
 * Wholesale currency and destination currency are independent — never copy faceValueCurrency onto wholesale.
 */
export function resolveValueTopupPricing(sku: Record<string, unknown>): WholesalePricing {
  const min = sku.min as Record<string, unknown> | undefined
  const max = sku.max as Record<string, unknown> | undefined
  const pricing = sku.pricing as Record<string, unknown> | undefined
  const extracted = extractPricingFromRaw(sku)

  const destinationAmount =
    readBlockAmount(min, ['faceValue', 'deliveredAmount']) ??
    readBlockAmount(max, ['faceValue', 'deliveredAmount']) ??
    finiteAmount(extracted.basePrice)

  const destinationCurrency =
    readBlockCurrency(min, ['faceValueCurrency', 'deliveryCurrencyCode']) ??
    readBlockCurrency(max, ['faceValueCurrency', 'deliveryCurrencyCode']) ??
    (extracted.basePrice != null ? currencyCode(extracted.currency) : null)

  // Explicit purchase / settlement price from API (preferred over derived formula).
  let wholesaleAmount =
    readBlockAmount(min, ['faceValueInWalletCurrency', 'walletAmount', 'purchasePrice']) ??
    readBlockAmount(max, ['faceValueInWalletCurrency', 'walletAmount', 'purchasePrice']) ??
    finiteAmount(pricing?.unit_price) ??
    finiteAmount(sku.denomination_unit_price) ??
    finiteAmount(extracted.providerCost)

  let wholesaleCurrency =
    currencyCode(sku.walletCurrency) ??
    currencyCode(sku.settlementCurrency) ??
    currencyCode(pricing?.currency) ??
    readBlockCurrency(min, ['walletCurrency', 'settlementCurrency']) ??
    readBlockCurrency(max, ['walletCurrency', 'settlementCurrency']) ??
    null

  // Fallback: derive from face value + discount% in destination currency (not wallet currency).
  if (wholesaleAmount == null && destinationAmount != null) {
    const discountPercent = finiteAmount(sku.discount) ?? 0
    wholesaleAmount =
      Math.round(destinationAmount * (1 - Math.min(discountPercent, 100) / 100) * 100) / 100
    wholesaleCurrency = destinationCurrency
  }

  return {
    wholesaleAmount,
    wholesaleCurrency,
    destinationAmount,
    destinationCurrency,
  }
}

/**
 * ValueTopup wholesale from persisted provider_plans_raw row.
 * Admin routing logs and LCR use amount/currency columns as authoritative EUR distributor cost.
 */
export function resolveValueTopupWholesaleFromRow(input: {
  amount?: number | null
  currency?: string | null
  rawJson?: unknown
}): Pick<WholesalePricing, 'wholesaleAmount' | 'wholesaleCurrency'> {
  const columnAmount = finiteAmount(input.amount)
  const columnCurrency = currencyCode(input.currency)
  if (columnAmount != null && columnCurrency) {
    return { wholesaleAmount: columnAmount, wholesaleCurrency: columnCurrency }
  }

  if (input.rawJson && isValueTopupSkuRaw(input.rawJson)) {
    const vt = resolveValueTopupPricing(input.rawJson as Record<string, unknown>)
    return {
      wholesaleAmount: vt.wholesaleAmount,
      wholesaleCurrency: vt.wholesaleCurrency,
    }
  }

  return { wholesaleAmount: columnAmount, wholesaleCurrency: columnCurrency }
}

export function isValueTopupSkuRaw(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const sku = raw as Record<string, unknown>
  return Boolean(sku.min || sku.max || sku.skuId)
}
