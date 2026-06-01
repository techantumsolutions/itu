import {
  classifyProviderOperatorRecord,
  formatSkippedOperatorLog,
  isAirtimeDenominationName,
  isDataPlanName,
  isGenuineTelecomOperatorName,
  isGiftCardName,
  isProductCodeName,
  isRandomOrCodeLikeOperatorName,
  operatorNameConfidenceScore,
  resolveTelecomOperatorName,
} from '@/lib/aggregator/operator-classifier'
import type { NormalizedPlan } from '@/lib/providers/types'

function plan(overrides: Partial<NormalizedPlan> = {}): NormalizedPlan {
  return {
    providerId: 'p1',
    providerCode: 'DING',
    providerPlanId: 'sku-1',
    countryIso3: 'IND',
    operatorRef: 'ding:AIRTEL_IN',
    operatorName: 'Airtel',
    service: 'Mobile',
    benefits: [],
    requiredFields: [],
    raw: {},
    ...overrides,
  }
}

describe('operator-classifier', () => {
  describe('rejection rules', () => {
    it('rejects data plan names', () => {
      expect(isDataPlanName('2 Gb Data')).toBe(true)
      expect(isDataPlanName('50 Gb 4g Data For 365 Days')).toBe(true)
      expect(isDataPlanName('Unlimited Data For 30days')).toBe(true)
      expect(isDataPlanName('10 Gb Subs To 10 Ott')).toBe(true)
    })

    it('rejects airtime denominations', () => {
      expect(isAirtimeDenominationName('9.99 USD')).toBe(true)
      expect(isAirtimeDenominationName('89.99 USD')).toBe(true)
      expect(isAirtimeDenominationName('100.0 USD')).toBe(true)
    })

    it('rejects provider product codes', () => {
      expect(isProductCodeName('205e55in')).toBe(true)
      expect(isProductCodeName('3148cfin')).toBe(true)
      expect(isProductCodeName('54eb63in')).toBe(true)
    })

    it('rejects gift cards and baskets', () => {
      expect(isGiftCardName('Hyatt Hotels 10000INR Card')).toBe(true)
      expect(isGiftCardName('Nature S Basket 7500')).toBe(true)
      expect(isGiftCardName('Amazon Gift Card')).toBe(true)
    })
  })

  describe('isGenuineTelecomOperatorName', () => {
    it('accepts India mobile operators', () => {
      expect(isGenuineTelecomOperatorName('Airtel', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('Reliance Jio', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('Vi', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('BSNL', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('MTNL', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('Airtel India IND', 'IND')).toBe(true)
      expect(isGenuineTelecomOperatorName('Reliance Jio India IND', 'IND')).toBe(true)
    })

    it('rejects random code-like operator names', () => {
      for (const name of ['Acc', 'Afee', 'Aiin', 'Bc', 'Vfin', 'Rjin', 'Guin', 'Cdff', 'Dnin']) {
        expect(isGenuineTelecomOperatorName(`${name} IND`, 'IND')).toBe(false)
        expect(isRandomOrCodeLikeOperatorName(`${name} IND`, 'IND')).toBe(true)
      }
    })

    it('rejects products and plans', () => {
      expect(isGenuineTelecomOperatorName('2 Gb Data IND', 'IND')).toBe(false)
      expect(isGenuineTelecomOperatorName('89.99 USD', 'IND')).toBe(false)
      expect(isGenuineTelecomOperatorName('205e55in IND', 'IND')).toBe(false)
      expect(isGenuineTelecomOperatorName('Tamil Joy Pack IND', 'IND')).toBe(false)
      expect(isGenuineTelecomOperatorName('Dth Airtel', 'IND')).toBe(false)
      expect(isGenuineTelecomOperatorName('Hyatt Hotels 10000INR Card', 'IND')).toBe(false)
    })
  })

  describe('classifyProviderOperatorRecord', () => {
    const badCases: Array<{ name: string; kind: string; reason: string }> = [
      { name: '2 Gb Data IND', kind: 'DATA_BUNDLE', reason: 'DATA_PLAN' },
      { name: '89.99 USD', kind: 'AIRTIME', reason: 'AIRTIME_DENOMINATION' },
      { name: '205e55in IND', kind: 'UNKNOWN', reason: 'PRODUCT_CODE' },
      { name: 'Hyatt Hotels 10000INR Card', kind: 'GIFT_CARD', reason: 'GIFT_CARD' },
      { name: 'Tamil Joy Pack IND', kind: 'COMBO_BUNDLE', reason: 'BUNDLE_KEYWORD' },
      { name: 'Dth Airtel', kind: 'DTH', reason: 'DTH' },
      { name: '10 Gb Subs To 10 Ott IND', kind: 'DATA_BUNDLE', reason: 'DATA_PLAN' }, // GB volume checked before OTT
    ]

    it.each(badCases)('rejects $name', ({ name, kind, reason }) => {
      const result = classifyProviderOperatorRecord({
        providerOperatorName: name,
        countryIso3: 'IND',
      })
      expect(result.kind).toBe(kind)
      expect(result.isTelecomOperator).toBe(false)
      expect(result.skipReason).toBe(reason)
    })

    it('does not reject operator when plan product title contains data keywords', () => {
      const result = classifyProviderOperatorRecord({
        providerOperatorName: 'Airtel',
        productName: '2 Gb Data 28 Days',
        countryIso3: 'IND',
      })
      expect(result.kind).toBe('MOBILE_OPERATOR')
      expect(result.isTelecomOperator).toBe(true)
    })

    it('accepts genuine operators', () => {
      for (const name of ['Airtel', 'Reliance Jio', 'Vi', 'BSNL', 'MTNL']) {
        const result = classifyProviderOperatorRecord({
          providerOperatorName: name,
          countryIso3: 'IND',
        })
        expect(result.kind).toBe('MOBILE_OPERATOR')
        expect(result.isTelecomOperator).toBe(true)
        expect(result.skipReason).toBeNull()
      }
    })
  })

  describe('operatorNameConfidenceScore', () => {
    it('scores real brands high and code-like names low', () => {
      expect(operatorNameConfidenceScore('Airtel India', 'IND')).toBeGreaterThanOrEqual(50)
      expect(operatorNameConfidenceScore('Reliance Jio India', 'IND')).toBeGreaterThanOrEqual(50)
      expect(operatorNameConfidenceScore('Acc', 'IND')).toBeLessThan(50)
      expect(operatorNameConfidenceScore('Vfin', 'IND')).toBeLessThan(50)
      expect(operatorNameConfidenceScore('Rjin', 'IND')).toBeLessThan(50)
    })
  })

  describe('random code-like names', () => {
    const codeLike = ['Acc', 'Afee', 'Aiin', 'Bc', 'Blin', 'Cain', 'Cdff', 'Dnin', 'Fwin', 'Guin', 'Hcin', 'Rjin', 'Vfin']

    it.each(codeLike)('rejects %s IND via final validation', (token) => {
      const result = classifyProviderOperatorRecord({
        providerOperatorName: `${token} IND`,
        countryIso3: 'IND',
      })
      expect(result.isTelecomOperator).toBe(false)
      expect(result.skipReason).toBe('RANDOM_OR_CODE_LIKE_NAME')
    })
  })

  describe('formatSkippedOperatorLog', () => {
    it('formats SKIPPED_OPERATOR lines', () => {
      const classification = classifyProviderOperatorRecord({
        providerOperatorName: '89.99 USD',
        countryIso3: 'IND',
      })
      const log = formatSkippedOperatorLog('89.99 USD', 'IND', classification)
      expect(log).toContain('SKIPPED_OPERATOR')
      expect(log).toContain('Reason: AIRTIME_DENOMINATION')
      expect(log).toContain('Name: 89.99 USD IND')
    })

    it('logs RANDOM_OR_CODE_LIKE_NAME rejections', () => {
      const classification = classifyProviderOperatorRecord({
        providerOperatorName: 'Vfin IND',
        countryIso3: 'IND',
      })
      const log = formatSkippedOperatorLog('Vfin IND', 'IND', classification)
      expect(log).toContain('SKIPPED_OPERATOR')
      expect(log).toContain('Name: Vfin IND')
      expect(log).toContain('Reason: RANDOM_OR_CODE_LIKE_NAME')
    })
  })

  describe('resolveTelecomOperatorName', () => {
    it('uses Ding provider name over product display text', () => {
      const resolved = resolveTelecomOperatorName({
        plan: plan({
          operatorName: '9.99 USD',
          raw: { dingProviderName: 'Airtel', ProviderCode: 'AIRTEL_IN' },
        }),
        providerOperatorName: '9.99 USD',
        providerOperatorId: 'AIRTEL_IN',
        countryIso3: 'IND',
      })
      expect(resolved).toBe('Airtel')
    })

    it('does not resolve DTH products to mobile operators', () => {
      const resolved = resolveTelecomOperatorName({
        plan: plan({
          operatorName: 'Dth Airtel',
          operatorRef: 'ding:AIRTEL_DTH',
        }),
        providerOperatorName: 'Dth Airtel',
        providerOperatorId: 'AIRTEL_DTH',
        countryIso3: 'IND',
      })
      expect(resolved).toBeNull()
    })
  })
})
