import { supabaseRest } from '@/lib/db/supabase-rest'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type MappingRow = {
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
  provider_id: string
  provider_plan_id: string
  raw_json?: unknown
  amount?: number | null
  currency?: string | null
  provider_plan_name?: string | null
}

export type ProviderCostBreakdownItem = {
  providerId: string
  providerName: string
  providerCode: string | null
  providerPlanId: string
  mapping: {
    providerPrice: number | null
    providerCurrency: string | null
    margin: number | null
    providerPriority: number | null
    enabled: boolean
  }
  extractedPricing: ReturnType<typeof extractPricingFromRaw>
  rawPlanAmount: number | null
  rawPlanCurrency: string | null
  rawPlanName: string | null
  rawData: unknown
}

export type SystemPlanProviderCostBreakdown = {
  systemPlanId: string
  systemPlanName: string
  internalPlanId: string | null
  systemPlanPrice: number | null
  systemPlanCurrency: string | null
  finalSellingPrice: number | null
  providers: ProviderCostBreakdownItem[]
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
  }>
  const plan = planRows[0]
  if (!plan) return null

  const internalPlanId = plan.internal_plan_id ?? null
  if (!internalPlanId) {
    return {
      systemPlanId: plan.id,
      systemPlanName: plan.system_plan_name || 'Unnamed Plan',
      internalPlanId: null,
      systemPlanPrice: plan.amount ?? null,
      systemPlanCurrency: plan.currency ?? null,
      finalSellingPrice: plan.amount ?? null,
      providers: [],
    }
  }

  const mapRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=id,provider_id,provider_plan_id,provider_price,provider_currency,provider_priority,margin,enabled`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) throw new Error(`Failed to load provider mappings: ${await mapRes.text()}`)

  const mappings = (await mapRes.json()) as MappingRow[]
  const providerIds = [...new Set(mappings.map((m) => m.provider_id).filter(Boolean))]

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

  const rawPlanMap = new Map<string, RawPlanRow>()
  if (providerIds.length > 0) {
    const rawRes = await supabaseRest(
      `provider_plans_raw?provider_id=in.(${providerIds.map(enc).join(',')})&select=provider_id,provider_plan_id,raw_json,amount,currency,provider_plan_name&limit=1000`,
      { cache: 'no-store' },
    )
    if (rawRes.ok) {
      const rawRows = (await rawRes.json()) as RawPlanRow[]
      for (const row of rawRows) {
        rawPlanMap.set(`${row.provider_id}:${row.provider_plan_id}`, row)
      }
    }
  }

  const providers: ProviderCostBreakdownItem[] = mappings.map((mapping) => {
    const provider = providerMap.get(mapping.provider_id)
    const rawKey = `${mapping.provider_id}:${mapping.provider_plan_id}`
    const rawPlan = rawPlanMap.get(rawKey)
    const rawData = rawPlan?.raw_json ?? null
    const extractedPricing = extractPricingFromRaw(rawData)

    if (!extractedPricing.currency && mapping.provider_currency) {
      extractedPricing.currency = mapping.provider_currency
    }
    if (extractedPricing.providerCost == null && mapping.provider_price != null) {
      extractedPricing.providerCost = mapping.provider_price
    }
    if (extractedPricing.margin == null && mapping.margin != null) {
      extractedPricing.margin = mapping.margin
    }
    if (extractedPricing.basePrice == null && rawPlan?.amount != null) {
      extractedPricing.basePrice = rawPlan.amount
    }
    if (!extractedPricing.currency && rawPlan?.currency) {
      extractedPricing.currency = rawPlan.currency
    }

    return {
      providerId: mapping.provider_id,
      providerName: provider?.name || provider?.code || mapping.provider_id,
      providerCode: provider?.code ?? null,
      providerPlanId: mapping.provider_plan_id,
      mapping: {
        providerPrice: mapping.provider_price ?? null,
        providerCurrency: mapping.provider_currency ?? null,
        margin: mapping.margin ?? null,
        providerPriority: mapping.provider_priority ?? null,
        enabled: mapping.enabled !== false,
      },
      extractedPricing,
      rawPlanAmount: rawPlan?.amount ?? null,
      rawPlanCurrency: rawPlan?.currency ?? null,
      rawPlanName: rawPlan?.provider_plan_name ?? null,
      rawData,
    }
  })

  return {
    systemPlanId: plan.id,
    systemPlanName: plan.system_plan_name || 'Unnamed Plan',
    internalPlanId,
    systemPlanPrice: plan.amount ?? null,
    systemPlanCurrency: plan.currency ?? null,
    finalSellingPrice: plan.amount ?? null,
    providers,
  }
}
