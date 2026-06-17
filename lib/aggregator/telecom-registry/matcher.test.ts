import type { DomainOperatorRegistryRow } from './types'
import { TelecomOperatorRegistryMatcher } from './matcher'

function row(input: Partial<DomainOperatorRegistryRow> & Pick<DomainOperatorRegistryRow, 'countryIso3' | 'operatorName' | 'normalizedName'>): DomainOperatorRegistryRow {
  return {
    countryIso3: input.countryIso3,
    operatorName: input.operatorName,
    normalizedName: input.normalizedName,
    slug: input.slug ?? input.operatorName.toLowerCase(),
    aliases: input.aliases ?? [],
    mcc: input.mcc ?? null,
    mnc: input.mnc ?? null,
    domain: 'MOBILE',
    isActive: true,
    source: 'test',
  }
}

describe('TelecomOperatorRegistryMatcher', () => {
  const registry = new TelecomOperatorRegistryMatcher([
    row({
      countryIso3: 'IND',
      operatorName: 'Airtel',
      normalizedName: 'AIRTEL',
      aliases: ['bharti airtel', 'airtel india'],
    }),
    row({
      countryIso3: 'IND',
      operatorName: 'Vi',
      normalizedName: 'VI',
      aliases: ['vodafone idea', 'vodafone in', 'idea cellular'],
    }),
    row({
      countryIso3: 'USA',
      operatorName: 'AT&T',
      normalizedName: 'AT&T',
      aliases: ['att', 'at and t'],
    }),
  ])

  it('matches exact operator names within country', () => {
    const match = registry.match('Airtel', 'IND')
    expect(match?.matchMethod).toBe('exact')
    expect(match?.row.operatorName).toBe('Airtel')
  })

  it('matches normalized names after stripping country suffix', () => {
    const match = registry.match('Airtel India', 'IND')
    expect(match?.matchMethod).toBe('exact')
    expect(match?.row.normalizedName).toBe('AIRTEL')
  })

  it('matches when country ISO3 is a prefix', () => {
    const match = registry.match('IND Airtel', 'IND')
    expect(match?.row.operatorName).toBe('Airtel')
  })

  it('matches aliases after stripping ISO2 suffix', () => {
    const match = registry.match('Vodafone IN', 'IND')
    expect(match?.matchMethod).toBe('alias')
    expect(match?.row.operatorName).toBe('Vi')
  })

  it('does not match operators across countries', () => {
    expect(registry.match('Airtel', 'USA')).toBeNull()
    expect(registry.match('AT&T', 'IND')).toBeNull()
  })

  it('does not match explicit DTH variants to mobile registry entries', () => {
    expect(registry.match('Airtel DTH IND', 'IND')).toBeNull()
  })
})
