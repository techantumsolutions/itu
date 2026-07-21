/** Rates from open.er-api.com/v6/latest/EUR: units of currency per 1 EUR. */
export type EurBaseRates = Record<string, number>

export function normalizeCurrencyCode(currency: string | null | undefined): string {
  return (currency ?? '').trim().toUpperCase()
}

/** Convert amount between any two currencies using EUR-base cross rates. */
export function convertUsingEurBaseRates(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: EurBaseRates,
): number | null {
  if (!Number.isFinite(amount)) return null
  const from = normalizeCurrencyCode(fromCurrency)
  const to = normalizeCurrencyCode(toCurrency)
  if (from === to) return amount

  const rateFrom = from === 'EUR' ? 1 : rates[from]
  const rateTo = to === 'EUR' ? 1 : rates[to]
  if (!rateFrom || !rateTo || rateFrom <= 0 || rateTo <= 0) return null

  return amount * (rateTo / rateFrom)
}

export function crossRateUsingEurBase(
  fromCurrency: string,
  toCurrency: string,
  rates: EurBaseRates,
): number | null {
  const converted = convertUsingEurBaseRates(1, fromCurrency, toCurrency, rates)
  return converted == null ? null : converted
}

let eurBaseRatesCache: { rates: EurBaseRates; loadedAt: number } | null = null
const EUR_BASE_RATES_CACHE_MS = 5 * 60_000

/** Live EUR-base FX (open.er-api). Cached briefly to avoid rate-limit storms. */
export async function fetchEurBaseRates(options?: { force?: boolean }): Promise<EurBaseRates | null> {
  const now = Date.now()
  if (
    !options?.force &&
    eurBaseRatesCache &&
    now - eurBaseRatesCache.loadedAt < EUR_BASE_RATES_CACHE_MS
  ) {
    return eurBaseRatesCache.rates
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/EUR', { cache: 'no-store' })
    if (!res.ok) return eurBaseRatesCache?.rates ?? null
    const data = (await res.json()) as { rates?: Record<string, number> }
    const rates = data.rates ?? null
    if (rates && Object.keys(rates).length) {
      eurBaseRatesCache = { rates, loadedAt: now }
      return rates
    }
  } catch {
    /* ignore */
  }
  return eurBaseRatesCache?.rates ?? null
}

export function formatMoney(amount: number, currency: string): string {
  const code = normalizeCurrencyCode(currency)
  if (code === 'INR') return `₹${amount.toFixed(2)}`
  if (code === 'EUR') return `€${amount.toFixed(2)}`
  if (code === 'USD') return `$${amount.toFixed(2)}`
  if (code === 'GBP') return `£${amount.toFixed(2)}`
  return `${amount.toFixed(2)} ${code}`
}

export const COMMON_PAYABLE_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'CAD',
  'AUD',
  'SGD',
  'SAR',
  'KWD',
  'XCD',
  'AFN',
  'BDT',
  'PKR',
  'NPR',
  'NGN',
  'PHP',
  'MYR',
  'THB',
  'ZAR',
]

export function buildPayableCurrencyOptions(input: {
  rechargeCurrency: string
  userCurrency?: string | null
  walletCurrencies?: string[]
}): string[] {
  const set = new Set<string>()
  const add = (c?: string | null) => {
    const v = normalizeCurrencyCode(c)
    if (v) set.add(v)
  }
  add(input.rechargeCurrency)
  add(input.userCurrency)
  for (const w of input.walletCurrencies ?? []) add(w)
  for (const c of COMMON_PAYABLE_CURRENCIES) add(c)
  return [...set].sort()
}
