import { normalizedPlanSignature } from '@/lib/aggregator/signature'
import { NormalizedPlan } from '@/lib/providers/types'

function plan(overrides: Partial<NormalizedPlan>): NormalizedPlan {
  return {
    providerId: 'provider-a',
    providerCode: 'A',
    providerPlanId: 'plan-a',
    countryIso3: 'IND',
    operatorRef: 'system:airtel-india',
    operatorName: 'Airtel India',
    service: 'Mobile',
    subservice: 'Data',
    planType: 'DATA',
    benefits: [{ type: 'DATA', amountBase: 2, unit: 'GB' }, { type: 'SMS', amountBase: 100, unit: 'SMS' }],
    requiredFields: [],
    validityDays: 28,
    retailAmount: 299,
    retailCurrency: 'INR',
    raw: {},
    ...overrides,
  }
}

describe('normalizedPlanSignature', () => {
  it('matches equivalent plans regardless of provider naming', () => {
    const first = normalizedPlanSignature(plan({ name: '2GB Anytime Pack' }))
    const second = normalizedPlanSignature(plan({ providerCode: 'B', providerPlanId: 'plan-b', name: '2GB Monthly Combo' }))
    expect(first).toBe(second)
  })

  it('changes when material benefits change', () => {
    const first = normalizedPlanSignature(plan({}))
    const second = normalizedPlanSignature(plan({ benefits: [{ type: 'DATA', amountBase: 5, unit: 'GB' }] }))
    expect(first).not.toBe(second)
  })
})
