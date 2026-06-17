import { supabaseRest } from '@/lib/db/supabase-rest'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type PlanMappingRow = {
  service_provider_id: string
  provider_plan_raw_id?: string | null
  provider_plan_id?: string | null
  matching_score?: number | null
  is_verified?: boolean | null
}

type InternalMappingRow = {
  id: string
  provider_id: string
  provider_plan_id: string
  provider_price: number | null
  provider_currency: string | null
  provider_priority: number | null
  margin: number | null
  enabled: boolean | null
}

type ProviderRow = {
  id: string
  code?: string
  name?: string
}

type RawPlanRow = {
  id?: string
  provider_id: string
  provider_plan_id: string
  raw_json?: unknown
  amount?: number | null
  currency?: string | null
  provider_plan_name?: string | null
}

export type ProviderRechargeCost = {
  providerCost: number | null
  fees: number | null
  gatewayCharge: number | null
  surcharge: number | null
  tax: number | null
  totalRechargeCost: number | null
}

export type ProviderCostBreakdownItem = {
  providerId: string
  providerName: string
  providerCode: string | null
  providerPlanId: string
  providerPlanName: string | null
  providerRechargeValue: number | null
  mapping: {
    providerPrice: number | null
    providerCurrency: string | null
    margin: number | null
    providerPriority: number | null
    enabled: boolean
    sellingPrice: number | null
  }
  rechargeCost: ProviderRechargeCost
  extractedPricing: ReturnType<typeof extractPricingFromRaw>
  rawPlanAmount: number | null
  rawPlanCurrency: string | null
  rawPlanName: string | null
  rawData: unknown
}

export type SystemPlanProviderCostBreakdown = {
  plan: {
    systemPlanId: string
    systemPlanName: string
    internalPlanId: string | null
    systemPlanPrice: number | null
    systemPlanCurrency: string | null
    finalSellingPrice: number | null
    status: string | null
    providerCount: number
  }
  providers: ProviderCostBreakdownItem[]
  /** @deprecated Use `plan` — kept for backward compatibility */
  systemPlanId: string
  systemPlanName: string
  internalPlanId: string | null
  systemPlanPrice: number | null
  systemPlanCurrency: string | null
  finalSellingPrice: number | null
}

function sumNumbers(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((sum, n) => sum + n, 0)
}

function buildRechargeCost(input: {
  extractedPricing: ReturnType<typeof extractPricingFromRaw>
  mappingPrice: number | null
}): ProviderRechargeCost {
  const providerCost = input.extractedPricing.providerCost ?? input.mappingPrice ?? null
  const fees = input.extractedPricing.fee ?? null
  const gatewayCharge = input.extractedPricing.platformMarkup ?? null
  const surcharge = input.extractedPricing.markup ?? null
  const tax = input.extractedPricing.tax ?? null
  const totalRechargeCost = sumNumbers([providerCost, fees, gatewayCharge, surcharge, tax])

  return {
    providerCost,
    fees,
    gatewayCharge,
    surcharge,
    tax,
    totalRechargeCost,
  }
}

function buildInternalMappingOrFilter(pairs: Array<{ providerId: string; providerPlanId: string }>): string | null {
  const clauses = pairs
    .filter((p) => p.providerId && p.providerPlanId)
    .map((p) => `and(provider_id.eq.${enc(p.providerId)},provider_plan_id.eq.${enc(p.providerPlanId)})`)
  if (!clauses.length) return null
  return `or=(${clauses.join(',')})`
}

export async function loadSystemPlanProviderCostBreakdown(
  systemPlanId: string,
): Promise<SystemPlanProviderCostBreakdown | null> {
  const planRes = await supabaseRest(
    `system_plans?id=eq.${enc(systemPlanId)}&select=id,internal_plan_id,system_plan_name,amount,currency,status&limit=1`,
    { cache: 'no-store' },
  )
  if (!planRes.ok) throw new Error(`Failed to load system plan: ${await planRes.text()}`)

  const planRows = (await planRes.json()) as Array<{
    id: string
    internal_plan_id?: string | null
    system_plan_name?: string
    amount?: number | null
    currency?: string | null
    status?: string | null
  }>
  const plan = planRows[0]
  if (!plan) return null

  const planMeta = {
    systemPlanId: plan.id,
    systemPlanName: plan.system_plan_name || 'Unnamed Plan',
    internalPlanId: plan.internal_plan_id ?? null,
    systemPlanPrice: plan.amount ?? null,
    systemPlanCurrency: plan.currency ?? null,
    finalSellingPrice: plan.amount ?? null,
    status: plan.status ?? null,
  }

  const planMappingsRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(systemPlanId)}&select=service_provider_id,provider_plan_raw_id,provider_plan_id,matching_score,matching_reason,is_verified`,
    { cache: 'no-store' },
  )
  if (!planMappingsRes.ok) {
    throw new Error(`Failed to load plan mappings: ${await planMappingsRes.text()}`)
  }

  const planMappings = (await planMappingsRes.json()) as PlanMappingRow[]
  if (!planMappings.length) {
    return {
      plan: { ...planMeta, providerCount: 0 },
      providers: [],
      ...planMeta,
    }
  }

  const rawIds = [
    ...new Set(planMappings.map((m) => m.provider_plan_raw_id).filter((id): id is string => Boolean(id))),
  ]

  const rawById = new Map<string, RawPlanRow>()
  const rawByKey = new Map<string, RawPlanRow>()
  if (rawIds.length > 0) {
    const rawRes = await supabaseRest(
      `provider_plans_raw?id=in.(${rawIds.map(enc).join(',')})&select=id,provider_id,provider_plan_id,raw_json,amount,currency,provider_plan_name`,
      { cache: 'no-store' },
    )
    if (rawRes.ok) {
      const rawRows = (await rawRes.json()) as RawPlanRow[]
      for (const row of rawRows) {
        if (row.id) rawById.set(row.id, row)
        rawByKey.set(`${row.provider_id}:${row.provider_plan_id}`, row)
      }
    }
  }

  const resolvedMappings = planMappings
    .map((mapping) => {
      const rawPlan = mapping.provider_plan_raw_id ? rawById.get(mapping.provider_plan_raw_id) : undefined
      const providerId = mapping.service_provider_id
      const providerPlanId =
        mapping.provider_plan_id?.trim() ||
        rawPlan?.provider_plan_id?.trim() ||
        ''
      if (!providerId || !providerPlanId) return null
      return {
        providerId,
        providerPlanId,
        rawPlan: rawPlan ?? rawByKey.get(`${providerId}:${providerPlanId}`) ?? null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))

  const uniquePairs = new Map<string, { providerId: string; providerPlanId: string; rawPlan: RawPlanRow | null }>()
  for (const row of resolvedMappings) {
    uniquePairs.set(`${row.providerId}:${row.providerPlanId}`, row)
  }

  const internalMap = new Map<string, InternalMappingRow>()
  const pairList = [...uniquePairs.values()]
  const orFilter = buildInternalMappingOrFilter(pairList)
  if (orFilter) {
    const internalRes = await supabaseRest(
      `internal_plan_provider_mapping?${orFilter}&select=id,provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin,enabled`,
      { cache: 'no-store' },
    )
    if (internalRes.ok) {
      const internalRows = (await internalRes.json()) as InternalMappingRow[]
      for (const row of internalRows) {
        internalMap.set(`${row.provider_id}:${row.provider_plan_id}`, row)
      }
    }
  }

  const providerIds = [...new Set(pairList.map((p) => p.providerId))]
  const providerMap = new Map<string, ProviderRow>()
  if (providerIds.length > 0) {
    const providersRes = await supabaseRest(
      `lcr_providers?id=in.(${providerIds.map(enc).join(',')})&select=id,code,name&limit=${providerIds.length}`,
      { cache: 'no-store' },
    )
    if (providersRes.ok) {
      const providerRows = (await providersRes.json()) as ProviderRow[]
      for (const row of providerRows) {
        if (row.id) providerMap.set(row.id, row)
      }
    }
  }

  const providers: ProviderCostBreakdownItem[] = pairList.map(({ providerId, providerPlanId, rawPlan }) => {
    const internalMapping = internalMap.get(`${providerId}:${providerPlanId}`)
    const provider = providerMap.get(providerId)
    const rawData = rawPlan?.raw_json ?? null
    const extractedPricing = extractPricingFromRaw(rawData)

    if (!extractedPricing.currency && internalMapping?.provider_currency) {
      extractedPricing.currency = internalMapping.provider_currency
    }
    if (extractedPricing.providerCost == null && internalMapping?.provider_price != null) {
      extractedPricing.providerCost = internalMapping.provider_price
    }
    if (extractedPricing.margin == null && internalMapping?.margin != null) {
      extractedPricing.margin = internalMapping.margin
    }
    if (extractedPricing.basePrice == null && rawPlan?.amount != null) {
      extractedPricing.basePrice = rawPlan.amount
    }
    if (!extractedPricing.currency && rawPlan?.currency) {
      extractedPricing.currency = rawPlan.currency
    }

    const mappingPrice = internalMapping?.provider_price ?? null
    const mappingCurrency = internalMapping?.provider_currency ?? null
    const rechargeCost = buildRechargeCost({ extractedPricing, mappingPrice })
    const providerRechargeValue =
      rawPlan?.amount ??
      extractedPricing.basePrice ??
      extractedPricing.finalPrice ??
      mappingPrice

    return {
      providerId,
      providerName: provider?.name || provider?.code || providerId,
      providerCode: provider?.code ?? null,
      providerPlanId,
      providerPlanName: rawPlan?.provider_plan_name ?? null,
      providerRechargeValue,
      mapping: {
        providerPrice: mappingPrice,
        providerCurrency: mappingCurrency,
        margin: internalMapping?.margin ?? null,
        providerPriority: internalMapping?.provider_priority ?? null,
        enabled: internalMapping?.enabled !== false,
        sellingPrice: extractedPricing.finalPrice ?? mappingPrice,
      },
      rechargeCost,
      extractedPricing,
      rawPlanAmount: rawPlan?.amount ?? null,
      rawPlanCurrency: rawPlan?.currency ?? null,
      rawPlanName: rawPlan?.provider_plan_name ?? null,
      rawData,
    }
  })

  providers.sort((a, b) => {
    const priorityA = a.mapping.providerPriority ?? 9999
    const priorityB = b.mapping.providerPriority ?? 9999
    if (priorityA !== priorityB) return priorityA - priorityB
    return a.providerName.localeCompare(b.providerName)
  })

  return {
    plan: {
      ...planMeta,
      providerCount: new Set(providers.map((p) => p.providerId)).size,
    },
    providers,
    ...planMeta,
  }
}
