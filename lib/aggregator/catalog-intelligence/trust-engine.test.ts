import { OperatorTrustEngine } from './trust-engine'
import { supabaseRest } from '@/lib/db/supabase-rest'

jest.mock('@/lib/db/supabase-rest', () => ({
  supabaseRest: jest.fn(),
}))

describe('OperatorTrustEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('evaluates trust score for a new unknown operator', async () => {
    // Mock empty database responses
    ;(supabaseRest as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('system_operators')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_aliases')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_trust_registry')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_block_keywords')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })

    const result = await OperatorTrustEngine.evaluateTrust('NewOperator', 'IND')
    expect(result.matched).toBe(false)
    expect(result.trustScore).toBe(0)
    expect(result.trustLevel).toBe('UNKNOWN')
    expect(result.reasons).toEqual([])
  })

  it('boosts trust score based on system operator match, alias match, and history', async () => {
    // Mock positive database signals
    ;(supabaseRest as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('system_operators')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'op-123', is_verified_telecom: true }]),
        })
      }
      if (url.includes('operator_aliases')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ canonical_operator_id: 'op-123' }]),
        })
      }
      if (url.includes('operator_trust_registry')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ canonical_operator_id: 'op-123', is_verified: true, provider_count: 2 }]),
        })
      }
      if (url.includes('operator_history')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ telecom_plan_count: 5, promotion_count: 2 }]),
        })
      }
      if (url.includes('operator_block_keywords')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })

    const result = await OperatorTrustEngine.evaluateTrust('Airtel', 'IND')
    expect(result.matched).toBe(true)
    expect(result.trustScore).toBe(100) // 40 (sysop) + 30 (alias) + 50 (manual) + 20 (provider consensus) + 20 (telecom plans) + 15 (promotions) = 175 capped to 100
    expect(result.trustLevel).toBe('VERIFIED')
    expect(result.reasons).toContain('existing_verified_system_operator')
    expect(result.reasons).toContain('alias_engine_match')
    expect(result.reasons).toContain('manual_registry_verification')
    expect(result.reasons).toContain('provider_consensus_matched')
  })

  it('applies negative scores for blockers', async () => {
    // Mock blocker keywords
    ;(supabaseRest as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('system_operators')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_aliases')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_trust_registry')) return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      if (url.includes('operator_block_keywords')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { keyword: 'NETFLIX', category: 'OTT', is_active: true },
            { keyword: 'STEAM', category: 'GAMING', is_active: true }
          ]),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })

    const result = await OperatorTrustEngine.evaluateTrust('Netflix Steam Operator', 'IND')
    expect(result.matched).toBe(false)
    expect(result.trustScore).toBe(0) // 0 - 20 (retail/gaming) - 15 (ott) = 0
    expect(result.reasons).toContain('negative_signal:retail_gaming_indicators')
    expect(result.reasons).toContain('negative_signal:ott_indicators')
  })
})
