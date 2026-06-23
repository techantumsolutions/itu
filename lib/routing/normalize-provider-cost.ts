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

let syncRateMap: Map<string, number> | null = null

/** Sync normalize using fallback config only (display helpers). */
export function normalizeProviderCostSync(
  input: NormalizeProviderCostInput,
): NormalizeProviderCostResult {
  const base = (input.base_currency ?? LCR_BASE_CURRENCY).trim().toUpperCase()
  const amount = input.provider_price
  const currency = input.provider_currency.trim().toUpperCase()
  if (!syncRateMap) {
    syncRateMap = new Map([[base, 1]])
    for (const [from, rate] of Object.entries(getFallbackExchangeRates())) {
      if (from === base) continue
      const baseRate = getFallbackExchangeRates()[base] ?? 1
      const toBase = rate / baseRate
      if (toBase > 0) syncRateMap.set(from, toBase)
    }
  }
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
