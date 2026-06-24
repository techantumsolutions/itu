import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  authoritativePricingKey,
  resolveProviderPricingForSystemPlan,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import {
  planMappingPricingKey,
  type WholesalePricing,
} from '@/lib/catalog/provider-wholesale-pricing'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type PlanMappingPricingLookup = {
  planId: string
  providerId: string
  providerPlanId?: string | null
}

export type ResolvedPlanMappingPricing = WholesalePricing & {
  internalPlanId: string
  systemPlanId: string | null
  providerPlanId: string | null
}

type PlanIds = {
  internalPlanId: string
  systemPlanId: string | null
}

async function resolvePlanIds(planId: string): Promise<PlanIds | null> {
  const [internalRes, systemRes] = await Promise.all([
    supabaseRest(`internal_plans?id=eq.${enc(planId)}&select=id&limit=1`, { cache: 'no-store' }),
    supabaseRest(
      `system_plans?id=eq.${enc(planId)}&select=id,internal_plan_id&limit=1`,
      { cache: 'no-store' },
    ),
  ])

  if (internalRes.ok) {
    const rows = (await internalRes.json()) as Array<{ id: string }>
    if (rows[0]?.id) {
      const systemLookup = await supabaseRest(
        `system_plans?internal_plan_id=eq.${enc(rows[0].id)}&select=id&limit=1`,
        { cache: 'no-store' },
      )
      const systemRows = systemLookup.ok
        ? ((await systemLookup.json()) as Array<{ id: string }>)
        : []
      return {
        internalPlanId: rows[0].id,
        systemPlanId: systemRows[0]?.id ?? null,
      }
    }
  }

  if (systemRes.ok) {
    const rows = (await systemRes.json()) as Array<{ id: string; internal_plan_id?: string | null }>
    if (rows[0]?.id) {
      return {
        internalPlanId: rows[0].internal_plan_id ?? rows[0].id,
        systemPlanId: rows[0].id,
      }
    }
  }

  return null
}

/** Resolve wholesale pricing via authoritative plan_mappings → provider_plans_raw service. */
export async function batchResolvePlanMappingPricing(
  lookups: PlanMappingPricingLookup[],
): Promise<Map<string, ResolvedPlanMappingPricing>> {
  const result = new Map<string, ResolvedPlanMappingPricing>()
  if (!lookups.length) return result

  const planIdsByInput = new Map<string, PlanIds>()
  for (const lookup of lookups) {
    if (!lookup.planId || !lookup.providerId) continue
    if (!planIdsByInput.has(lookup.planId)) {
      const resolved = await resolvePlanIds(lookup.planId)
      if (resolved) planIdsByInput.set(lookup.planId, resolved)
    }
  }

  const systemPlanIds = [
    ...new Set(
      [...planIdsByInput.values()]
        .map((p) => p.systemPlanId)
        .filter((id): id is string => Boolean(id)),
    ),
  ]

  const authoritativeBySystemPlan = new Map<
    string,
    Awaited<ReturnType<typeof resolveProviderPricingForSystemPlan>>
  >()
  for (const systemPlanId of systemPlanIds) {
    const resolution = await resolveProviderPricingForSystemPlan(systemPlanId)
    if (resolution) authoritativeBySystemPlan.set(systemPlanId, resolution)
  }

  for (const lookup of lookups) {
    if (!lookup.planId || !lookup.providerId) continue
    const ids = planIdsByInput.get(lookup.planId)
    if (!ids?.systemPlanId) continue

    const authoritative = authoritativeBySystemPlan.get(ids.systemPlanId)
    const authRow =
      (lookup.providerPlanId
        ? authoritative?.byKey.get(authoritativePricingKey(lookup.providerId, lookup.providerPlanId))
        : null) ?? authoritative?.byProviderId.get(lookup.providerId)

    if (!authRow) continue

    const providerPlanId = lookup.providerPlanId ?? authRow.providerPlanId ?? null
    const resolved: ResolvedPlanMappingPricing = {
      wholesaleAmount: authRow.provider_wholesale_amount,
      wholesaleCurrency: authRow.provider_wholesale_currency,
      destinationAmount: authRow.destination_face_value,
      destinationCurrency: authRow.destination_currency,
      internalPlanId: ids.internalPlanId,
      systemPlanId: ids.systemPlanId,
      providerPlanId,
    }

    result.set(planMappingPricingKey(ids.internalPlanId, lookup.providerId, providerPlanId), resolved)
    result.set(planMappingPricingKey(ids.internalPlanId, lookup.providerId, null), resolved)
    result.set(planMappingPricingKey(lookup.planId, lookup.providerId, providerPlanId), resolved)
    result.set(planMappingPricingKey(lookup.planId, lookup.providerId, null), resolved)
  }

  return result
}

export async function resolvePlanMappingPricing(
  lookup: PlanMappingPricingLookup,
): Promise<ResolvedPlanMappingPricing | null> {
  const map = await batchResolvePlanMappingPricing([lookup])
  const ids = await resolvePlanIds(lookup.planId)
  if (!ids) return null
  const key = planMappingPricingKey(
    ids.internalPlanId,
    lookup.providerId,
    lookup.providerPlanId,
  )
  return map.get(key) ?? map.get(planMappingPricingKey(ids.internalPlanId, lookup.providerId, null)) ?? null
}
