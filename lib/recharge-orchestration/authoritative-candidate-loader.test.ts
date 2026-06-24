import { shouldUseAuthoritativeDiscovery } from '@/lib/recharge-orchestration/authoritative-candidate-loader'
import type { OrchestrationParityReport } from '@/lib/recharge-orchestration/mapping-parity-validator'

function parityReport(
  ok: boolean,
  authoritativeProviderCount: number,
): OrchestrationParityReport {
  return {
    internalPlanId: 'plan-1',
    systemPlanId: 'sys-1',
    ok,
    authoritativeProviderCount,
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

  it('uses plan_mappings when authoritative providers exist (parity ok)', () => {
    delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    expect(shouldUseAuthoritativeDiscovery(parityReport(true, 2), 2)).toBe(true)
  })

  it('uses plan_mappings when providers exist even if parity fails', () => {
    delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    expect(shouldUseAuthoritativeDiscovery(parityReport(false, 2), 2)).toBe(true)
  })

  it('falls back when no authoritative providers', () => {
    delete process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING
    delete process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS
    expect(shouldUseAuthoritativeDiscovery(parityReport(false, 0), 0)).toBe(false)
  })

  it('forces authoritative when RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS=1 and providers exist', () => {
    process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS = '1'
    expect(shouldUseAuthoritativeDiscovery(parityReport(false, 2), 2)).toBe(true)
  })

  it('does not use authoritative when count is zero even with force flag', () => {
    process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS = '1'
    expect(shouldUseAuthoritativeDiscovery(parityReport(false, 0), 0)).toBe(false)
  })

  it('forces legacy when RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING=1', () => {
    process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING = '1'
    expect(shouldUseAuthoritativeDiscovery(parityReport(true, 2), 2)).toBe(false)
  })
})
