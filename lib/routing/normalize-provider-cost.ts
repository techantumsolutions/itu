import {
  convertWithRateMap,
  getFallbackExchangeRates,
  LCR_BASE_CURRENCY,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'
import type { NormalizedProviderCost } from '@/lib/routing/provider-cost-types'

export type NormalizeProviderCostInput = {
  provider_price: number
  provider_currency: string
  base_currency?: string
}

export type NormalizeProviderCostResult = NormalizedProviderCost & {
  success: boolean
}

const syncRateMaps = new Map<string, Map<string, number>>()

function syncRateMapForBase(baseCurrency: string): Map<string, number> {
  const base = baseCurrency.trim().toUpperCase()
  const cached = syncRateMaps.get(base)
  if (cached) return cached

  const map = new Map<string, number>([[base, 1]])
  const fallback = getFallbackExchangeRates()
  const baseRate = fallback[base] ?? 1
  for (const [from, rate] of Object.entries(fallback)) {
    if (from === base) continue
    const toBase = rate / baseRate
    if (toBase > 0) map.set(from, toBase)
  }
  syncRateMaps.set(base, map)
  return map
}

/** Sync normalize using fallback config only (display helpers). */
export function normalizeProviderCostSync(
  input: NormalizeProviderCostInput,
): NormalizeProviderCostResult {
  const base = (input.base_currency ?? LCR_BASE_CURRENCY).trim().toUpperCase()
  const amount = input.provider_price
  const currency = input.provider_currency.trim().toUpperCase()
  const syncRateMap = syncRateMapForBase(base)
  const { converted, rate, source } = convertWithRateMap(
    amount,
    currency,
    base,
    syncRateMap,
    getFallbackExchangeRates(),
  )
  const success = Number.isFinite(converted) && converted > 0
  return {
    provider_wholesale_amount: amount,
    provider_wholesale_currency: currency,
    normalized_provider_price: success ? converted : NaN,
    normalized_provider_currency: base,
    exchange_rate_used: success ? rate : null,
    exchange_rate_source: source,
    success,
  }
}

/** Normalize wholesale provider cost into LCR base currency for routing comparison. */
export async function normalizeProviderCost(
  input: NormalizeProviderCostInput,
): Promise<NormalizeProviderCostResult> {
  const base = (input.base_currency ?? LCR_BASE_CURRENCY).trim().toUpperCase()
  const amount = input.provider_price
  const currency = input.provider_currency.trim().toUpperCase()

  if (!Number.isFinite(amount) || amount <= 0 || !currency) {
    return {
      provider_wholesale_amount: amount,
      provider_wholesale_currency: currency || '',
      normalized_provider_price: NaN,
      normalized_provider_currency: base,
      exchange_rate_used: null,
      exchange_rate_source: 'fallback_config',
      success: false,
    }
  }

  const rateMap = await loadCatalogExchangeRates(base)
  const { converted, rate, source } = convertWithRateMap(
    amount,
    currency,
    base,
    rateMap,
    getFallbackExchangeRates(),
  )
  const success = Number.isFinite(converted) && converted > 0
  return {
    provider_wholesale_amount: amount,
    provider_wholesale_currency: currency,
    normalized_provider_price: success ? converted : NaN,
    normalized_provider_currency: base,
    exchange_rate_used: success ? rate : null,
    exchange_rate_source: source,
    success,
  }
}
