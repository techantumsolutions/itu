import { describe, expect, it } from '@jest/globals'
import { matchesOperatorListSearch, matchesPlanListSearch, matchesProviderListSearch } from '@/lib/admin/operator-list-search'

describe('operator-list-search', () => {
  it('matches provider code in operator search', () => {
    expect(
      matchesOperatorListSearch('ding', {
        operatorName: 'Claro ARG',
        providerNames: ['DING'],
        providerCodes: ['DING'],
      }),
    ).toBe(true)
  })

  it('matches operator name only when provider does not match', () => {
    expect(
      matchesOperatorListSearch('claro', {
        operatorName: 'Claro ARG',
        providerNames: ['DT One'],
        providerCodes: ['DTONE'],
      }),
    ).toBe(true)
  })

  it('filters plan provider names', () => {
    expect(matchesProviderListSearch('ding', ['DING'], [])).toBe(true)
    expect(matchesProviderListSearch('ding', ['DT One'], ['DTONE'])).toBe(false)
  })

  it('matches provider code in plan search', () => {
    expect(
      matchesPlanListSearch('ding', {
        planName: 'Some recharge',
        providerNames: [],
        providerCodes: ['DING'],
      }),
    ).toBe(true)
  })
})
