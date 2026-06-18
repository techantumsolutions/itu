import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  planMappingPricingKey,
  resolveWholesalePricing,
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

type RawPlanRow = {
  id: string
  provider_id: string
  provider_plan_id: string
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
}

type PlanMappingRow = {
  system_plan_id: string
  service_provider_id: string
  provider_plan_raw_id?: string | null
  provider_plan_id?: string | null
}

function pricingFromRawRow(rawPlan: RawPlanRow | null | undefined): WholesalePricing {
  if (!rawPlan) {
    return {
      wholesaleAmount: null,
      wholesaleCurrency: null,
      destinationAmount: null,
      destinationCurrency: null,
    }
  }
  return resolveWholesalePricing({
    rawJson: rawPlan.raw_json,
    amount: rawPlan.amount,
    currency: rawPlan.currency,
    destinationAmount: rawPlan.destination_amount,
    destinationCurrency: rawPlan.destination_currency,
  })
}

function pickPlanMapping(
  mappings: PlanMappingRow[],
  systemPlanId: string,
  providerId: string,
  providerPlanId?: string | null,
): PlanMappingRow | null {
  const scoped = mappings.filter(
    (m) => m.system_plan_id === systemPlanId && m.service_provider_id === providerId,
  )
  if (!scoped.length) return null
  if (providerPlanId) {
    const exact = scoped.find(
      (m) => m.provider_plan_id === providerPlanId || m.provider_plan_id?.trim() === providerPlanId,
    )
    if (exact) return exact
  }
  return scoped[0] ?? null
}

/** Resolve wholesale pricing via plan_mappings → provider_plans_raw for each plan/provider pair. */
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

  const planMappings: PlanMappingRow[] = []
  for (let i = 0; i < systemPlanIds.length; i += 50) {
    const chunk = systemPlanIds.slice(i, i + 50)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map(enc).join(',')})&select=system_plan_id,service_provider_id,provider_plan_raw_id,provider_plan_id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as PlanMappingRow[]
    planMappings.push(...rows)
  }

  const rawIds = [
    ...new Set(
      planMappings.map((m) => m.provider_plan_raw_id).filter((id): id is string => Boolean(id)),
    ),
  ]
  const rawById = new Map<string, RawPlanRow>()
  for (let i = 0; i < rawIds.length; i += 100) {
    const chunk = rawIds.slice(i, i + 100)
    const res = await supabaseRest(
      `provider_plans_raw?id=in.(${chunk.map(enc).join(',')})&select=id,provider_id,provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as RawPlanRow[]
    for (const row of rows) {
      if (row.id) rawById.set(row.id, row)
    }
  }

  for (const lookup of lookups) {
    if (!lookup.planId || !lookup.providerId) continue
    const ids = planIdsByInput.get(lookup.planId)
    if (!ids?.systemPlanId) continue

    const mapping = pickPlanMapping(
      planMappings,
      ids.systemPlanId,
      lookup.providerId,
      lookup.providerPlanId,
    )
    const rawPlan = mapping?.provider_plan_raw_id
      ? rawById.get(mapping.provider_plan_raw_id) ?? null
      : null
    const pricing = pricingFromRawRow(rawPlan)
    const providerPlanId =
      lookup.providerPlanId ??
      mapping?.provider_plan_id ??
      rawPlan?.provider_plan_id ??
      null

    const resolved: ResolvedPlanMappingPricing = {
      ...pricing,
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
