import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
import { dbUpsertInternalPlanMapping } from '@/lib/uti/repository'
import { aggListProviders } from '@/lib/aggregator/repository'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type ProviderRawPlanSnapshot = {
  id: string
  provider_id: string
  provider_plan_id: string
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  raw_json?: unknown
  provider_plan_name?: string | null
}

export type PlanMappingRepairStats = {
  mappingsProcessed: number
  staleRawIdsFixed: number
  missingMappings: number
  pricingSynced: number
  availabilityUpdated: number
}

export type Step7SyncHealth = {
  totalSystemPlans: number
  activeSystemPlans: number
  mappedSystemPlans: number
  healthySystemPlans: number
  healthRatio: number
  status: 'OK' | 'WARNING'
}

const RAW_PLAN_SELECT =
  'id,provider_id,provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json,provider_plan_name,fetched_at'

async function fetchAllPaginated<T>(buildUrl: (offset: number, limit: number) => string): Promise<T[]> {
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

/** Latest provider_plans_raw row per provider_plan_id for one provider. */
export async function buildProviderRawPlanIndex(
  providerId: string,
): Promise<Map<string, ProviderRawPlanSnapshot>> {
  const rows = await fetchAllPaginated<ProviderRawPlanSnapshot>((offset, limit) =>
    `provider_plans_raw?provider_id=eq.${enc(providerId)}&select=${RAW_PLAN_SELECT}&order=fetched_at.desc&limit=${limit}&offset=${offset}`,
  )

  const index = new Map<string, ProviderRawPlanSnapshot>()
  for (const row of rows) {
    const planId = row.provider_plan_id?.trim()
    if (!planId || index.has(planId)) continue
    index.set(planId, row)
  }
  return index
}

export function resolveLatestRawPlan(
  providerId: string,
  providerPlanId: string,
  index: Map<string, ProviderRawPlanSnapshot>,
): ProviderRawPlanSnapshot | null {
  const key = providerPlanId?.trim()
  if (!key) return null
  const row = index.get(key)
  if (!row?.id) return null
  if (row.provider_id && row.provider_id !== providerId) return null
  return row
}

type PlanMappingRow = {
  id: string
  system_plan_id: string
  service_provider_id: string
  provider_plan_id?: string | null
  provider_plan_raw_id?: string | null
}

async function loadSystemPlanContext(systemPlanId: string): Promise<{
  internalPlanId: string | null
  amount: number | null
  currency: string | null
} | null> {
  const res = await supabaseRest(
    `system_plans?id=eq.${enc(systemPlanId)}&select=internal_plan_id,amount,currency&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const row = ((await res.json()) as Array<{
    internal_plan_id?: string | null
    amount?: number | null
    currency?: string | null
  }>)[0]
  if (!row) return null
  return {
    internalPlanId: row.internal_plan_id ?? null,
    amount: row.amount ?? null,
    currency: row.currency ?? null,
  }
}

/** Sync pricing + availability from stable provider_plan_id → latest raw row. */
export async function syncPlanMappingPricingAndAvailability(input: {
  serviceProviderId: string
  systemPlanId: string
  providerPlanId: string
  rawPlan: ProviderRawPlanSnapshot
  providerPriority?: number
  providerActive?: boolean
}): Promise<boolean> {
  const wholesale = resolveWholesalePricing({
    rawJson: input.rawPlan.raw_json,
    amount: input.rawPlan.amount ?? null,
    currency: input.rawPlan.currency ?? null,
    destinationAmount: input.rawPlan.destination_amount ?? null,
    destinationCurrency: input.rawPlan.destination_currency ?? null,
  })

  const providerPrice = wholesale.wholesaleAmount ?? input.rawPlan.amount ?? 0
  const providerCurrency = wholesale.wholesaleCurrency ?? input.rawPlan.currency ?? 'USD'
  const enabled = input.providerActive !== false

  const systemPlan = await loadSystemPlanContext(input.systemPlanId)
  if (systemPlan?.internalPlanId) {
    await dbUpsertInternalPlanMapping({
      internalPlanId: systemPlan.internalPlanId,
      providerId: input.serviceProviderId,
      providerPlanId: input.providerPlanId,
      providerPrice,
      providerCurrency,
      providerPriority: input.providerPriority ?? 100,
      margin: 0,
      enabled,
    }).catch((err) => {
      console.warn(
        `[Step7 Reconciliation] internal_plan_provider_mapping sync failed for ${input.providerPlanId}:`,
        err,
      )
    })
  }

  if (wholesale.wholesaleAmount != null || wholesale.wholesaleCurrency) {
    await supabaseRest(`system_plans?id=eq.${enc(input.systemPlanId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        amount: wholesale.wholesaleAmount ?? systemPlan?.amount ?? null,
        currency: wholesale.wholesaleCurrency ?? systemPlan?.currency ?? null,
      }),
    }).catch(() => {})
  }

  return true
}

export async function reconcileSinglePlanMapping(input: {
  mapping: PlanMappingRow
  rawIndex: Map<string, ProviderRawPlanSnapshot>
  providerPriority?: number
  providerActive?: boolean
}): Promise<'repaired' | 'synced' | 'missing' | 'unchanged'> {
  const providerPlanId = input.mapping.provider_plan_id?.trim()
  if (!providerPlanId) return 'missing'

  const freshRaw = resolveLatestRawPlan(
    input.mapping.service_provider_id,
    providerPlanId,
    input.rawIndex,
  )
  if (!freshRaw) return 'missing'

  const currentRawId = input.mapping.provider_plan_raw_id
  const needsRawRepair = !currentRawId || currentRawId !== freshRaw.id

  if (needsRawRepair) {
    const patchRes = await supabaseRest(`plan_mappings?id=eq.${enc(input.mapping.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        provider_plan_raw_id: freshRaw.id,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!patchRes.ok) return 'missing'
  }

  await syncPlanMappingPricingAndAvailability({
    serviceProviderId: input.mapping.service_provider_id,
    systemPlanId: input.mapping.system_plan_id,
    providerPlanId,
    rawPlan: freshRaw,
    providerPriority: input.providerPriority,
    providerActive: input.providerActive,
  })

  if (needsRawRepair) return 'repaired'
  return 'synced'
}

/** Reconcile every plan_mapping for one provider using stable provider_plan_id keys. */
export async function reconcilePlanMappingsForProvider(input: {
  providerId: string
  providerPriority?: number
  providerActive?: boolean
  rawIndex?: Map<string, ProviderRawPlanSnapshot>
}): Promise<PlanMappingRepairStats> {
  const stats: PlanMappingRepairStats = {
    mappingsProcessed: 0,
    staleRawIdsFixed: 0,
    missingMappings: 0,
    pricingSynced: 0,
    availabilityUpdated: 0,
  }

  const rawIndex = input.rawIndex ?? (await buildProviderRawPlanIndex(input.providerId))
  const mappings = await fetchAllPaginated<PlanMappingRow>((offset, limit) =>
    `plan_mappings?service_provider_id=eq.${enc(input.providerId)}&select=id,system_plan_id,service_provider_id,provider_plan_id,provider_plan_raw_id&limit=${limit}&offset=${offset}`,
  )

  for (const mapping of mappings) {
    stats.mappingsProcessed++
    const outcome = await reconcileSinglePlanMapping({
      mapping,
      rawIndex,
      providerPriority: input.providerPriority,
      providerActive: input.providerActive,
    })

    if (outcome === 'missing') stats.missingMappings++
    else if (outcome === 'repaired') {
      stats.staleRawIdsFixed++
      stats.pricingSynced++
      stats.availabilityUpdated++
    } else if (outcome === 'synced') {
      stats.pricingSynced++
      stats.availabilityUpdated++
    }
  }

  return stats
}

/** Reconcile mappings for every ACTIVE system plan (all providers). */
export async function reconcileAllActiveSystemPlanMappings(): Promise<PlanMappingRepairStats> {
  const totals: PlanMappingRepairStats = {
    mappingsProcessed: 0,
    staleRawIdsFixed: 0,
    missingMappings: 0,
    pricingSynced: 0,
    availabilityUpdated: 0,
  }

  const activePlans = await fetchAllPaginated<{ id: string }>((offset, limit) =>
    `system_plans?status=eq.ACTIVE&select=id&limit=${limit}&offset=${offset}`,
  )
  if (!activePlans.length) return totals

  const providers = await aggListProviders()
  const providerMeta = new Map(
    providers.map((p) => [p.id, { priority: p.priority ?? 100, active: p.is_active !== false }]),
  )
  const rawIndexByProvider = new Map<string, Map<string, ProviderRawPlanSnapshot>>()

  for (let i = 0; i < activePlans.length; i += 100) {
    const chunk = activePlans.slice(i, i + 100)
    const res = await supabaseRest(
      `plan_mappings?system_plan_id=in.(${chunk.map((p) => enc(p.id)).join(',')})&select=id,system_plan_id,service_provider_id,provider_plan_id,provider_plan_raw_id&limit=10000`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue

    const mappings = (await res.json()) as PlanMappingRow[]
    for (const mapping of mappings) {
      totals.mappingsProcessed++
      const providerId = mapping.service_provider_id
      if (!providerId) {
        totals.missingMappings++
        continue
      }

      let rawIndex = rawIndexByProvider.get(providerId)
      if (!rawIndex) {
        rawIndex = await buildProviderRawPlanIndex(providerId)
        rawIndexByProvider.set(providerId, rawIndex)
      }

      const meta = providerMeta.get(providerId)
      const outcome = await reconcileSinglePlanMapping({
        mapping,
        rawIndex,
        providerPriority: meta?.priority,
        providerActive: meta?.active,
      })

      if (outcome === 'missing') totals.missingMappings++
      else if (outcome === 'repaired') {
        totals.staleRawIdsFixed++
        totals.pricingSynced++
        totals.availabilityUpdated++
      } else if (outcome === 'synced') {
        totals.pricingSynced++
        totals.availabilityUpdated++
      }
    }
  }

  return totals
}

export async function reconcilePlanMappingsForAllActiveProviders(): Promise<{
  byProvider: Record<string, PlanMappingRepairStats>
  totals: PlanMappingRepairStats
}> {
  const providers = await aggListProviders()
  const byProvider: Record<string, PlanMappingRepairStats> = {}
  const totals: PlanMappingRepairStats = {
    mappingsProcessed: 0,
    staleRawIdsFixed: 0,
    missingMappings: 0,
    pricingSynced: 0,
    availabilityUpdated: 0,
  }

  for (const provider of providers) {
    if (provider.is_active === false) continue

    const stats = await reconcilePlanMappingsForProvider({
      providerId: provider.id,
      providerPriority: provider.priority ?? 100,
      providerActive: true,
    })
    byProvider[provider.id] = stats

    totals.mappingsProcessed += stats.mappingsProcessed
    totals.staleRawIdsFixed += stats.staleRawIdsFixed
    totals.missingMappings += stats.missingMappings
    totals.pricingSynced += stats.pricingSynced
    totals.availabilityUpdated += stats.availabilityUpdated
  }

  return { byProvider, totals }
}

export async function calculateStep7SyncHealth(): Promise<Step7SyncHealth> {
  const activePlans = await fetchAllPaginated<{ id: string }>((offset, limit) =>
    `system_plans?status=eq.ACTIVE&select=id&limit=${limit}&offset=${offset}`,
  )
  const activePlanIds = new Set(activePlans.map((p) => p.id))

  const allPlansRes = await supabaseRest('system_plans?select=id&limit=1', {
    cache: 'no-store',
    headers: { Prefer: 'count=exact' },
  })
  const parseCount = (res: Response): number => {
    const range = res.headers.get('content-range')
    if (!range) return 0
    const total = range.split('/')[1]
    return total ? Number(total) : 0
  }

  const mappings = await fetchAllPaginated<{
    system_plan_id: string
    provider_plan_raw_id?: string | null
  }>((offset, limit) =>
    `plan_mappings?select=system_plan_id,provider_plan_raw_id&limit=${limit}&offset=${offset}`,
  )

  const mappedPlans = new Set<string>()
  const healthyPlans = new Set<string>()

  for (const row of mappings) {
    if (!activePlanIds.has(row.system_plan_id)) continue
    mappedPlans.add(row.system_plan_id)
    if (row.provider_plan_raw_id) healthyPlans.add(row.system_plan_id)
  }

  const totalSystemPlans = allPlansRes.ok ? parseCount(allPlansRes) : activePlans.length
  const activeSystemPlans = activePlans.length
  const mappedSystemPlans = mappedPlans.size
  const healthySystemPlans = healthyPlans.size
  const healthRatio = activeSystemPlans > 0 ? healthySystemPlans / activeSystemPlans : 1

  return {
    totalSystemPlans,
    activeSystemPlans,
    mappedSystemPlans,
    healthySystemPlans,
    healthRatio,
    status: healthRatio < 0.95 ? 'WARNING' : 'OK',
  }
}

/** Resolve raw plan for admin display; optionally reconnect stale mapping. */
export async function resolveRawPlanForMapping(input: {
  mappingId?: string
  serviceProviderId: string
  providerPlanId: string
  providerPlanRawId?: string | null
  autoReconnect?: boolean
}): Promise<ProviderRawPlanSnapshot | null> {
  const providerPlanId = input.providerPlanId?.trim()
  if (!providerPlanId) return null

  if (input.providerPlanRawId) {
    const byIdRes = await supabaseRest(
      `provider_plans_raw?id=eq.${enc(input.providerPlanRawId)}&select=${RAW_PLAN_SELECT}&limit=1`,
      { cache: 'no-store' },
    )
    if (byIdRes.ok) {
      const row = ((await byIdRes.json()) as ProviderRawPlanSnapshot[])[0]
      if (row?.id && row.provider_plan_id?.trim() === providerPlanId) return row
    }
  }

  const stableRes = await supabaseRest(
    `provider_plans_raw?provider_id=eq.${enc(input.serviceProviderId)}&provider_plan_id=eq.${enc(providerPlanId)}&select=${RAW_PLAN_SELECT}&order=fetched_at.desc&limit=1`,
    { cache: 'no-store' },
  )
  if (!stableRes.ok) return null
  const fresh = ((await stableRes.json()) as ProviderRawPlanSnapshot[])[0]
  if (!fresh?.id) return null

  if (
    input.autoReconnect &&
    input.mappingId &&
    input.providerPlanRawId !== fresh.id
  ) {
    await supabaseRest(`plan_mappings?id=eq.${enc(input.mappingId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        provider_plan_raw_id: fresh.id,
        updated_at: new Date().toISOString(),
      }),
    }).catch(() => {})
  }

  return fresh
}
