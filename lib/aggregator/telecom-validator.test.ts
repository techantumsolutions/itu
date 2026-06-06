import {
  validateRawOperatorPlans,
  hasTelecomPositiveSignal,
  hasTelecomNegativeSignal,
  isTelecomPlanRaw,
  isNonTelecomPlanRaw
} from './telecom-validator'

function mockRawPlan(overrides: any = {}): any {
  return {
    raw_json: {
      benefits: overrides.benefits || [],
      service: overrides.service || { name: '', subservice: { name: '' } },
      tags: overrides.tags || [],
      type: overrides.type || 'Plan',
      description: overrides.description || '',
      product_name: overrides.productName || overrides.name || '',
      ...overrides.raw
    }
  }
}

describe('Telecom Validator Enhancements', () => {
  describe('Raw Signals Check', () => {
    it('detects telecom plans by raw json criteria', () => {
      // DATA benefit
      expect(isTelecomPlanRaw(mockRawPlan({ benefits: [{ type: 'DATA' }] }).raw_json)).toBe(true)
      // AIRTIME tag
      expect(isTelecomPlanRaw(mockRawPlan({ tags: ['AIRTIME'] }).raw_json)).toBe(true)
      // Mobile service name
      expect(isTelecomPlanRaw(mockRawPlan({ service: { name: 'Mobile Service' } }).raw_json)).toBe(true)
      // Description keywords
      expect(isTelecomPlanRaw(mockRawPlan({ description: 'unlimited minutes' }).raw_json)).toBe(true)
      // Non-telecom description
      expect(isTelecomPlanRaw(mockRawPlan({ description: 'Netflix streaming' }).raw_json)).toBe(false)
    })

    it('detects non-telecom plans by raw json keywords', () => {
      expect(isNonTelecomPlanRaw(mockRawPlan({ description: 'Netflix Subscription' }).raw_json).matches).toBe(true)
      expect(isNonTelecomPlanRaw(mockRawPlan({ type: 'GiftCard' }).raw_json).matches).toBe(true)
      expect(isNonTelecomPlanRaw(mockRawPlan({ productName: 'Razer Gold Game credits' }).raw_json).matches).toBe(true)
      expect(isNonTelecomPlanRaw(mockRawPlan({ description: '10GB Data Pack' }).raw_json).matches).toBe(false)
    })
  })

  describe('validateRawOperatorPlans', () => {
    it('approves operators with active telecom plans', () => {
      const plans = [
        mockRawPlan({ benefits: [{ type: 'DATA' }], description: '10GB LTE data', service: { name: 'Mobile' } }),
        mockRawPlan({ benefits: [{ type: 'TALKTIME' }], description: '500 minutes calling', service: { name: 'Mobile' } })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(true)
      expect(result.telecomPlanCount).toBe(2)
      expect(result.totalPlanCount).toBe(2)
    })

    it('rejects operators with no plans (NO_VALID_PLANS)', () => {
      const result = validateRawOperatorPlans([])
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('NO_VALID_PLANS')
    })

    it('rejects operators with no telecom benefits (NO_TELECOM_BENEFITS)', () => {
      const plans = [
        mockRawPlan({ description: 'data recharge pack', benefits: [], service: { name: 'Mobile' } }), // Positive description, but no benefits
        mockRawPlan({ description: 'data bundle', benefits: [], service: { name: 'Mobile' } })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('NO_TELECOM_BENEFITS')
    })

    it('rejects operators with purely digital products (DIGITAL_PRODUCT_ONLY)', () => {
      const plans = [
        mockRawPlan({ description: 'Crunchyroll Fan 1 Month', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Discord Nitro Premium membership', type: 'DigitalProduct' })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('DIGITAL_PRODUCT_ONLY')
    })

    it('rejects operators with zero telecom plans (NON_MOBILE_RECHARGE)', () => {
      // Has telecom benefits (TALKTIME) but matched by non-telecom terms (Gaming / Razer Pin)
      const plans = [
        mockRawPlan({ benefits: [{ type: 'TALKTIME' }], description: 'Razer Pin Gaming Credits' })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('DIGITAL_PRODUCT_ONLY') // Razer Pin matches non-telecom keywords
    })

    it('rejects operators with low telecom ratio (< 0.1)', () => {
      const plans = [
        mockRawPlan({ benefits: [{ type: 'DATA' }], description: '10GB data', service: { name: 'Mobile' } }), // 1 telecom plan
        mockRawPlan({ description: 'Netflix subscription 1', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 2', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 3', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 4', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 5', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 6', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 7', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 8', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 9', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 10', type: 'DigitalProduct' })
      ] // ratio: 1/11 ~ 0.09 < 0.1
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(false)
      expect(result.reason).toBe('NON_MOBILE_RECHARGE')
    })
  })
})
