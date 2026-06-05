import { fingerprintPlan } from '@/lib/uti/normalize'
import { NormalizedPlan } from '@/lib/providers/types'

function basePlan(overrides: Partial<NormalizedPlan> = {}): NormalizedPlan {
  return {
    providerId: 'p1',
    providerCode: 'DTONE',
    providerPlanId: '115',
    countryIso3: 'NGA',
    operatorRef: 'dtone:1707',
    service: 'Mobile',
    subservice: 'Data',
    planType: 'FIXED_VALUE_RECHARGE',
    benefits: [{ type: 'DATA', amountBase: 2, totalIncludingTax: 2, unit: 'GB', unitType: 'DATA' }],
    requiredFields: [['mobile_number']],
    raw: {},
    ...overrides,
  }
}

describe('fingerprintPlan', () => {
  it('stable for equivalent plans', () => {
    const a = fingerprintPlan(basePlan())
    const b = fingerprintPlan(basePlan({ name: 'Different name', description: 'Different description' }))
    expect(a.normalizedHash).toBe(b.normalizedHash)
  })

  it('changes when core attributes change', () => {
    const a = fingerprintPlan(basePlan())
    const b = fingerprintPlan(basePlan({ benefits: [{ type: 'DATA', amountBase: 5, totalIncludingTax: 5, unit: 'GB', unitType: 'DATA' }] }))
    expect(a.normalizedHash).not.toBe(b.normalizedHash)
  })
})

