import {
  ruleCountryMatches,
  ruleOperatorMatches,
  ruleMatches,
  resolveViableRoutingRule,
} from '@/lib/routing/routing-engine-service'
import type { RoutingRuleRow } from '@/lib/routing/types'

function baseRule(overrides: Partial<RoutingRuleRow> = {}): RoutingRuleRow {
  return {
    id: 'rule-1',
    ruleName: 'Test',
    countryId: 'IND',
    operatorId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    productType: null,
    providerId: 'p-vt',
    priority: 1,
    status: 'ACTIVE',
    effectiveFrom: null,
    effectiveTo: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('routing rule matching', () => {
  it('matches operator when rule has UUID and context has system: prefix', () => {
    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    expect(ruleOperatorMatches(uuid, `system:${uuid}`)).toBe(true)
    expect(
      ruleMatches(baseRule({ operatorId: uuid }), {
        countryId: 'IND',
        operatorId: `system:${uuid}`,
        productId: 'plan-1',
      }),
    ).toBe(true)
  })

  it('matches comma-separated country list on rule', () => {
    expect(ruleCountryMatches('IND,PAK', 'IND')).toBe(true)
    expect(ruleCountryMatches('IND,PAK', 'PAK')).toBe(true)
    expect(ruleCountryMatches('IND,PAK', 'USA')).toBe(false)
    expect(
      ruleMatches(baseRule({ countryId: 'IND,PAK' }), {
        countryId: 'IND',
        operatorId: 'system:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        productId: 'plan-1',
      }),
    ).toBe(true)
  })

  it('resolveViableRoutingRule skips ineligible providers and picks next priority', () => {
    const rules = [
      baseRule({ id: 'r1', priority: 1, providerId: 'p-missing' }),
      baseRule({ id: 'r2', priority: 2, providerId: 'p-vt' }),
    ]
    const eligible = [
      { providerId: 'p-vt', providerName: 'Value Topup', eligible: true } as any,
      { providerId: 'p-ding', providerName: 'Ding', eligible: true } as any,
    ]
    const picked = resolveViableRoutingRule(
      rules,
      { countryId: 'IND', operatorId: 'system:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', productId: 'p1' },
      eligible,
    )
    expect(picked?.rule.id).toBe('r2')
    expect(picked?.candidate.providerId).toBe('p-vt')
  })
})
