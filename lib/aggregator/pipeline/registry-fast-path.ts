import type { RegistryMatchResult } from '@/lib/aggregator/telecom-registry'
import { TelecomOperatorRegistryMatcher, loadDomainOperatorRegistry } from '@/lib/aggregator/telecom-registry'
import { hasExcludedPlanBenefits, shouldBlockOperatorAsNonMobile } from '@/lib/aggregator/telecom-validator'
import { operatorNameForFiltration } from '@/lib/aggregator/pipeline/operator-country-strip'

export const REGISTRY_VERIFIED_SOURCE = 'domain_operator_registry'

export type RegistryFastPathResult = {
  registryMatch: RegistryMatchResult | null
  blocked: boolean
  eligible: boolean
  reason: string
}

export function isRegistryVerifiedSource(source: string | null | undefined): boolean {
  return String(source ?? '') === REGISTRY_VERIFIED_SOURCE
}

export function isRegistryVerifiedOperator(op: {
  domain_classification_source?: string | null
}): boolean {
  return isRegistryVerifiedSource(op.domain_classification_source)
}

export async function createRegistryMatcher(): Promise<TelecomOperatorRegistryMatcher> {
  const rows = await loadDomainOperatorRegistry().catch(() => [])
  return new TelecomOperatorRegistryMatcher(rows)
}

export function evaluateRegistryFastPath(
  operatorName: string,
  countryIso3: string,
  registryMatcher: TelecomOperatorRegistryMatcher,
  countryName?: string | null,
): RegistryFastPathResult {
  if (shouldBlockOperatorAsNonMobile(operatorName, null)) {
    return {
      registryMatch: null,
      blocked: true,
      eligible: false,
      reason: 'OPERATOR_NAME_HAS_BLOCKING_KEYWORD',
    }
  }

  const filtrationName = operatorNameForFiltration(operatorName, countryIso3, countryName)
  const registryMatch = registryMatcher.match(filtrationName, countryIso3)
  if (!registryMatch) {
    return {
      registryMatch: null,
      blocked: false,
      eligible: false,
      reason: 'REGISTRY_MISS',
    }
  }

  return {
    registryMatch,
    blocked: false,
    eligible: true,
    reason: 'domain_operator_registry matched',
  }
}

export function filterPlansByExcludedBenefits<T extends { raw_response?: unknown; id?: string }>(
  plans: T[],
): { telecomPlans: T[]; excludedPlans: T[] } {
  const excludedPlans: T[] = []
  const telecomPlans = plans.filter((plan) => {
    const excluded = hasExcludedPlanBenefits(plan.raw_response || {})
    if (excluded.excluded) {
      excludedPlans.push(plan)
      return false
    }
    return true
  })
  return { telecomPlans, excludedPlans }
}

export const REGISTRY_DOMAIN_FIELDS = {
  operator_domain: 'MOBILE',
  operator_domain_confidence: 99,
  domain_classification_source: REGISTRY_VERIFIED_SOURCE,
  service_domain: 'MOBILE',
  service_domain_confidence: 99,
  service_domain_source: REGISTRY_VERIFIED_SOURCE,
  status: 'active',
} as const
