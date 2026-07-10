/**
 * Report FX helpers — convert multi-currency amounts to the admin reporting currency (EUR).
 * Uses catalog rates from agg_exchange_rates with the same fallbacks as LCR / dashboard.
 */

import {
  convertWithRateMap,
  getFallbackExchangeRates,
  loadCatalogExchangeRates,
} from '@/lib/routing/exchange-rates'

export const REPORTING_CURRENCY = 'EUR'

export type ReportFxConverter = (amount: number, currency?: string | null) => number

function normalizeCurrency(currency: string | null | undefined): string {
  return (currency ?? REPORTING_CURRENCY).trim().toUpperCase() || REPORTING_CURRENCY
}

export async function createReportFxConverter(
  reportingCurrency: string = REPORTING_CURRENCY,
): Promise<ReportFxConverter> {
  const base = normalizeCurrency(reportingCurrency)
  const rateMap = await loadCatalogExchangeRates(base)
  const fallbackRates = getFallbackExchangeRates()

  return (amount: number, currency?: string | null): number => {
    if (!Number.isFinite(amount) || amount === 0) return 0
    const from = normalizeCurrency(currency)
    const { converted } = convertWithRateMap(Math.abs(amount), from, base, rateMap, fallbackRates)
    if (!Number.isFinite(converted)) return 0
    return amount < 0 ? -converted : converted
  }
}

/** Resolve provider-cost currency from transaction / recharge metadata. */
export function resolveProviderCostCurrency(
  meta: Record<string, unknown> | null | undefined,
  fallbackCurrency?: string | null,
): string {
  if (meta) {
    for (const key of [
      'selected_provider_currency',
      'provider_cost_currency',
      'provider_currency',
    ] as const) {
      const v = meta[key]
      if (typeof v === 'string' && v.trim()) return normalizeCurrency(v)
    }
    const lcr = meta.lcr_result as Record<string, unknown> | undefined
    if (typeof lcr?.selectedProviderCurrency === 'string' && lcr.selectedProviderCurrency.trim()) {
      return normalizeCurrency(lcr.selectedProviderCurrency)
    }
  }
  return normalizeCurrency(fallbackCurrency)
}

export function resolveProviderCostAmount(
  meta: Record<string, unknown> | null | undefined,
  roMeta?: Record<string, unknown> | null,
): number {
  const sources = [roMeta, meta]
  for (const m of sources) {
    if (!m) continue
    if (typeof m.selected_provider_cost === 'number' && Number.isFinite(m.selected_provider_cost)) {
      return m.selected_provider_cost
    }
    if (typeof m.provider_cost === 'number' && Number.isFinite(m.provider_cost)) {
      return m.provider_cost
    }
    const lcr = m.lcr_result as Record<string, unknown> | undefined
    if (typeof lcr?.selectedProviderCost === 'number' && Number.isFinite(lcr.selectedProviderCost)) {
      return lcr.selectedProviderCost
    }
  }
  return 0
}
