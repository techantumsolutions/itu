import {
  buildPayableCurrencyOptions,
  convertUsingEurBaseRates,
  crossRateUsingEurBase,
} from '@/lib/topup/currency-conversion'

const rates = {
  EUR: 1,
  INR: 90,
  USD: 1.08,
  XCD: 2.9,
}

describe('convertUsingEurBaseRates', () => {
  it('returns same amount for identical currencies', () => {
    expect(convertUsingEurBaseRates(299, 'INR', 'INR', rates)).toBe(299)
  })

  it('converts INR to USD using cross rate', () => {
    const out = convertUsingEurBaseRates(299, 'INR', 'USD', rates)
    expect(out).not.toBeNull()
    expect(out!).toBeCloseTo(299 * (1.08 / 90), 4)
  })

  it('converts XCD to INR without assuming EUR plan price', () => {
    const out = convertUsingEurBaseRates(50, 'XCD', 'INR', rates)
    expect(out).not.toBeNull()
    expect(out!).toBeCloseTo(50 * (90 / 2.9), 4)
  })

  it('returns null when rate is missing', () => {
    expect(convertUsingEurBaseRates(10, 'AFN', 'INR', rates)).toBeNull()
  })
})

describe('crossRateUsingEurBase', () => {
  it('returns 1 for same currency', () => {
    expect(crossRateUsingEurBase('KWD', 'KWD', rates)).toBe(1)
  })
})

describe('buildPayableCurrencyOptions', () => {
  it('includes recharge, user, wallet, and common currencies', () => {
    const options = buildPayableCurrencyOptions({
      rechargeCurrency: 'XCD',
      userCurrency: 'USD',
      walletCurrencies: ['EUR'],
    })
    expect(options).toContain('XCD')
    expect(options).toContain('USD')
    expect(options).toContain('EUR')
    expect(options).toContain('INR')
  })
})
