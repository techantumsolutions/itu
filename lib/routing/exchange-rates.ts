import { supabaseRest } from '@/lib/db/supabase-rest'

export const LCR_BASE_CURRENCY = (process.env.LCR_BASE_CURRENCY || 'EUR').trim().toUpperCase() || 'EUR'

/** Fallback rates: 1 unit of FROM currency → BASE currency. Override via env JSON. */
const DEFAULT_FALLBACK_TO_EUR: Record<string, number> = {
  EUR: 1,
  USD: 0.92,
  GBP: 1.17,
  INR: 0.0112,
  AED: 0.25,
  CAD: 0.68,
  AUD: 0.6,
  NPR: 0.0069,
  BDT: 0.0084,
  PKR: 0.0033,
  LKR: 0.0031,
  XCD: 0.34,
  NGN: 0.0006,
  PHP: 0.016,
  MYR: 0.2,
  THB: 0.027,
  SGD: 0.7,
  SAR: 0.245,
  ZAR: 0.05,
  AFN: 0.012,
}

function parseFallbackFromEnv(): Record<string, number> {
  const raw = process.env.LCR_EXCHANGE_FALLBACK_RATES?.trim()
  if (!raw) return { ...DEFAULT_FALLBACK_TO_EUR }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, number> = { ...DEFAULT_FALLBACK_TO_EUR }
    for (const [key, value] of Object.entries(parsed)) {
      const n = typeof value === 'number' ? value : Number(value)
      if (Number.isFinite(n) && n > 0) out[key.toUpperCase()] = n
    }
    return out
  } catch {
    return { ...DEFAULT_FALLBACK_TO_EUR }
  }
}

let fallbackRatesCache: Record<string, number> | null = null

export function getFallbackExchangeRates(): Record<string, number> {
  if (!fallbackRatesCache) fallbackRatesCache = parseFallbackFromEnv()
  return fallbackRatesCache
}

type RateRow = {
  from_unit?: string | null
  to_unit?: string | null
  rate?: number | null
}

let catalogRatesCache: Map<string, number> | null = null
let catalogRatesLoadedAt = 0
const RATE_CACHE_MS = 60_000

/** Latest catalog rate: 1 FROM → TO (multiply amount in FROM by rate to get TO). */
export async function loadCatalogExchangeRates(baseCurrency: string = LCR_BASE_CURRENCY): Promise<Map<string, number>> {
  const now = Date.now()
  if (catalogRatesCache && now - catalogRatesLoadedAt < RATE_CACHE_MS) {
    return catalogRatesCache
  }

  const map = new Map<string, number>()
  map.set(baseCurrency, 1)

  try {
    const res = await supabaseRest(
      `agg_exchange_rates?to_unit=eq.${encodeURIComponent(baseCurrency)}&select=from_unit,to_unit,rate,captured_at&order=captured_at.desc&limit=200`,
      { cache: 'no-store' },
    )
    if (res.ok) {
      const rows = (await res.json()) as RateRow[]
      for (const row of rows) {
        const from = String(row.from_unit ?? '').trim().toUpperCase()
        const rate = typeof row.rate === 'number' ? row.rate : Number(row.rate)
        if (!from || !Number.isFinite(rate) || rate <= 0) continue
        if (!map.has(from)) map.set(from, rate)
      }
    }
  } catch {
    // use fallback only
  }

  catalogRatesCache = map
  catalogRatesLoadedAt = now
  return map
}

export function convertWithRateMap(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rateMap: Map<string, number>,
  fallbackRates: Record<string, number>,
): { converted: number; rate: number; source: 'agg_exchange_rates' | 'fallback_config' | 'identity' } {
  const from = fromCurrency.trim().toUpperCase()
  const base = baseCurrency.trim().toUpperCase()
  if (!Number.isFinite(amount) || amount <= 0) {
    return { converted: NaN, rate: NaN, source: 'identity' }
  }
  if (from === base) return { converted: amount, rate: 1, source: 'identity' }

  const catalogRate = rateMap.get(from)
  if (catalogRate != null && catalogRate > 0) {
    return { converted: amount * catalogRate, rate: catalogRate, source: 'agg_exchange_rates' }
  }

  const fallbackToEur = fallbackRates
  const fromToEur = fallbackToEur[from]
  const baseToEur = fallbackToEur[base] ?? 1
  if (fromToEur != null && fromToEur > 0 && baseToEur > 0) {
    const cross = fromToEur / baseToEur
    return { converted: amount * cross, rate: cross, source: 'fallback_config' }
  }

  return { converted: NaN, rate: NaN, source: 'fallback_config' }
}
