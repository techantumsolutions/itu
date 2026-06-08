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

    it('soft-promotes operators with telecom title signals but no benefits', () => {
      const plans = [
        mockRawPlan({ productName: '299 Combo 1.5GB/day 28 days', benefits: [], service: { name: 'Mobile' } }),
        mockRawPlan({ productName: '199 data recharge pack', benefits: [], service: { name: 'Mobile' } }),
      ]
      const result = validateRawOperatorPlans(plans, { operatorName: 'Jio', countryCode: 'IND' })
      expect(result.passed).toBe(true)
      expect(result.telecomPlanCount).toBeGreaterThan(0)
    })

    it('rejects purely digital product catalogs without telecom signal', () => {
      const plans = [
        mockRawPlan({ description: 'Crunchyroll Fan 1 Month', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Discord Nitro Premium membership', type: 'DigitalProduct' })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.passed).toBe(false)
      expect(result.promotion?.shouldDeactivate).toBe(false)
    })

    it('does not hard-reject gaming products that still carry telecom benefits', () => {
      const plans = [
        mockRawPlan({ benefits: [{ type: 'TALKTIME' }], description: 'Razer Pin Gaming Credits' })
      ]
      const result = validateRawOperatorPlans(plans)
      expect(result.promotion?.shouldDeactivate).toBe(false)
    })

    it('soft-promotes trusted operators with low telecom ratio in mixed catalogs', () => {
      const plans = [
        mockRawPlan({ benefits: [{ type: 'DATA' }], description: '10GB data', service: { name: 'Mobile' } }),
        mockRawPlan({ description: 'Netflix subscription 1', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 2', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 3', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 4', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 5', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 6', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 7', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 8', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 9', type: 'DigitalProduct' }),
        mockRawPlan({ description: 'Netflix subscription 10', type: 'DigitalProduct' }),
      ]
      const result = validateRawOperatorPlans(plans, { operatorName: 'Jio', countryCode: 'IND' })
      expect(result.passed).toBe(true)
      expect(result.telecomPlanCount).toBeGreaterThanOrEqual(1)
    })
  })
})
