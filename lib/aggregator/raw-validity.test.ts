import {
  extractValidityDaysFromRaw,
  formatValidityDaysForStorage,
  parseCompactDurationDays,
  parseIso8601DurationToDays,
  resolveValidityDays,
  resolveValidityForStorage,
  validityUnitToDays,
} from './raw-validity'

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
  skuName: 'Airtel India Bundles 798.00 INR',
  category: 'Rtr',
  discount: 7,
  validity: '5D',
  productId: 114,
  countryCode: 'IN',
  operatorId: 2,
  operatorName: 'Airtel',
  productDescription:
    'Get 2 GB Data + 150 Mins IC+OG (India + Local) + 20 SMS (Covers - USA, Europe, Gulf, Asia, Africa & More)\n5 Days validity',
  internationalCountryCode: ['91'],
}

describe('raw-validity', () => {
  it('parses ISO-8601 durations like DING', () => {
    expect(parseIso8601DurationToDays('P30D')).toBe(30)
    expect(parseIso8601DurationToDays('P1M')).toBe(30)
    expect(parseIso8601DurationToDays('P1Y')).toBe(365)
  })

  it('parses compact duration strings like Value Topup 5D', () => {
    expect(parseCompactDurationDays('5D')).toBe(5)
    expect(parseCompactDurationDays('28d')).toBe(28)
  })

  it('parses DT One validity object', () => {
    expect(
      extractValidityDaysFromRaw({
        validity: { quantity: 28, unit: 'DAY' },
      }),
    ).toBe(28)
    expect(
      extractValidityDaysFromRaw({
        validity: { quantity: 7, unit: 'DAYS' },
      }),
    ).toBe(7)
  })

  it('parses DING ValidityPeriodIso from raw', () => {
    expect(
      extractValidityDaysFromRaw({
        ValidityPeriodIso: 'P30D',
        DefaultDisplayText: 'Airtime',
      }),
    ).toBe(30)
  })

  it('does not confuse internationalCountryCode 91 with validity', () => {
    expect(extractValidityDaysFromRaw(VALUE_TOPUP_AIRTEL_BUNDLE)).toBe(5)
    expect(
      resolveValidityForStorage({
        raw: VALUE_TOPUP_AIRTEL_BUNDLE,
        planType: 'AIRTIME',
        category: 'Rtr',
      }),
    ).toBe('5D')
  })

  it('walks nested validity keywords', () => {
    expect(
      extractValidityDaysFromRaw({
        product: { meta: { validityDays: 14 } },
      }),
    ).toBe(14)
  })

  it('resolves explicit validityDays before raw', () => {
    expect(resolveValidityDays({ validityDays: 5, raw: { validityDays: 99 } })).toBe(5)
    expect(resolveValidityDays({ raw: { validityDays: 99 } })).toBe(99)
  })

  it('formats storage validity', () => {
    expect(formatValidityDaysForStorage(30)).toBe('30D')
    expect(formatValidityDaysForStorage(null)).toBeNull()
  })

  it('uses Life Time for airtime plans without validity', () => {
    expect(
      resolveValidityForStorage({
        raw: { category: 'Pin', internationalCountryCode: ['91'] },
        planType: 'PIN',
      }),
    ).toBe('Life Time')
  })

  it('converts hours to days', () => {
    expect(validityUnitToDays(48, 'HOUR')).toBe(2)
  })
})
