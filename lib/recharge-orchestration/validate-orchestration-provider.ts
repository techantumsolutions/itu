import { authoritativePricingKey } from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import {
  resolveProvidersForInternalPlan,
  resolveProvidersForSystemPlan,
} from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'

export type OrchestrationProviderValidation = {
  ok: boolean
  reason?: string
  systemPlanId?: string | null
  providerPlanRawId?: string | null
}

const ORPHAN_RUNTIME_PROVIDER = 'ORPHAN_RUNTIME_PROVIDER'

/**
 * Phase 9: abort recharge hop when provider is absent from plan_mappings.
 */
export async function assertAuthoritativeProviderForRecharge(input: {
  internalPlanId: string
  /** When set (checkout summary), must match routing — avoids wrong system_plan on shared internal_plan_id. */
  systemPlanId?: string | null
  providerId: string
  providerPlanId?: string | null
}): Promise<OrchestrationProviderValidation> {
  const systemPlanId = input.systemPlanId?.trim() || null
  const resolution = systemPlanId
    ? await resolveProvidersForSystemPlan(systemPlanId)
    : await resolveProvidersForInternalPlan(input.internalPlanId)
  if (!resolution) {
    return { ok: false, reason: 'SYSTEM_PLAN_NOT_FOUND' }
  }

  const key = input.providerPlanId
    ? authoritativePricingKey(input.providerId, input.providerPlanId)
    : null

  const match = key
    ? resolution.byKey.get(key)
    : resolution.byProviderId.get(input.providerId)

  if (!match) {
    console.error(
      '[Recharge Orchestration]',
      'Orphan runtime provider detected.',
      `internal_plan_id=${input.internalPlanId}`,
      `provider_id=${input.providerId}`,
      `provider_plan_id=${input.providerPlanId ?? 'n/a'}`,
    )
    return {
      ok: false,
      reason: ORPHAN_RUNTIME_PROVIDER,
      systemPlanId: resolution.systemPlanId,
    }
  }

  return {
    ok: true,
    systemPlanId: resolution.systemPlanId,
    providerPlanRawId: match.providerPlanRawId,
  }
}

export { ORPHAN_RUNTIME_PROVIDER }
