import {
  buildEquivalentPlanMergeKey,
  buildPlanFeatureKey,
  extractDisplayPriceFromName,
  extractPriceMentionsFromName,
  groupEquivalentDisplayPlans,
  normalizeDisplayAmount,
  pickMergeTargetPlan,
} from './plan-display-merge'

describe('plan-display-merge', () => {
  it('extracts INR price from leading currency format', () => {
    expect(extractDisplayPriceFromName('INR 299: UL Calls+1GB/Day', 'IND')).toEqual({
      amount: 299,
      currency: 'INR',
    })
  })

  it('extracts INR price from trailing currency format', () => {
    expect(extractDisplayPriceFromName('Airtel India Bundles 299.00 INR', 'IND')).toEqual({
      amount: 299,
      currency: 'INR',
    })
  })

  it('ignores EUR in name when local INR price is present', () => {
    const mentions = extractPriceMentionsFromName('INR 299 (€3.50) bundle')
    expect(mentions).toEqual(expect.arrayContaining([{ amount: 299, currency: 'INR' }]))
    expect(extractDisplayPriceFromName('INR 299 (€3.50) bundle', 'IND')).toEqual({
      amount: 299,
      currency: 'INR',
    })
  })

  it('normalizes decimal amounts for comparison', () => {
    expect(normalizeDisplayAmount(299)).toBe('299')
    expect(normalizeDisplayAmount(299.0)).toBe('299')
    expect(normalizeDisplayAmount(299.5)).toBe('299.5')
  })

  it('groups plans with same country, operator, features, and name price', () => {
    const featureKey = buildPlanFeatureKey({
      validity: '28D',
      data_volume: '1GB',
      sms: null,
      talktime: 'UL',
      plan_type: 'BUNDLE',
    })

    const planA = {
      id: 'a',
      system_operator_id: 'op-1',
      country_code: 'IND',
      system_plan_name: 'INR 299: UL Calls+1GB/Day',
      validity: '28D',
      data_volume: '1GB',
      talktime: 'UL',
      plan_type: 'BUNDLE',
      status: 'ACTIVE',
      internal_plan_id: 'int-1',
      created_at: '2026-01-01',
    }
    const planB = {
      id: 'b',
      system_operator_id: 'op-1',
      country_code: 'IND',
      system_plan_name: 'Airtel India Bundles 299.00 INR',
      validity: '28D',
      data_volume: '1GB',
      talktime: 'UL',
      plan_type: 'BUNDLE',
      status: 'ACTIVE',
      internal_plan_id: 'int-2',
      created_at: '2026-01-02',
    }

    const groups = groupEquivalentDisplayPlans([planA, planB])
    const key = buildEquivalentPlanMergeKey({
      countryCode: 'IND',
      systemOperatorId: 'op-1',
      featureKey,
      displayPrice: { amount: 299, currency: 'INR' },
    })
    expect(groups.get(key)?.map((p) => p.id).sort()).toEqual(['a', 'b'])
  })

  it('does not group plans from different operators', () => {
    const planA = {
      id: 'a',
      system_operator_id: 'op-1',
      country_code: 'IND',
      system_plan_name: 'INR 299 bundle',
      validity: '28D',
      data_volume: '1GB',
      plan_type: 'BUNDLE',
    }
    const planB = {
      id: 'b',
      system_operator_id: 'op-2',
      country_code: 'IND',
      system_plan_name: 'INR 299 bundle',
      validity: '28D',
      data_volume: '1GB',
      plan_type: 'BUNDLE',
    }

    const groups = groupEquivalentDisplayPlans([planA, planB])
    expect([...groups.values()].every((group) => group.length === 1)).toBe(true)
  })

  it('does not group plans with different feature sets', () => {
    const planA = {
      id: 'a',
      system_operator_id: 'op-1',
      country_code: 'IND',
      system_plan_name: 'INR 299 bundle',
      validity: '28D',
      data_volume: '1GB',
      plan_type: 'BUNDLE',
    }
    const planB = {
      id: 'b',
      system_operator_id: 'op-1',
      country_code: 'IND',
      system_plan_name: 'INR 299 bundle',
      validity: '7D',
      data_volume: '1GB',
      plan_type: 'BUNDLE',
    }

    const groups = groupEquivalentDisplayPlans([planA, planB])
    expect([...groups.values()].every((group) => group.length === 1)).toBe(true)
  })

  it('prefers active plan with internal_plan_id as merge target', () => {
    const target = pickMergeTargetPlan([
      {
        id: 'a',
        status: 'INACTIVE',
        internal_plan_id: null,
        system_plan_name: 'Long inactive plan name',
        created_at: '2026-01-01',
      },
      {
        id: 'b',
        status: 'ACTIVE',
        internal_plan_id: 'int-1',
        system_plan_name: 'INR 299',
        created_at: '2026-01-02',
      },
    ])
    expect(target?.id).toBe('b')
  })
})
