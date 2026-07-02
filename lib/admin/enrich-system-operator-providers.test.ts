import { describe, expect, it } from '@jest/globals'
import {
  buildCountryLookupByIso3,
  inferProviderIdsFromRawOperators,
} from '@/lib/admin/enrich-system-operator-providers'

describe('enrich-system-operator-providers', () => {
  const countryLookup = buildCountryLookupByIso3([
    { id: 'DZA', name: 'Algeria', iso2: 'DZ', iso3: 'DZA' },
  ])

  it('matches system operator to raw operator by normalized name and country', () => {
    const ids = inferProviderIdsFromRawOperators(
      {
        id: 'sys-1',
        system_operator_name: 'Djezzy DZA',
        country_id: 'DZA',
      },
      [
        {
          service_provider_id: 'prov-dtone',
          provider_operator_name: 'Djezzy Algeria',
          iso_code: 'DZA',
        },
      ],
      countryLookup,
    )
    expect(ids).toEqual(['prov-dtone'])
  })

  it('returns empty when country does not match', () => {
    const ids = inferProviderIdsFromRawOperators(
      {
        id: 'sys-1',
        system_operator_name: 'Djezzy DZA',
        country_id: 'DZA',
      },
      [
        {
          service_provider_id: 'prov-dtone',
          provider_operator_name: 'Djezzy Algeria',
          iso_code: 'MYS',
        },
      ],
      countryLookup,
    )
    expect(ids).toEqual([])
  })
})
