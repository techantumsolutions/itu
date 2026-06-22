import { supabaseRest } from '@/lib/db/supabase-rest'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
import {
  resolveProviderWholesaleCost,
  resolveRechargeCostDisplay,
} from '@/lib/admin/resolve-provider-wholesale-cost'
import { resolveRawPlanForMapping } from '@/lib/aggregator/plan-mapping-reconciliation'

function enc(v: string): string {
  return encodeURIComponent(v)
}

type PlanMappingRow = {
  id: string
  service_provider_id: string
  provider_plan_raw_id?: string | null
  provider_plan_id?: string | null
  matching_score?: number | null
  is_verified?: boolean | null
}

type ProviderRow = {
  id: string
  code?: string
  name?: string
  is_active?: boolean | null
  priority?: number | null
}

type RawPlanRow = {
  id: string
  provider_id: string
  provider_plan_id: string
  raw_json?: unknown
  amount?: number | null
  currency?: string | null
  destination_amount?: number | null
  destination_currency?: string | null
  provider_plan_name?: string | null
}

export type ProviderRechargeCost = {
  providerCost: number | null
  fees: number | null
  gatewayCharge: number | null
  surcharge: number | null
  tax: number | null
  totalRechargeCost: number | null
  /** Fees, tax, and surcharges in destination / country currency (excludes wholesale provider cost). */
  totalLocalRechargeCost: number | null
}

export type ProviderCostBreakdownItem = {
  providerId: string
  providerName: string
  providerCode: string | null
  providerPlanId: string
  providerPlanName: string | null
  providerRechargeValue: number | null
  /** Face value / destination currency (country currency, e.g. INR). */
  rechargeValueCurrency: string | null
  /** Wholesale / send currency ITU pays the provider (e.g. EUR). */
  providerCostCurrency: string | null
  /** Country currency for fees, tax, and total recharge cost. */
  rechargeCostCurrency: string | null
  /** Display-only recharge cost (fallback chain). */
  rechargeCostDisplay: string
  mapping: {
    providerPrice: number | null
    providerCurrency: string | null
    providerCostDisplay: string
    margin: number | null
    providerPriority: number | null
    enabled: boolean
    sellingPrice: number | null
    matchingScore: number | null
    isVerified: boolean
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
    description: string | null
    validity: string | null
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
  rawAmount: number | null
}): ProviderRechargeCost {
  const providerCost = input.extractedPricing.providerCost ?? input.rawAmount ?? null
  const fees = input.extractedPricing.fee ?? null
  const gatewayCharge = input.extractedPricing.platformMarkup ?? null
  const surcharge = input.extractedPricing.markup ?? null
  const tax = input.extractedPricing.tax ?? null
  const localParts = [fees, gatewayCharge, surcharge, tax]
  const totalLocalRechargeCost = sumNumbers(localParts)
  const totalRechargeCost = sumNumbers([providerCost, ...localParts])

  return {
    providerCost,
    fees,
    gatewayCharge,
    surcharge,
    tax,
    totalRechargeCost,
    totalLocalRechargeCost,
  }
}

/** Provider comparison for one system plan using stable provider_plan_id keys. */
export async function loadSystemPlanProviderCostBreakdown(
  systemPlanId: string,
): Promise<SystemPlanProviderCostBreakdown | null> {
  const planRes = await supabaseRest(
    `system_plans?id=eq.${enc(systemPlanId)}&select=id,internal_plan_id,system_plan_name,description,validity,amount,currency,status&limit=1`,
    { cache: 'no-store' },
  )
  if (!planRes.ok) throw new Error(`Failed to load system plan: ${await planRes.text()}`)

  const planRows = (await planRes.json()) as Array<{
    id: string
    internal_plan_id?: string | null
    system_plan_name?: string
    description?: string | null
    validity?: string | null
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
    description: plan.description?.trim() || null,
    validity: plan.validity?.trim() || null,
  }

  const planMappingsRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(systemPlanId)}&select=id,service_provider_id,provider_plan_raw_id,provider_plan_id,matching_score,matching_reason,is_verified`,
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

  type ResolvedMapping = {
    providerId: string
    providerPlanId: string
    rawPlan: RawPlanRow | null
    matchingScore: number | null
    isVerified: boolean
  }

  const resolvedMappings: ResolvedMapping[] = []
  for (const mapping of planMappings) {
    const providerId = mapping.service_provider_id
    const providerPlanId = mapping.provider_plan_id?.trim() || ''
    if (!providerId || !providerPlanId) continue

    const rawPlan = (await resolveRawPlanForMapping({
      mappingId: mapping.id,
      serviceProviderId: providerId,
      providerPlanId,
      providerPlanRawId: mapping.provider_plan_raw_id,
      autoReconnect: true,
    })) as RawPlanRow | null

    resolvedMappings.push({
      providerId,
      providerPlanId,
      rawPlan,
      matchingScore: mapping.matching_score ?? null,
      isVerified: mapping.is_verified === true,
    })
  }

  const uniquePairs = new Map<string, ResolvedMapping>()
  for (const row of resolvedMappings) {
    uniquePairs.set(`${row.providerId}:${row.providerPlanId}`, row)
  }

  const providerIds = [...new Set([...uniquePairs.values()].map((p) => p.providerId))]
  const providerMap = new Map<string, ProviderRow>()
  if (providerIds.length > 0) {
    const providersRes = await supabaseRest(
      `lcr_providers?id=in.(${providerIds.map(enc).join(',')})&select=id,code,name,is_active,priority&limit=${providerIds.length}`,
      { cache: 'no-store' },
    )
    if (providersRes.ok) {
      const providerRows = (await providersRes.json()) as ProviderRow[]
      for (const row of providerRows) {
        if (row.id) providerMap.set(row.id, row)
      }
    }
  }

  const providers: ProviderCostBreakdownItem[] = [...uniquePairs.values()].map(
    ({ providerId, providerPlanId, rawPlan, matchingScore, isVerified }) => {
      const provider = providerMap.get(providerId)
      const rawData = rawPlan?.raw_json ?? null
      const extractedPricing = extractPricingFromRaw(rawData)

      const wholesaleCost = resolveProviderWholesaleCost(rawPlan)
      const rechargeCostResolved = resolveRechargeCostDisplay(rawPlan)
      const providerPrice = wholesaleCost.amount
      const providerCostCurrency = wholesaleCost.currency

      const wholesale = resolveWholesalePricing({
        rawJson: rawData,
        amount: rawPlan?.amount ?? null,
        currency: rawPlan?.currency ?? null,
        destinationAmount: rawPlan?.destination_amount ?? null,
        destinationCurrency: rawPlan?.destination_currency ?? null,
      })

      const rawAmount = providerPrice ?? wholesale.wholesaleAmount ?? rawPlan?.amount ?? null
      const rawCurrency = providerCostCurrency ?? wholesale.wholesaleCurrency ?? rawPlan?.currency ?? null
      const rechargeCost = buildRechargeCost({ extractedPricing, rawAmount: rawAmount ?? null })

      const destinationCurrency =
        wholesale.destinationCurrency ??
        rawPlan?.destination_currency ??
        (extractedPricing.basePrice != null ? extractedPricing.currency : null) ??
        planMeta.systemPlanCurrency ??
        null

      const rechargeValueCurrency = destinationCurrency
      const rechargeCostCurrency = destinationCurrency ?? providerCostCurrency

      const providerRechargeValue =
        wholesale.destinationAmount ??
        rawPlan?.destination_amount ??
        extractedPricing.basePrice ??
        extractedPricing.finalPrice ??
        null

      return {
        providerId,
        providerName: provider?.name || provider?.code || providerId,
        providerCode: provider?.code ?? null,
        providerPlanId,
        providerPlanName: rawPlan?.provider_plan_name ?? null,
        providerRechargeValue,
        rechargeValueCurrency,
        providerCostCurrency,
        rechargeCostCurrency,
        rechargeCostDisplay: rechargeCostResolved.display,
        mapping: {
          providerPrice,
          providerCurrency: providerCostCurrency,
          providerCostDisplay: wholesaleCost.display,
          margin: extractedPricing.margin ?? null,
          providerPriority: provider?.priority ?? null,
          enabled: provider?.is_active !== false,
          sellingPrice: extractedPricing.finalPrice ?? providerPrice,
          matchingScore,
          isVerified,
        },
        rechargeCost,
        extractedPricing,
        rawPlanAmount: rawAmount,
        rawPlanCurrency: rawCurrency,
        rawPlanName: rawPlan?.provider_plan_name ?? null,
        rawData,
      }
    },
  )

  providers.sort((a, b) => {
    const priorityA = a.mapping.providerPriority ?? 9999
    const priorityB = b.mapping.providerPriority ?? 9999
    if (priorityA !== priorityB) return priorityA - priorityB
    return a.providerName.localeCompare(b.providerName)
  })

  const activeProviderCount = new Set(
    planMappings
      .filter((m) => m.service_provider_id && m.provider_plan_id?.trim())
      .map((m) => m.service_provider_id),
  ).size

  return {
    plan: {
      ...planMeta,
      providerCount: activeProviderCount,
    },
    providers,
    ...planMeta,
  }
}
