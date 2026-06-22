import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type PlanMappingRow = {
  system_plan_id: string
  service_provider_id: string
}

type ProviderRow = {
  id: string
  is_active?: boolean | null
}

type ActiveSystemPlanRow = {
  id: string
  internal_plan_id?: string | null
  system_plan_name?: string | null
}

export type SystemPlanDeactivationReason = 'no_plan_mappings' | 'no_available_providers'

export type SystemPlanAvailabilitySweepResult = {
  scanned: number
  deactivated: number
  skippedAlreadyInactive: number
  errors: number
  deactivatedPlans: Array<{
    systemPlanId: string
    systemPlanName: string | null
    reason: SystemPlanDeactivationReason
  }>
}

async function fetchAllRows<T>(buildUrl: (offset: number, limit: number) => string): Promise<T[]> {
  const limit = 1000
  let offset = 0
  const rows: T[] = []

  while (true) {
    const res = await supabaseRest(buildUrl(offset, limit), { cache: 'no-store' })
    if (!res.ok) throw new Error(await res.text())
    const page = (await res.json()) as T[]
    rows.push(...page)
    if (page.length < limit) break
    offset += limit
  }

  return rows
}

function providerIsAvailable(providerId: string, providers: Map<string, ProviderRow>): boolean {
  const provider = providers.get(providerId)
  if (!provider) return false
  return provider.is_active !== false
}

async function deactivateSystemPlan(plan: ActiveSystemPlanRow): Promise<boolean> {
  const res = await supabaseRest(`system_plans?id=eq.${enc(plan.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'INACTIVE' }),
  })
  if (!res.ok) return false

  if (plan.internal_plan_id) {
    await supabaseRest(`internal_plans?id=eq.${enc(plan.internal_plan_id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false }),
    }).catch(() => {})
  }

  return true
}

/**
 * Deactivate ACTIVE system_plans that have no plan_mappings or no available provider
 * (missing from lcr_providers or is_active = false).
 */
export async function sweepInactiveSystemPlansWithoutProviders(): Promise<SystemPlanAvailabilitySweepResult> {
  const result: SystemPlanAvailabilitySweepResult = {
    scanned: 0,
    deactivated: 0,
    skippedAlreadyInactive: 0,
    errors: 0,
    deactivatedPlans: [],
  }

  const [planMappings, providers, activePlans] = await Promise.all([
    fetchAllRows<PlanMappingRow>((offset, limit) =>
      `plan_mappings?select=system_plan_id,service_provider_id&limit=${limit}&offset=${offset}`,
    ),
    fetchAllRows<ProviderRow>((offset, limit) =>
      `lcr_providers?select=id,is_active&limit=${limit}&offset=${offset}`,
    ),
    fetchAllRows<ActiveSystemPlanRow>((offset, limit) =>
      `system_plans?status=eq.ACTIVE&select=id,internal_plan_id,system_plan_name&limit=${limit}&offset=${offset}`,
    ),
  ])

  const providerMap = new Map<string, ProviderRow>()
  for (const provider of providers) {
    if (provider.id) providerMap.set(provider.id, provider)
  }

  const mappingsBySystemPlan = new Map<string, string[]>()
  for (const mapping of planMappings) {
    if (!mapping.system_plan_id || !mapping.service_provider_id) continue
    const list = mappingsBySystemPlan.get(mapping.system_plan_id) ?? []
    list.push(mapping.service_provider_id)
    mappingsBySystemPlan.set(mapping.system_plan_id, list)
  }

  for (const plan of activePlans) {
    result.scanned++

    const mappedProviderIds = mappingsBySystemPlan.get(plan.id) ?? []
    let reason: SystemPlanDeactivationReason | null = null

    if (mappedProviderIds.length === 0) {
      reason = 'no_plan_mappings'
    } else {
      const hasAvailableProvider = mappedProviderIds.some((providerId) =>
        providerIsAvailable(providerId, providerMap),
      )
      if (!hasAvailableProvider) {
        reason = 'no_available_providers'
      }
    }

    if (!reason) continue

    try {
      const ok = await deactivateSystemPlan(plan)
      if (ok) {
        result.deactivated++
        result.deactivatedPlans.push({
          systemPlanId: plan.id,
          systemPlanName: plan.system_plan_name ?? null,
          reason,
        })
      } else {
        result.errors++
      }
    } catch {
      result.errors++
    }
  }

  return result
}
