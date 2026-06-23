import {
  buildCountryOperatorRechargeMergeKey,
  groupPlansByCountryOperatorRecharge,
  resolveSystemPlanRechargeIdentity,
} from './system-plan-recharge-identity'

describe('system-plan-recharge-identity', () => {
  it('prefers system plan amount/currency as price', () => {
    const identity = resolveSystemPlanRechargeIdentity({
      amount: 349,
      currency: 'INR',
      systemPlanName: 'Airtel India Bundle 399 INR',
      mappingRecharge: { amount: 399, currency: 'INR' },
    })
    expect(identity).toEqual({ amount: 349, currency: 'INR', source: 'system_price' })
  })

  it('falls back to display-name face value when price missing', () => {
    const identity = resolveSystemPlanRechargeIdentity({
      systemPlanName: 'Airtel India Bundle 349 INR',
      countryCode: 'IND',
    })
    expect(identity?.source).toBe('display_name')
    expect(identity?.amount).toBe(349)
    expect(identity?.currency).toBe('INR')
  })

  it('falls back to mapping recharge when price and name face value missing', () => {
    const identity = resolveSystemPlanRechargeIdentity({
      systemPlanName: 'Airtel Unlimited Bundle',
      countryCode: 'IND',
      mappingRecharge: { amount: 349, currency: 'INR' },
    })
    expect(identity).toEqual({ amount: 349, currency: 'INR', source: 'mapping_raw' })
  })

  it('groups plans with same country, operator, and recharge value', () => {
    const operatorId = 'op-airtel'
    const plans = [
      {
        id: 'p1',
        system_operator_id: operatorId,
        country_code: 'IND',
        amount: 349,
        currency: 'INR',
        system_plan_name: 'Airtel India Bundle 349',
      },
      {
        id: 'p2',
        system_operator_id: operatorId,
        country_code: 'IND',
        amount: 349,
        currency: 'INR',
        system_plan_name: 'Airtel Unlimited 349',
      },
      {
        id: 'p3',
        system_operator_id: operatorId,
        country_code: 'IND',
        amount: 399,
        currency: 'INR',
        system_plan_name: 'Airtel India 399',
      },
    ]

    const groups = groupPlansByCountryOperatorRecharge(plans, new Map())
    const key349 = buildCountryOperatorRechargeMergeKey({
      countryCode: 'IND',
      systemOperatorId: operatorId,
      recharge: { amount: 349, currency: 'INR' },
    })

    expect(groups.get(key349)?.plans).toHaveLength(2)
    expect(groups.size).toBe(2)
  })

  it('does not group different operators with same recharge value', () => {
    const plans = [
      {
        id: 'p1',
        system_operator_id: 'airtel',
        country_code: 'IND',
        amount: 349,
        currency: 'INR',
        system_plan_name: 'Plan 349',
      },
      {
        id: 'p2',
        system_operator_id: 'jio',
        country_code: 'IND',
        amount: 349,
        currency: 'INR',
        system_plan_name: 'Plan 349',
      },
    ]

    const groups = groupPlansByCountryOperatorRecharge(plans, new Map())
    expect(groups.size).toBe(2)
  })
})
