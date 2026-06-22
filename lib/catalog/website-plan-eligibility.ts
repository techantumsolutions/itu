import { supabaseRest } from '@/lib/db/supabase-rest'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type PlanMappingRow = {
  id: string
  system_plan_id: string
  service_provider_id: string
  provider_plan_id?: string | null
  provider_plan_raw_id?: string | null
}

type SystemOperatorRow = {
  id: string
  status?: string | null
}

async function fetchInChunks<T>(
  ids: string[],
  buildUrl: (chunk: string[]) => string,
  chunkSize = 100,
): Promise<T[]> {
  const rows: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const res = await supabaseRest(buildUrl(chunk), { cache: 'no-store' })
    if (!res.ok) continue
    rows.push(...((await res.json()) as T[]))
  }
  return rows
}

async function loadExistingRawPlanIds(rawIds: string[]): Promise<Set<string>> {
  const existing = new Set<string>()
  if (!rawIds.length) return existing

  for (let i = 0; i < rawIds.length; i += 100) {
    const chunk = rawIds.slice(i, i + 100)
    const res = await supabaseRest(
      `provider_plans_raw?id=in.(${chunk.map(enc).join(',')})&select=id`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Array<{ id?: string }>
    for (const row of rows) {
      if (row.id) existing.add(row.id)
    }
  }
  return existing
}

async function loadStableRawPlanKeys(
  mappings: PlanMappingRow[],
): Promise<Set<string>> {
  const keys = new Set<string>()
  const byProvider = new Map<string, Set<string>>()

  for (const mapping of mappings) {
    const providerPlanId = mapping.provider_plan_id?.trim()
    if (!providerPlanId) continue
    const providerId = mapping.service_provider_id
    if (!providerId) continue
    const set = byProvider.get(providerId) ?? new Set<string>()
    set.add(providerPlanId)
    byProvider.set(providerId, set)
  }

  for (const [providerId, planIds] of byProvider.entries()) {
    const planIdList = [...planIds]
    for (let i = 0; i < planIdList.length; i += 50) {
      const chunk = planIdList.slice(i, i + 50)
      const res = await supabaseRest(
        `provider_plans_raw?provider_id=eq.${enc(providerId)}&provider_plan_id=in.(${chunk.map(enc).join(',')})&select=provider_plan_id`,
        { cache: 'no-store' },
      )
      if (!res.ok) continue
      const rows = (await res.json()) as Array<{ provider_plan_id?: string }>
      for (const row of rows) {
        const id = row.provider_plan_id?.trim()
        if (id) keys.add(`${providerId}:${id}`)
      }
    }
  }

  return keys
}

function mappingRawResolvable(
  mapping: PlanMappingRow,
  existingRawIds: Set<string>,
  stableRawKeys: Set<string>,
): boolean {
  const rawId = mapping.provider_plan_raw_id?.trim()
  if (rawId && existingRawIds.has(rawId)) return true

  const providerPlanId = mapping.provider_plan_id?.trim()
  const providerId = mapping.service_provider_id
  if (providerPlanId && providerId && stableRawKeys.has(`${providerId}:${providerPlanId}`)) {
    return true
  }

  return false
}

/**
 * Website eligibility:
 * system_plan.status=ACTIVE AND system_operator.status=ACTIVE
 * AND EXISTS(plan_mappings) AND provider_plan_raw_id can be resolved.
 */
export async function filterWebsiteEligibleSystemPlans<T extends { id: string }>(
  plans: T[],
  systemOperatorId: string,
): Promise<T[]> {
  if (!plans.length || !systemOperatorId) return []

  const operatorRes = await supabaseRest(
    `system_operators?id=eq.${enc(systemOperatorId)}&status=eq.ACTIVE&select=id,status&limit=1`,
    { cache: 'no-store' },
  )
  if (!operatorRes.ok) return []
  const operator = ((await operatorRes.json()) as SystemOperatorRow[])[0]
  if (!operator?.id) return []

  const planIds = plans.map((p) => p.id).filter(Boolean)
  if (!planIds.length) return []

  const mappings = await fetchInChunks<PlanMappingRow>(planIds, (chunk) =>
    `plan_mappings?system_plan_id=in.(${chunk.map(enc).join(',')})&select=id,system_plan_id,service_provider_id,provider_plan_id,provider_plan_raw_id`,
  )

  if (!mappings.length) return []

  const rawIds = mappings
    .map((mapping) => mapping.provider_plan_raw_id)
    .filter((id): id is string => Boolean(id))
  const [existingRawIds, stableRawKeys] = await Promise.all([
    loadExistingRawPlanIds(rawIds),
    loadStableRawPlanKeys(mappings),
  ])

  const mappingsByPlan = new Map<string, PlanMappingRow[]>()
  for (const mapping of mappings) {
    if (!mapping.system_plan_id) continue
    const list = mappingsByPlan.get(mapping.system_plan_id) ?? []
    list.push(mapping)
    mappingsByPlan.set(mapping.system_plan_id, list)
  }

  const eligibleIds = new Set<string>()
  for (const plan of plans) {
    const planMappings = mappingsByPlan.get(plan.id) ?? []
    if (!planMappings.length) continue

    const hasResolvableMapping = planMappings.some((mapping) =>
      mappingRawResolvable(mapping, existingRawIds, stableRawKeys),
    )
    if (hasResolvableMapping) eligibleIds.add(plan.id)
  }

  return plans.filter((plan) => eligibleIds.has(plan.id))
}
