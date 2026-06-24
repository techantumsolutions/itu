import { shouldUseAuthoritativeDiscovery } from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import type { OrchestrationParityReport } from '@/lib/recharge-orchestration/mapping-parity-validator'

function parityReport(ok: boolean): OrchestrationParityReport {
  return {
    internalPlanId: 'plan-1',
    systemPlanId: 'sys-1',
    ok,
    authoritativeProviderCount: ok ? 2 : 0,
    internalCacheProviderCount: 2,
    orphanInternalRows: ok ? 0 : 1,
    missingInternalCacheRows: 0,
    mismatches: [],
    errors: ok ? [] : ['orphan'],
  }
}

describe('shouldUseAuthoritativeDiscovery', () => {
  const originalForceLegacy = process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
  const originalAuthoritative = process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS

  afterEach(() => {
    if (originalForceLegacy === undefined) delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    else process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING = originalForceLegacy
    if (originalAuthoritative === undefined) delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    else process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS = originalAuthoritative
  })

  it('uses authoritative path when parity ok', () => {
    delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    expect(shouldUseAuthoritativeDiscovery(parityReport(true))).toBe(true)
  })

  it('falls back when parity fails and no force flag', () => {
    delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    expect(shouldUseAuthoritativeDiscovery(parityReport(false))).toBe(false)
  })

  it('forces authoritative when RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS=1', () => {
    process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS = '1'
    expect(shouldUseAuthoritativeDiscovery(parityReport(false))).toBe(true)
  })

  it('forces legacy when RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING=1', () => {
    process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING = '1'
    expect(shouldUseAuthoritativeDiscovery(parityReport(true))).toBe(false)
  })
})
