import { classifyOperatorKeywords } from './telecom-classifier'
import { classifyPlan } from './plan-classifier'
import { isValidSystemPlan } from './plan-normalizer'
import { NormalizedPlan } from '@/lib/providers/types'


function mockPlan(overrides: Partial<NormalizedPlan> = {}): NormalizedPlan {
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

describe('Central Classifiers', () => {
  describe('TelecomClassifier Keywords', () => {
    it('classifies telecom operators correctly', () => {
      const res = classifyOperatorKeywords({
        operatorName: 'Airtel',
        planNames: ['Talktime Unlimited', '2GB Data Daily'],
        categories: ['Mobile'],
        subcategories: ['Airtime']
      })
      expect(res.classification).toBe('TELECOM')
      expect(res.confidence).toBeGreaterThan(0.6)
    })

    it('classifies gaming providers correctly', () => {
      const res = classifyOperatorKeywords({
        operatorName: 'Razer Gold',
        planNames: ['Razer Pin USD 50', 'PUBG Mobile UC credits'],
        categories: ['Gaming'],
        subcategories: ['Gaming Pins']
      })
      expect(res.classification).toBe('GAMING')
      expect(res.confidence).toBeGreaterThan(0.6)
    })

    it('classifies streaming providers correctly', () => {
      const res = classifyOperatorKeywords({
        operatorName: 'Netflix',
        planNames: ['Netflix Premium 1 Month'],
        categories: ['Streaming'],
        subcategories: ['OTT']
      })
      expect(res.classification).toBe('STREAMING')
    })
  })

  describe('PlanClassifier', () => {
    it('classifies airtime plans correctly', () => {
      const plan = mockPlan({
        name: 'Airtel USD 10 topup',
        benefits: [{ type: 'AIRTIME', amountBase: 10 }]
      })
      const res = classifyPlan(plan)
      expect(res.classification).toBe('AIRTIME')
    })

    it('classifies data plans correctly', () => {
      const plan = mockPlan({
        name: 'Airtel 10GB Data Pack',
        benefits: [{ type: 'DATA', amountBase: 10, unit: 'GB' }]
      })
      const res = classifyPlan(plan)
      expect(res.classification).toBe('DATA')
    })

    it('classifies bundles correctly', () => {
      const plan = mockPlan({
        name: 'Airtel Combo Pack',
        benefits: [
          { type: 'DATA', amountBase: 5, unit: 'GB' },
          { type: 'VOICE', amountBase: 100, unit: 'MINUTES' }
        ]
      })
      const res = classifyPlan(plan)
      expect(res.classification).toBe('BUNDLE')
    })

    it('classifies gift cards correctly', () => {
      const plan = mockPlan({
        name: 'Amazon Gift Card USD 25',
        benefits: [{ type: 'OTHER', amountBase: 25 }]
      })
      const res = classifyPlan(plan)
      expect(res.classification).toBe('GIFT_CARD')
    })
  })

  describe('isValidSystemPlan', () => {
    it('returns true for positive price airtime plan', () => {
      const plan = mockPlan({
        name: 'Airtel Topup',
        retailAmount: 10,
        benefits: [{ type: 'AIRTIME', amountBase: 10 }]
      })
      expect(isValidSystemPlan(plan)).toBe(true)
    })

    it('returns false for negative or zero price plan', () => {
      const plan = mockPlan({
        name: 'Airtel Topup',
        retailAmount: 0,
        benefits: [{ type: 'AIRTIME', amountBase: 10 }]
      })
      expect(isValidSystemPlan(plan)).toBe(false)
    })

    it('returns false for gift cards or non-telecom plans', () => {
      const plan = mockPlan({
        name: 'Amazon Gift Card USD 25',
        retailAmount: 25,
        benefits: [{ type: 'OTHER', amountBase: 25 }]
      })
      expect(isValidSystemPlan(plan)).toBe(false)
    })
  })
})

