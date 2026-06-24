import { resolveValueTopupPricing, resolveValueTopupWholesaleFromRow } from '@/lib/catalog/valuetopup-pricing'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'

const VALUE_TOPUP_AIRTEL_BUNDLE = {
  fee: 0,
  max: {
    faceValue: 798,
    deliveredAmount: 798,
    faceValueCurrency: 'INR',
    deliveryCurrencyCode: 'INR',
    faceValueInWalletCurrency: 10.92,
  },
  min: {
    faceValue: 798,
    deliveredAmount: 798,
    faceValueCurrency: 'INR',
    deliveryCurrencyCode: 'INR',
    faceValueInWalletCurrency: 10.92,
  },
  skuId: 1210,
  discount: 7,
  walletCurrency: 'EUR',
}

describe('resolveValueTopupPricing', () => {
  it('uses explicit faceValueInWalletCurrency for wholesale, not faceValue × discount', () => {
    const result = resolveValueTopupPricing(VALUE_TOPUP_AIRTEL_BUNDLE)
    expect(result.destinationAmount).toBe(798)
    expect(result.destinationCurrency).toBe('INR')
    expect(result.wholesaleAmount).toBe(10.92)
    expect(result.wholesaleCurrency).toBe('EUR')
    expect(result.wholesaleAmount).not.toBeCloseTo(798 * 0.93, 2)
  })

  it('derives wholesale in destination currency only when wallet price is missing', () => {
    const result = resolveValueTopupPricing({
      min: { faceValue: 299, faceValueCurrency: 'INR' },
      discount: 26,
    })
    expect(result.destinationAmount).toBe(299)
    expect(result.destinationCurrency).toBe('INR')
    expect(result.wholesaleAmount).toBeCloseTo(221.26, 2)
    expect(result.wholesaleCurrency).toBe('INR')
  })

  it('never assigns wholesale currency from faceValueCurrency when wallet price exists', () => {
    const result = resolveValueTopupPricing({
      min: {
        faceValue: 10.5,
        faceValueCurrency: 'EUR',
        faceValueInWalletCurrency: 77.73,
      },
      walletCurrency: 'INR',
    })
    expect(result.destinationCurrency).toBe('EUR')
    expect(result.wholesaleAmount).toBe(77.73)
    expect(result.wholesaleCurrency).toBe('INR')
  })

  it('resolveWholesalePricing routes ValueTopup SKU raw JSON', () => {
    const pricing = resolveWholesalePricing({
      rawJson: {
        min: {
          faceValue: 798,
          faceValueCurrency: 'INR',
          faceValueInWalletCurrency: 10.92,
        },
        walletCurrency: 'EUR',
        skuId: 1210,
      },
    })
    expect(pricing.wholesaleAmount).toBe(10.92)
    expect(pricing.wholesaleCurrency).toBe('EUR')
    expect(pricing.destinationAmount).toBe(798)
    expect(pricing.destinationCurrency).toBe('INR')
  })

  it('resolveValueTopupWholesaleFromRow prefers provider_plans_raw.amount column', () => {
    const fromRow = resolveValueTopupWholesaleFromRow({
      amount: 10.92,
      currency: 'EUR',
      rawJson: {
        min: {
          faceValue: 798,
          faceValueCurrency: 'INR',
          faceValueInWalletCurrency: 99.99,
        },
        walletCurrency: 'EUR',
        skuId: 1210,
      },
    })
    expect(fromRow.wholesaleAmount).toBe(10.92)
    expect(fromRow.wholesaleCurrency).toBe('EUR')
  })

  it('resolveWholesalePricing prefers provider_plans_raw.amount over raw JSON wallet fields', () => {
    const pricing = resolveWholesalePricing({
      amount: 10.92,
      currency: 'EUR',
      destinationAmount: 798,
      destinationCurrency: 'INR',
      rawJson: {
        min: {
          faceValue: 798,
          faceValueCurrency: 'INR',
          faceValueInWalletCurrency: 99.99,
        },
        walletCurrency: 'EUR',
        skuId: 1210,
      },
    })
    expect(pricing.wholesaleAmount).toBe(10.92)
    expect(pricing.wholesaleCurrency).toBe('EUR')
    expect(pricing.destinationAmount).toBe(798)
    expect(pricing.destinationCurrency).toBe('INR')
  })
})
