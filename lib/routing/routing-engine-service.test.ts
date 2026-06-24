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
  insertDetailedRoutingLog: jest.fn(async () => 'log-detail-1'),
}))

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

jest.mock('@/lib/lcr-v2/recharge-db', () => ({
  dbGetInternalPlan: jest.fn(async () => ({ id: 'plan-1' })),
}))

jest.mock('@/lib/catalog/system-plan-pricing-consistency', () => ({
  logAuthoritativeMappingMissing: jest.fn(),
}))

let authoritativePricingRows: Array<{
  provider_id: string
  provider_plan_id: string
  provider_price: number | null
  provider_currency: string | null
}> = []

jest.mock('@/lib/catalog/resolve-provider-pricing-for-system-plan', () => ({
  authoritativePricingKey: (providerId: string, providerPlanId: string) =>
    `${providerId}:${providerPlanId}`,
  resolveProviderPricingForInternalPlan: jest.fn(async (internalPlanId: string) => {
    const providers = authoritativePricingRows.map((m) => ({
      providerId: m.provider_id,
      providerName: m.provider_id,
      providerCode: null,
      providerPlanId: m.provider_plan_id,
      providerPlanRawId: null,
      planMappingId: null,
      systemPlanId: internalPlanId,
      internalPlanId,
      provider_wholesale_amount: m.provider_price,
      provider_wholesale_currency: m.provider_currency,
      destination_face_value: null,
      destination_currency: null,
      matchingScore: null,
      isVerified: true,
      existsInPlanMappings: true,
      sourceTable: 'plan_mappings+provider_plans_raw',
      sourceFile: 'test',
      sourceQuery: 'test',
    }))
    const byKey = new Map(
      providers.map((p) => [`${p.providerId}:${p.providerPlanId}`, p]),
    )
    const byProviderId = new Map(providers.map((p) => [p.providerId, p]))
    return {
      systemPlanId: internalPlanId,
      internalPlanId,
      systemPlanName: null,
      providers,
      byKey,
      byProviderId,
    }
  }),
}))

import { supabaseRest } from '@/lib/db/supabase-rest'
import { listActiveRoutingRules } from './repository'

const mockedSupabase = supabaseRest as jest.MockedFunction<typeof supabaseRest>
const mockedRules = listActiveRoutingRules as jest.MockedFunction<typeof listActiveRoutingRules>

function mockMappings(
  rows: Array<{
    provider_id: string
    provider_plan_id: string
    provider_price: number
    provider_currency?: string
    provider_priority?: number
  }>,
) {
  authoritativePricingRows = rows.map((r) => ({
    provider_id: r.provider_id,
    provider_plan_id: r.provider_plan_id,
    provider_price: r.provider_price,
    provider_currency: r.provider_currency ?? 'EUR',
  }))
  mockedSupabase.mockImplementation(async (path: string) => {
    if (path.includes('internal_plan_provider_mapping')) {
      const mapped = rows.map((r) => ({
        ...r,
        provider_currency: r.provider_currency ?? 'EUR',
        enabled: true,
      }))
      return { ok: true, json: async () => mapped } as Response
    }
    if (path.includes('lcr_providers')) {
      const adapterById: Record<string, string> = {
        'p-dtone': 'dtone',
        'p-ding': 'ding',
        'p-reloadly': 'reloadly',
      }
      const providers = rows.map((r, i) => ({
        id: r.provider_id,
        code: ['DTONE', 'DING', 'RELOADLY'][i] ?? 'P',
        name: ['DT One', 'Ding', 'Reloadly'][i] ?? 'Provider',
        is_active: true,
        priority: 100 + i,
        status: 'online',
        supported_countries: [],
        adapter_key: adapterById[r.provider_id] ?? 'ding',
      }))
      return { ok: true, json: async () => providers } as Response
    }
    if (path.includes('agg_exchange_rates')) {
      return { ok: true, json: async () => [] } as Response
    }
    return { ok: false, text: async () => 'not found' } as Response
  })
}

describe('RoutingEngineService', () => {
  const service = new RoutingEngineService()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedRules.mockResolvedValue([])
    process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING = '1'
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

  it('tries next rule by priority when first rule provider is not mapped', async () => {
    mockMappings([
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8, provider_currency: 'EUR' },
      { provider_id: 'p-vt', provider_plan_id: 'plan-v', provider_price: 12, provider_currency: 'EUR' },
    ])
    mockedRules.mockResolvedValue([
      {
        id: 'rule-1',
        ruleName: 'Force DT One',
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
      {
        id: 'rule-2',
        ruleName: 'Force Value Topup',
        countryId: 'IND',
        operatorId: 'airtel',
        productType: null,
        providerId: 'p-vt',
        priority: 2,
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
      productId: 'plan-priority',
    })

    expect(result.routingType).toBe('RULE')
    expect(result.ruleId).toBe('rule-2')
    expect(result.selected?.providerId).toBe('p-vt')
  })

  it('uses LCR when all matching rules have unmapped providers', async () => {
    mockMappings([
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8, provider_currency: 'EUR' },
    ])
    mockedRules.mockResolvedValue([
      {
        id: 'rule-1',
        ruleName: 'Force DT One',
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
      {
        id: 'rule-2',
        ruleName: 'Force Value Topup',
        countryId: 'IND',
        operatorId: 'airtel',
        productType: null,
        providerId: 'p-vt',
        priority: 2,
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
      productId: 'plan-lcr-fallback',
    })

    expect(result.routingType).toBe('LCR')
    expect(result.selected?.providerId).toBe('p-ding')
    expect(result.routing_decision_reason).toBe('NO_VIABLE_ROUTING_RULE')
  })

  it('selects lowest normalized cost when no rule exists (Ding = 8 EUR)', async () => {
    mockMappings([
      { provider_id: 'p-dtone', provider_plan_id: 'plan-d', provider_price: 10, provider_currency: 'EUR' },
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8, provider_currency: 'EUR' },
      { provider_id: 'p-reloadly', provider_plan_id: 'plan-r', provider_price: 12, provider_currency: 'EUR' },
    ])

    const result = await service.resolveProvider({
      countryId: 'USA',
      operatorId: 'tmobile',
      productId: 'plan-2',
    })

    expect(result.routingType).toBe('LCR')
    expect(result.selected?.providerId).toBe('p-ding')
    expect(result.selected?.normalized_provider_price).toBe(8)
  })

  it('sorts by normalized cost, not raw provider_price (INR vs EUR)', async () => {
    mockMappings([
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 21.44, provider_currency: 'EUR' },
      { provider_id: 'p-reloadly', provider_plan_id: 'plan-r', provider_price: 2500, provider_currency: 'INR' },
    ])

    const result = await service.resolveProvider({
      countryId: 'USA',
      operatorId: 'tmobile',
      productId: 'plan-mixed',
    })

    expect(result.selected?.providerId).toBe('p-ding')
    expect(result.selected?.normalized_provider_price).toBeCloseTo(21.44, 2)
    const reloadly = result.fallbacks.find((f) => f.providerId === 'p-reloadly')
    expect(reloadly?.normalized_provider_price).toBeGreaterThan(21.44)
  })

  it('includes DTOne as fallback when Ding is first choice', async () => {
    mockMappings([
      { provider_id: 'p-ding', provider_plan_id: 'plan-g', provider_price: 8, provider_currency: 'EUR' },
      { provider_id: 'p-dtone', provider_plan_id: 'plan-d', provider_price: 10, provider_currency: 'EUR' },
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
    authoritativePricingRows = []
    mockedSupabase.mockImplementation(async () => ({ ok: true, json: async () => [] }) as Response)

    const result = await service.resolveProvider({
      countryId: 'IND',
      operatorId: 'airtel',
      productId: 'plan-4',
    })

    expect(result.selected).toBeNull()
  })
})
