/**
 * Authoritative admin + runtime provider pricing.
 *
 * Single source chain (no independent page-level calculations):
 *   plan_mappings → provider_plans_raw → resolveWholesalePricing()
 *
 * internal_plan_provider_mapping is NOT a pricing source — only routing eligibility metadata.
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
import { resolveRawPlanForMapping } from '@/lib/aggregator/plan-mapping-reconciliation'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export const AUTHORITATIVE_PRICING_SOURCE_FILE =
  'lib/catalog/resolve-provider-pricing-for-system-plan.ts'

export const AUTHORITATIVE_PRICING_SOURCE_QUERY =
  'plan_mappings?system_plan_id=eq.{id} → provider_plans_raw → resolveWholesalePricing()'

export type AuthoritativeProviderPricingRow = {
  providerId: string
  providerName: string
  providerCode: string | null
  providerPlanId: string
  providerPlanRawId: string | null
  planMappingId: string | null
  systemPlanId: string
  internalPlanId: string | null
  provider_wholesale_amount: number | null
  provider_wholesale_currency: string | null
  destination_face_value: number | null
  destination_currency: string | null
  matchingScore: number | null
  isVerified: boolean
  existsInPlanMappings: true
  sourceTable: 'plan_mappings+provider_plans_raw'
  sourceFile: string
  sourceQuery: string
}

export type SystemPlanPricingResolution = {
  systemPlanId: string
  internalPlanId: string | null
  systemPlanName: string | null
  providers: AuthoritativeProviderPricingRow[]
  byProviderId: Map<string, AuthoritativeProviderPricingRow>
  byKey: Map<string, AuthoritativeProviderPricingRow>
}

export function authoritativePricingKey(providerId: string, providerPlanId: string): string {
  return `${providerId}:${providerPlanId}`
}

async function loadSystemPlanMeta(systemPlanId: string) {
  const res = await supabaseRest(
    `system_plans?id=eq.${enc(systemPlanId)}&select=id,internal_plan_id,system_plan_name&limit=1`,
    { cache: 'no-store' },
  )
  if (!res.ok) return null
  const rows = (await res.json()) as Array<{
    id: string
    internal_plan_id?: string | null
    system_plan_name?: string | null
  }>
  return rows[0] ?? null
}

async function loadProviderMeta(providerIds: string[]) {
  const map = new Map<string, { name: string; code: string | null }>()
  if (!providerIds.length) return map
  const res = await supabaseRest(
    `lcr_providers?id=in.(${providerIds.map(enc).join(',')})&select=id,code,name`,
    { cache: 'no-store' },
  )
  if (!res.ok) return map
  const rows = (await res.json()) as Array<{ id: string; code?: string; name?: string }>
  for (const row of rows) {
    if (row.id) {
      map.set(row.id, { name: row.name || row.code || row.id, code: row.code ?? null })
    }
  }
  return map
}

/** Authoritative provider pricing for one system plan (plan_mappings → provider_plans_raw only). */
export async function resolveProviderPricingForSystemPlan(
  systemPlanId: string,
): Promise<SystemPlanPricingResolution | null> {
  const plan = await loadSystemPlanMeta(systemPlanId)
  if (!plan) return null

  const mapRes = await supabaseRest(
    `plan_mappings?system_plan_id=eq.${enc(systemPlanId)}&select=id,service_provider_id,provider_plan_raw_id,provider_plan_id,matching_score,is_verified`,
    { cache: 'no-store' },
  )
  if (!mapRes.ok) {
    throw new Error(`Failed to load plan_mappings: ${await mapRes.text()}`)
  }

  const planMappings = (await mapRes.json()) as Array<{
    id: string
    service_provider_id: string
    provider_plan_raw_id?: string | null
    provider_plan_id?: string | null
    matching_score?: number | null
    is_verified?: boolean | null
  }>

  const uniquePairs = new Map<
    string,
    {
      planMappingId: string
      providerId: string
      providerPlanId: string
      providerPlanRawId: string | null
      matchingScore: number | null
      isVerified: boolean
    }
  >()

  for (const mapping of planMappings) {
    const providerId = mapping.service_provider_id
    const providerPlanId = mapping.provider_plan_id?.trim() || ''
    if (!providerId || !providerPlanId) continue
    const key = authoritativePricingKey(providerId, providerPlanId)
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, {
        planMappingId: mapping.id,
        providerId,
        providerPlanId,
        providerPlanRawId: mapping.provider_plan_raw_id ?? null,
        matchingScore: mapping.matching_score ?? null,
        isVerified: mapping.is_verified === true,
      })
    }
  }

  const providerIds = [...new Set([...uniquePairs.values()].map((p) => p.providerId))]
  const providerMeta = await loadProviderMeta(providerIds)

  const providers: AuthoritativeProviderPricingRow[] = []

  for (const pair of uniquePairs.values()) {
    const rawPlan = (await resolveRawPlanForMapping({
      mappingId: pair.planMappingId,
      serviceProviderId: pair.providerId,
      providerPlanId: pair.providerPlanId,
      providerPlanRawId: pair.providerPlanRawId,
      autoReconnect: true,
    })) as {
      id?: string
      amount?: number | null
      currency?: string | null
      destination_amount?: number | null
      destination_currency?: string | null
      raw_json?: unknown
    } | null

    const wholesale = resolveWholesalePricing({
      rawJson: rawPlan?.raw_json,
      amount: rawPlan?.amount ?? null,
      currency: rawPlan?.currency ?? null,
      destinationAmount: rawPlan?.destination_amount ?? null,
      destinationCurrency: rawPlan?.destination_currency ?? null,
    })

    const meta = providerMeta.get(pair.providerId)

    providers.push({
      providerId: pair.providerId,
      providerName: meta?.name ?? pair.providerId,
      providerCode: meta?.code ?? null,
      providerPlanId: pair.providerPlanId,
      providerPlanRawId: rawPlan?.id ?? pair.providerPlanRawId,
      planMappingId: pair.planMappingId,
      systemPlanId,
      internalPlanId: plan.internal_plan_id ?? null,
      provider_wholesale_amount: wholesale.wholesaleAmount,
      provider_wholesale_currency: wholesale.wholesaleCurrency,
      destination_face_value: wholesale.destinationAmount,
      destination_currency: wholesale.destinationCurrency,
      matchingScore: pair.matchingScore,
      isVerified: pair.isVerified,
      existsInPlanMappings: true,
      sourceTable: 'plan_mappings+provider_plans_raw',
      sourceFile: AUTHORITATIVE_PRICING_SOURCE_FILE,
      sourceQuery: AUTHORITATIVE_PRICING_SOURCE_QUERY.replace('{id}', systemPlanId),
    })
  }

  const byProviderId = new Map<string, AuthoritativeProviderPricingRow>()
  const byKey = new Map<string, AuthoritativeProviderPricingRow>()
  for (const row of providers) {
    byKey.set(authoritativePricingKey(row.providerId, row.providerPlanId), row)
    if (!byProviderId.has(row.providerId)) {
      byProviderId.set(row.providerId, row)
    }
  }

  return {
    systemPlanId,
    internalPlanId: plan.internal_plan_id ?? null,
    systemPlanName: plan.system_plan_name ?? null,
    providers,
    byProviderId,
    byKey,
  }
}

/** Resolve system_plan_id from internal or system plan id, then load authoritative pricing. */
export async function resolveProviderPricingForInternalPlan(
  planId: string,
): Promise<SystemPlanPricingResolution | null> {
  const { resolveSystemPlanFromInternalPlan } = await import(
    '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'
  )
  const link = await resolveSystemPlanFromInternalPlan(planId)
  if (!link) return null
  return resolveProviderPricingForSystemPlan(link.systemPlanId)
}

/** Lookup authoritative wholesale for a provider on a plan (internal or system plan id). */
export async function lookupAuthoritativeProviderPricing(input: {
  planId: string
  providerId: string
  providerPlanId?: string | null
}): Promise<AuthoritativeProviderPricingRow | null> {
  let resolution: SystemPlanPricingResolution | null = null

  const asSystem = await loadSystemPlanMeta(input.planId)
  if (asSystem) {
    resolution = await resolveProviderPricingForSystemPlan(input.planId)
  } else {
    resolution = await resolveProviderPricingForInternalPlan(input.planId)
  }

  if (!resolution) return null

  if (input.providerPlanId) {
    return (
      resolution.byKey.get(authoritativePricingKey(input.providerId, input.providerPlanId)) ?? null
    )
  }
  return resolution.byProviderId.get(input.providerId) ?? null
}
