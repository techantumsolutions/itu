import {
  clearLcrRoutingCaches,
  getCachedActiveRoutingRules,
  getCachedLcrEngineSettings,
  getCachedProviderPriorities,
  getCachedRoutingRules,
  setCachedCountryIso3,
  getCachedCountryIso3,
} from '@/lib/routing/lcr-routing-cache'

jest.mock('@/lib/routing/repository', () => ({
  getLcrEngineSettings: jest.fn().mockResolvedValue({
    id: 's1',
    enabled: true,
    routingStrategy: 'LEAST_COST',
    fallbackStrategy: 'NEXT_PROVIDER',
    autoFailover: true,
    retryEnabled: true,
    retryAttempts: 2,
  }),
  listRoutingRules: jest.fn().mockResolvedValue([
    {
      id: 'r1',
      ruleName: 'Test',
      status: 'ACTIVE',
      priority: 1,
      providerId: 'p1',
      countryId: null,
      operatorId: null,
      productType: null,
    },
  ]),
  listProviderPriorities: jest.fn().mockResolvedValue([{ providerId: 'p1', priority: 1, code: 'DING', name: 'Ding' }]),
}))

import { getLcrEngineSettings, listRoutingRules, listProviderPriorities } from '@/lib/routing/repository'

describe('lcr-routing-cache', () => {
  beforeEach(() => {
    clearLcrRoutingCaches()
    jest.clearAllMocks()
  })

  it('deduplicates settings reads within TTL', async () => {
    await getCachedLcrEngineSettings()
    await getCachedLcrEngineSettings()
    expect(getLcrEngineSettings).toHaveBeenCalledTimes(1)
  })

  it('deduplicates routing rules reads within TTL', async () => {
    await getCachedRoutingRules()
    await getCachedActiveRoutingRules()
    expect(listRoutingRules).toHaveBeenCalledTimes(1)
  })

  it('deduplicates provider priority reads within TTL', async () => {
    await getCachedProviderPriorities()
    await getCachedProviderPriorities()
    expect(listProviderPriorities).toHaveBeenCalledTimes(1)
  })

  it('caches country ISO3 lookups in-memory', () => {
    setCachedCountryIso3('IN', 'IND')
    expect(getCachedCountryIso3('IN')).toBe('IND')
    expect(getCachedCountryIso3('in')).toBe('IND')
  })

  it('clears all caches', async () => {
    await getCachedLcrEngineSettings()
    clearLcrRoutingCaches()
    await getCachedLcrEngineSettings()
    expect(getLcrEngineSettings).toHaveBeenCalledTimes(2)
  })
})
