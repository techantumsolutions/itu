import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  authoritativePricingKey,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import {
  applyCompatibilityOverlay,
  loadCompatibilityOverlay,
  validateOrchestrationParity,
  type OrchestrationParityReport,
} from '@/lib/recharge-orchestration/mapping-parity-validator'
import {
  resolveProvidersForPlanId,
  resolveProvidersForSystemPlan,
  type SystemPlanProviderRow,
} from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'
import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'

export type CandidateMappingRow = {
  provider_id: string
  provider_plan_id: string
  provider_price: number | null
  provider_currency: string | null
  provider_priority: number | null
  margin: number | null
  enabled?: boolean
  destination_amount?: number | null
  destination_currency?: string | null
}

export type AuthoritativeCandidateBundle = {
  source: 'plan_mappings' | 'legacy_internal_cache'
  internalPlanId: string
  systemPlanId: string | null
  mappings: CandidateMappingRow[]
  providers: Map<string, Record<string, unknown>>
  providersToEvaluate: Record<string, unknown>[]
  authoritativeByKey: Map<string, AuthoritativeProviderPricingRow>
  authoritativeProviders: SystemPlanProviderRow[]
  parity: OrchestrationParityReport | null
}

function toAuthoritativePricingRow(row: SystemPlanProviderRow): AuthoritativeProviderPricingRow {
  return {
    providerId: row.providerId,
    providerName: row.providerName,
    providerCode: row.providerCode,
    providerPlanId: row.providerPlanId,
    providerPlanRawId: row.providerPlanRawId,
    planMappingId: row.planMappingId,
    systemPlanId: row.systemPlanId,
    internalPlanId: row.internalPlanId,
    provider_wholesale_amount: row.provider_wholesale_amount,
    provider_wholesale_currency: row.provider_wholesale_currency,
    destination_face_value: row.destination_face_value,
    destination_currency: row.destination_currency,
    matchingScore: null,
    isVerified: true,
    existsInPlanMappings: true,
    sourceTable: 'plan_mappings+provider_plans_raw',
    sourceFile: 'lib/recharge-orchestration/resolve-providers-for-system-plan.ts',
    sourceQuery: 'plan_mappings → provider_plans_raw',
  }
}

function mappingRowFromAuthoritative(
  row: SystemPlanProviderRow,
  overlay: ReturnType<typeof applyCompatibilityOverlay>,
): CandidateMappingRow {
  return {
    provider_id: row.providerId,
    provider_plan_id: row.providerPlanId,
    provider_price: row.provider_wholesale_amount,
    provider_currency: row.provider_wholesale_currency,
    provider_priority: row.provider_priority,
    margin: overlay.margin,
    enabled: overlay.enabled,
    destination_amount: row.destination_face_value,
    destination_currency: row.destination_currency,
  }
}

async function loadLcrProviderRecords(providerIds: string[]): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>()
  if (!providerIds.length) return map

  for (let i = 0; i < providerIds.length; i += 50) {
    const chunk = providerIds.slice(i, i + 50)
    const res = await supabaseRest(
      `lcr_providers?id=in.(${chunk.map((id) => encodeURIComponent(id)).join(',')})&select=id,code,name,is_active,priority,status,supported_countries,adapter_key,credentials_encrypted`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as Record<string, unknown>[]
    for (const row of rows) {
      if (row.id) map.set(String(row.id), row)
    }
  }
  return map
}

/** Discover LCR candidates from plan_mappings only (authoritative path). */
export async function loadAuthoritativeCandidateBundle(
  planId: string,
  options?: { systemPlanId?: string | null },
): Promise<AuthoritativeCandidateBundle | null> {
  const explicitSystemPlanId = options?.systemPlanId?.trim() || null
  const link = explicitSystemPlanId
    ? await resolveSystemPlanFromInternalPlan(explicitSystemPlanId)
    : await resolveSystemPlanFromInternalPlan(planId)

  const systemPlanId = explicitSystemPlanId ?? link?.systemPlanId ?? null
  const resolution = systemPlanId
    ? await resolveProvidersForSystemPlan(systemPlanId)
    : await resolveProvidersForPlanId(planId)
  if (!resolution?.providers.length) return null

  const internalPlanId = link?.internalPlanId ?? planId
  const overlayByKey = await loadCompatibilityOverlay(internalPlanId)
  const parity = await validateOrchestrationParity(internalPlanId)

  const authoritativeByKey = new Map<string, AuthoritativeProviderPricingRow>()
  const mappings: CandidateMappingRow[] = []

  for (const row of resolution.providers) {
    const key = authoritativePricingKey(row.providerId, row.providerPlanId)
    const overlay = applyCompatibilityOverlay(toAuthoritativePricingRow(row), overlayByKey.get(key))
    authoritativeByKey.set(key, toAuthoritativePricingRow(row))
    mappings.push(mappingRowFromAuthoritative(row, overlay))
  }

  const providerIds = [...new Set(resolution.providers.map((p) => p.providerId))]
  const providers = await loadLcrProviderRecords(providerIds)
  const providersToEvaluate = providerIds
    .map((id) => providers.get(id))
    .filter((p): p is Record<string, unknown> => Boolean(p))

  return {
    source: 'plan_mappings',
    internalPlanId,
    systemPlanId: link?.systemPlanId ?? resolution.systemPlanId,
    mappings,
    providers,
    providersToEvaluate,
    authoritativeByKey,
    authoritativeProviders: resolution.providers,
    parity,
  }
}

export function shouldUseAuthoritativeDiscovery(
  parity: OrchestrationParityReport | null,
  authoritativeProviderCount = 0,
): boolean {
  if (process.env.RECHARGE_FORCE_LEGACY_INTERNAL_MAPPING === '1') return false
  if (process.env.RECHARGE_AUTHORITATIVE_PLAN_MAPPINGS === '1') {
    return authoritativeProviderCount > 0
  }
  // Same source as admin/products — stale internal_plan_provider_mapping must not block routing.
  return authoritativeProviderCount > 0
}
