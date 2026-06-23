import {
  catalogFieldsFromRawPlan,
  mergeMappedDetailsWithSystemPlan,
  rankPlanMappings,
} from './system-plan-mapped-details'

describe('system-plan-mapped-details', () => {
  it('ranks verified mappings before higher-scored unverified ones', () => {
    const ranked = rankPlanMappings([
      { id: 'a', is_verified: false, matching_score: 99 },
      { id: 'b', is_verified: true, matching_score: 10 },
    ])
    expect(ranked.map((row) => row.id)).toEqual(['b', 'a'])
  })

  it('prefers mapping raw recharge over system plan amount', () => {
    const merged = mergeMappedDetailsWithSystemPlan(
      {
        id: 'raw-1',
        provider_id: 'p1',
        provider_plan_id: 'plan-1',
        destination_amount: 349,
        destination_currency: 'INR',
        validity: '28D',
        description: 'Unlimited calls',
        provider_plan_name: 'Airtel 349',
      },
      {
        id: 'sp-1',
        system_plan_name: 'Airtel India Bundle',
        amount: 399,
        currency: 'INR',
        validity: '30D',
        description: 'Stale description',
      },
    )

    expect(merged?.recharge).toEqual({ amount: 349, currency: 'INR' })
    expect(merged?.rechargeSource).toBe('mapping_raw')
    expect(merged?.validity).toBe('28D')
    expect(merged?.description).toBe('Unlimited calls')
    expect(merged?.planName).toBe('Airtel India Bundle')
  })

  it('falls back to system plan fields when raw details are missing', () => {
    const merged = mergeMappedDetailsWithSystemPlan(null, {
      id: 'sp-1',
      system_plan_name: 'Airtel India Bundle',
      amount: 349,
      currency: 'INR',
      validity: '28D',
      description: 'Bundle plan',
    })

    expect(merged?.rechargeSource).toBe('system_plan')
    expect(merged?.validity).toBe('28D')
    expect(merged?.description).toBe('Bundle plan')
  })

  it('extracts catalog fields from raw plan rows', () => {
    expect(
      catalogFieldsFromRawPlan({
        id: 'raw-1',
        provider_id: 'p1',
        provider_plan_id: 'plan-1',
        validity: ' 5D ',
        description: 'Data pack',
        provider_plan_name: 'Jio 199',
        data_volume: '2GB',
        plan_type: 'data',
      }),
    ).toEqual({
      validity: '5D',
      description: 'Data pack',
      planName: 'Jio 199',
      dataVolume: '2GB',
      planType: 'data',
    })
  })
})
