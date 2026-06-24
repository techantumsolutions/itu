/**
 * Authoritative provider resolution for recharge orchestration.
 * Reads ONLY plan_mappings → provider_plans_raw (never internal_plan_provider_mapping).
 */
import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  authoritativePricingKey,
  resolveProviderPricingForSystemPlan,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type SystemPlanProviderRow = {
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
  availability: boolean
  provider_priority: number
  margin: number
  providerActive: boolean
  providerOnline: boolean
  systemPlanActive: boolean
}

export type SystemPlanProvidersResolution = {
  systemPlanId: string
  internalPlanId: string | null
  providers: SystemPlanProviderRow[]
  byKey: Map<string, SystemPlanProviderRow>
  byProviderId: Map<string, SystemPlanProviderRow>
}

type LcrProviderMeta = {
  id: string
  is_active?: boolean | null
  priority?: number | null
  status?: string | null
}

async function loadLcrProviderMeta(providerIds: string[]): Promise<Map<string, LcrProviderMeta>> {
  const map = new Map<string, LcrProviderMeta>()
  if (!providerIds.length) return map

  for (let i = 0; i < providerIds.length; i += 50) {
    const chunk = providerIds.slice(i, i + 50)
    const res = await supabaseRest(
      `lcr_providers?id=in.(${chunk.map(enc).join(',')})&select=id,is_active,priority,status`,
      { cache: 'no-store' },
    )
    if (!res.ok) continue
    const rows = (await res.json()) as LcrProviderMeta[]
    for (const row of rows) {
      if (row.id) map.set(row.id, row)
    }
  }
  return map
}

function rowFromAuthoritative(
  auth: AuthoritativeProviderPricingRow,
  lcrMeta: LcrProviderMeta | undefined,
  systemPlanActive: boolean,
): SystemPlanProviderRow {
  const providerActive = lcrMeta?.is_active !== false
  const providerOnline = String(lcrMeta?.status ?? 'online') !== 'offline'
  const hasPricing =
    auth.provider_wholesale_amount != null &&
    auth.provider_wholesale_amount > 0 &&
    Boolean(auth.provider_wholesale_currency)
  const availability = systemPlanActive && providerActive && providerOnline && hasPricing

  return {
    providerId: auth.providerId,
    providerName: auth.providerName,
    providerCode: auth.providerCode,
    providerPlanId: auth.providerPlanId,
    providerPlanRawId: auth.providerPlanRawId,
    planMappingId: auth.planMappingId,
    systemPlanId: auth.systemPlanId,
    internalPlanId: auth.internalPlanId,
    provider_wholesale_amount: auth.provider_wholesale_amount,
    provider_wholesale_currency: auth.provider_wholesale_currency,
    destination_face_value: auth.destination_face_value,
    destination_currency: auth.destination_currency,
    availability,
    provider_priority:
      typeof lcrMeta?.priority === 'number' && Number.isFinite(lcrMeta.priority)
        ? lcrMeta.priority
        : 100,
    margin: 0,
    providerActive,
    providerOnline,
    systemPlanActive,
  }
}

/** Authoritative providers for one system plan (plan_mappings → provider_plans_raw only). */
export async function resolveProvidersForSystemPlan(
  systemPlanId: string,
): Promise<SystemPlanProvidersResolution | null> {
  const pricing = await resolveProviderPricingForSystemPlan(systemPlanId)
  if (!pricing) return null

  const planRes = await supabaseRest(
    `system_plans?id=eq.${enc(systemPlanId)}&select=status&limit=1`,
    { cache: 'no-store' },
  )
  const planStatus = planRes.ok
    ? ((await planRes.json()) as Array<{ status?: string }>)[0]?.status
    : null
  const systemPlanActive = String(planStatus ?? 'ACTIVE').toUpperCase() === 'ACTIVE'

  const providerIds = [...new Set(pricing.providers.map((p) => p.providerId))]
  const lcrMeta = await loadLcrProviderMeta(providerIds)

  const providers = pricing.providers.map((auth) =>
    rowFromAuthoritative(auth, lcrMeta.get(auth.providerId), systemPlanActive),
  )

  const byKey = new Map<string, SystemPlanProviderRow>()
  const byProviderId = new Map<string, SystemPlanProviderRow>()
  for (const row of providers) {
    byKey.set(authoritativePricingKey(row.providerId, row.providerPlanId), row)
    if (!byProviderId.has(row.providerId)) byProviderId.set(row.providerId, row)
  }

  return {
    systemPlanId,
    internalPlanId: pricing.internalPlanId,
    providers,
    byKey,
    byProviderId,
  }
}

/** Authoritative providers for checkout plan id (internal_plans.id or system_plans.id). */
export async function resolveProvidersForPlanId(
  planId: string,
): Promise<SystemPlanProvidersResolution | null> {
  const link = await resolveSystemPlanFromInternalPlan(planId)
  if (!link) return null
  return resolveProvidersForSystemPlan(link.systemPlanId)
}

/** Resolve system plan from internal_plan_id, then load authoritative providers. */
export async function resolveProvidersForInternalPlan(
  internalPlanId: string,
): Promise<SystemPlanProvidersResolution | null> {
  return resolveProvidersForPlanId(internalPlanId)
}
