import { RoutingEngineService } from './routing-engine-service'

jest.mock('./repository', () => ({
  isRoutingEngineSchemaReady: jest.fn(async () => true),
  getLcrEngineSettings: jest.fn(async () => ({
    id: '1',
    enabled: true,
    routingStrategy: 'LEAST_COST',
    fallbackStrategy: 'NEXT_PROVIDER',
    autoFailover: true,
    retryEnabled: true,
    retryAttempts: 2,
  })),
  listProviderPriorities: jest.fn(async () => []),
  listActiveRoutingRules: jest.fn(async () => []),
  insertRoutingLog: jest.fn(async () => 'log-1'),
}))

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

import { supabaseRest } from '@/lib/db/supabase-rest'
import { listActiveRoutingRules } from './repository'

const mockedSupabase = supabaseRest as jest.MockedFunction<typeof supabaseRest>
const mockedRules = listActiveRoutingRules as jest.MockedFunction<typeof listActiveRoutingRules>

function mockMappings(
  rows: Array<{ provider_id: string; provider_plan_id: string; provider_price: number; provider_priority?: number }>,
) {
  mockedSupabase.mockImplementation(async (path: string) => {
    if (path.includes('internal_plan_provider_mapping')) {
      return { ok: true, json: async () => rows } as Response
    }
    if (path.includes('lcr_providers')) {
      const providers = rows.map((r, i) => ({
        id: r.provider_id,
        code: ['DTONE', 'DING', 'RELOADLY'][i] ?? 'P',
        name: ['DT One', 'Ding', 'Reloadly'][i] ?? 'Provider',
        is_active: true,
        priority: 100 + i,
        status: 'online',
        supported_countries: [],
      }))
      return { ok: true, json: async () => providers } as Response
    }
    return { ok: false, text: async () => 'not found' } as Response
  })
}

describe('RoutingEngineService', () => {
  const service = new RoutingEngineService()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedRules.mockResolvedValue([])
  })

  it('selects rule provider and skips LCR (India + Airtel → DTOne)', async () => {
    mockMappings([
      { provider_id: 'p-dtone', provider_plan_id: 'plan-d', provider_price: 10 },
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8 },
    ])
    mockedRules.mockResolvedValue([
      {
        id: 'rule-1',
        ruleName: 'India Airtel',
        countryId: 'IND',
        operatorId: 'airtel',
        productType: null,
        providerId: 'p-dtone',
        priority: 1,
        status: 'ACTIVE',
        effectiveFrom: null,
        effectiveTo: null,
        createdAt: '',
        updatedAt: '',
      },
    ])

    const result = await service.resolveProvider({
      countryId: 'IND',
      operatorId: 'airtel',
      productId: 'plan-1',
    })

    expect(result.routingType).toBe('RULE')
    expect(result.selected?.providerId).toBe('p-dtone')
  })

  it('selects lowest cost when no rule exists (Ding = 8)', async () => {
    mockMappings([
      { provider_id: 'p-dtone', provider_plan_id: 'plan-d', provider_price: 10 },
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8 },
      { provider_id: 'p-reloadly', provider_plan_id: 'plan-r', provider_price: 12 },
    ])

    const result = await service.resolveProvider({
      countryId: 'USA',
      operatorId: 'tmobile',
      productId: 'plan-2',
    })

    expect(result.routingType).toBe('LCR')
    expect(result.selected?.providerId).toBe('p-ding')
  })

  it('includes DTOne as fallback when Ding is first choice', async () => {
    mockMappings([
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8 },
      { provider_id: 'p-dtone', provider_plan_id: 'plan-d', provider_price: 10 },
    ])

    const result = await service.resolveProvider({
      countryId: 'USA',
      operatorId: 'tmobile',
      productId: 'plan-3',
    })

    expect(result.selected?.providerId).toBe('p-ding')
    expect(result.fallbacks.some((f) => f.providerId === 'p-dtone')).toBe(true)
  })

  it('returns no provider when none are eligible', async () => {
    mockedSupabase.mockImplementation(async () => ({ ok: true, json: async () => [] }) as Response)

    const result = await service.resolveProvider({
      countryId: 'IND',
      operatorId: 'airtel',
      productId: 'plan-4',
    })

    expect(result.selected).toBeNull()
  })
})
