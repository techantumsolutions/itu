import { supabaseRest } from '@/lib/db/supabase-rest'
import { extractPricingFromRaw } from '@/lib/admin/provider-pricing-extractor'
import {
  resolveProviderWholesaleCost,
  resolveRechargeCostDisplay,
} from '@/lib/admin/resolve-provider-wholesale-cost'
import { resolveRawPlanForMapping } from '@/lib/aggregator/plan-mapping-reconciliation'
import { resolveProviderPricingForSystemPlan } from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import type { ProviderPricingDebugMeta } from '@/lib/catalog/provider-pricing-debug'
import { englishPlanDisplayFields, translatePlanTextToEnglish } from '@/lib/catalog/plan-text-english'

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
  /** Authoritative pricing lineage (additive debug — UI unchanged). */
  pricingSource?: ProviderPricingDebugMeta
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

  const english = englishPlanDisplayFields({
    planName: plan.system_plan_name || 'Unnamed Plan',
    benefits: plan.description,
    validity: plan.validity,
  })

  const planMeta = {
    systemPlanId: plan.id,
    systemPlanName: english.planName || 'Unnamed Plan',
    internalPlanId: plan.internal_plan_id ?? null,
    systemPlanPrice: plan.amount ?? null,
    systemPlanCurrency: plan.currency ?? null,
    finalSellingPrice: plan.amount ?? null,
    status: plan.status ?? null,
    description: english.benefits || null,
    validity: english.validity || null,
  }

  const planMappingsRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(systemPlanId)}&select=id,service_provider_id,provider_plan_raw_id,provider_plan_id,matching_score,matching_reason,is_verified`,
    { cache: 'no-store' },
  )
  if (!planMappingsRes.ok) {
    throw new Error(`Failed to load plan mappings: ${await planMappingsRes.text()}`)
  }

  const planMappings = (await planMappingsRes.json()) as PlanMappingRow[]
  const authoritative = await resolveProviderPricingForSystemPlan(systemPlanId)

  if (!planMappings.length || !authoritative?.providers.length) {
    return {
      plan: { ...planMeta, providerCount: 0 },
      providers: [],
      ...planMeta,
    }
  }

  const providerIds = [...new Set(authoritative.providers.map((p) => p.providerId))]
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

  const providers: ProviderCostBreakdownItem[] = await Promise.all(
    authoritative.providers.map(async (auth) => {
      const providerId = auth.providerId
      const providerPlanId = auth.providerPlanId
      const provider = providerMap.get(providerId)

      const rawPlan = (await resolveRawPlanForMapping({
        mappingId: auth.planMappingId ?? '',
        serviceProviderId: providerId,
        providerPlanId,
        providerPlanRawId: auth.providerPlanRawId,
        autoReconnect: true,
      })) as RawPlanRow | null

      const rawData = rawPlan?.raw_json ?? null
      const extractedPricing = extractPricingFromRaw(rawData)

      const wholesaleCost = resolveProviderWholesaleCost(rawPlan)
      const rechargeCostResolved = resolveRechargeCostDisplay(rawPlan)
      const providerPrice = auth.provider_wholesale_amount ?? wholesaleCost.amount
      const providerCostCurrency = auth.provider_wholesale_currency ?? wholesaleCost.currency

      const rawAmount = providerPrice ?? rawPlan?.amount ?? null
      const rawCurrency = providerCostCurrency ?? rawPlan?.currency ?? null
      const rechargeCost = buildRechargeCost({ extractedPricing, rawAmount: rawAmount ?? null })

      const destinationCurrency =
        auth.destination_currency ??
        rawPlan?.destination_currency ??
        (extractedPricing.basePrice != null ? extractedPricing.currency : null) ??
        planMeta.systemPlanCurrency ??
        null

      const rechargeValueCurrency = destinationCurrency
      const rechargeCostCurrency = destinationCurrency ?? providerCostCurrency

      const providerRechargeValue =
        auth.destination_face_value ??
        rawPlan?.destination_amount ??
        extractedPricing.basePrice ??
        extractedPricing.finalPrice ??
        null

      const pricingSource: ProviderPricingDebugMeta = {
        providerName: auth.providerName,
        providerPlanId: auth.providerPlanId,
        providerPlanRawId: auth.providerPlanRawId,
        provider_wholesale_amount: auth.provider_wholesale_amount,
        provider_wholesale_currency: auth.provider_wholesale_currency,
        destination_face_value: auth.destination_face_value,
        destination_currency: auth.destination_currency,
        sourceTable: auth.sourceTable,
        sourceFile: auth.sourceFile,
        sourceQuery: auth.sourceQuery,
        existsInPlanMappings: true,
      }

      return {
        providerId,
        providerName: provider?.name || auth.providerName,
        providerCode: provider?.code ?? auth.providerCode,
        providerPlanId,
        providerPlanName: translatePlanTextToEnglish(rawPlan?.provider_plan_name ?? '') || null,
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
          matchingScore: auth.matchingScore,
          isVerified: auth.isVerified,
        },
        rechargeCost,
        extractedPricing,
        rawPlanAmount: rawAmount,
        rawPlanCurrency: rawCurrency,
        rawPlanName: translatePlanTextToEnglish(rawPlan?.provider_plan_name ?? '') || null,
        rawData,
        pricingSource,
      }
    }),
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
