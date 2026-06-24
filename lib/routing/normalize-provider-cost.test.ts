import {
  normalizeProviderCost,
  normalizeProviderCostSync,
} from '@/lib/routing/normalize-provider-cost'
import { formatProviderCostDual } from '@/lib/routing/log-pricing'

jest.mock('@/lib/routing/exchange-rates', () => {
  const actual = jest.requireActual('@/lib/routing/exchange-rates')
  return {
    ...actual,
    loadCatalogExchangeRates: jest.fn(async () => new Map([['EUR', 1], ['INR', 0.0112]])),
    getFallbackExchangeRates: jest.fn(() => ({
      EUR: 1,
      USD: 0.92,
      INR: 0.0112,
    })),
  }
})

describe('normalizeProviderCost', () => {
  it('normalizes INR wholesale to EUR base using catalog rates', async () => {
    const result = await normalizeProviderCost({
      provider_price: 77.73,
      provider_currency: 'INR',
      base_currency: 'EUR',
    })
    expect(result.success).toBe(true)
    expect(result.normalized_provider_currency).toBe('EUR')
    expect(result.normalized_provider_price).toBeCloseTo(77.73 * 0.0112, 4)
    expect(result.provider_wholesale_amount).toBe(77.73)
    expect(result.provider_wholesale_currency).toBe('INR')
  })

  it('keeps EUR amounts unchanged in EUR base', async () => {
    const result = await normalizeProviderCost({
      provider_price: 21.44,
      provider_currency: 'EUR',
      base_currency: 'EUR',
    })
    expect(result.success).toBe(true)
    expect(result.normalized_provider_price).toBe(21.44)
    expect(result.exchange_rate_source).toBe('identity')
  })

  it('sync fallback converts mixed currencies for display', () => {
    const inr = normalizeProviderCostSync({
      provider_price: 2500,
      provider_currency: 'INR',
      base_currency: 'EUR',
    })
    const eur = normalizeProviderCostSync({
      provider_price: 21.44,
      provider_currency: 'EUR',
      base_currency: 'EUR',
    })
    expect(inr.success).toBe(true)
    expect(eur.success).toBe(true)
    expect(inr.normalized_provider_price).toBeGreaterThan(eur.normalized_provider_price)
  })

  it('formatProviderCostDual converts EUR wholesale to distinct INR (not same number)', () => {
    const dual = formatProviderCostDual(4.07, 'EUR')
    expect(dual.providerCostEur).toBeCloseTo(4.07, 2)
    expect(dual.providerCostInr).not.toBeNull()
    expect(dual.providerCostInr).not.toBeCloseTo(4.07, 1)
    expect(dual.providerCostInr!).toBeGreaterThan(100)
  })
})
