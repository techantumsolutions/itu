import { describe, expect, it } from 'vitest'
import {
  resolveWholesalePricing,
  wholesaleCostFromNormalizedPlan,
} from './provider-wholesale-pricing'

describe('wholesaleCostFromNormalizedPlan', () => {
  it('prefers wholesaleAmount over retailAmount', () => {
    const pricing = wholesaleCostFromNormalizedPlan({
      wholesaleAmount: 334.49,
      wholesaleCurrency: 'INR',
      retailAmount: 1098,
      retailCurrency: 'INR',
      destinationAmount: 1098,
      destinationUnit: 'INR',
    })
    expect(pricing.wholesaleAmount).toBe(334.49)
    expect(pricing.destinationAmount).toBe(1098)
  })
})

describe('resolveWholesalePricing', () => {
  it('reads Ding send/receive values from raw JSON', () => {
    const pricing = resolveWholesalePricing({
      amount: 1098,
      currency: 'INR',
      rawJson: {
        Minimum: {
          SendValue: 3.72,
          SendCurrencyIso: 'EUR',
          ReceiveValue: 1098,
          ReceiveCurrencyIso: 'INR',
        },
      },
    })
    expect(pricing.wholesaleAmount).toBe(3.72)
    expect(pricing.wholesaleCurrency).toBe('EUR')
    expect(pricing.destinationAmount).toBe(1098)
    expect(pricing.destinationCurrency).toBe('INR')
  })

  it('uses providerCost from extractor when amount equals face value', () => {
    const pricing = resolveWholesalePricing({
      amount: 1098,
      currency: 'INR',
      rawJson: {
        prices: {
          wholesale: { amount: 334.49, unit: 'INR' },
          retail: { amount: 1098, unit: 'INR' },
        },
      },
    })
    expect(pricing.wholesaleAmount).toBe(334.49)
  })
})
