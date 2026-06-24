import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  authoritativePricingKey,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import { resolveProvidersForInternalPlan } from '@/lib/recharge-orchestration/resolve-providers-for-system-plan'
import { resolveSystemPlanFromInternalPlan } from '@/lib/recharge-orchestration/resolve-system-plan-from-internal-plan'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type CompatibilityOverlayRow = {
  providerId: string
  providerPlanId: string
  margin: number
  enabled: boolean
}

export type OrchestrationParityMismatch = {
  providerId: string
  providerPlanId: string
  field: string
  planMappingsValue: string | number | null
  internalCacheValue: string | number | null
}

export type OrchestrationParityReport = {
  internalPlanId: string
  systemPlanId: string | null
  ok: boolean
  authoritativeProviderCount: number
  internalCacheProviderCount: number
  orphanInternalRows: number
  missingInternalCacheRows: number
  mismatches: OrchestrationParityMismatch[]
  errors: string[]
}

type InternalRow = {
  provider_id: string
  provider_plan_id: string
  provider_price: number | null
  provider_currency: string | null
  enabled?: boolean | null
}

/**
 * Compare plan_mappings authoritative providers vs internal_plan_provider_mapping cache.
 * Advisory only — routing uses plan_mappings whenever providers exist (same as admin/products).
 */
export async function validateOrchestrationParity(
  internalPlanId: string,
): Promise<OrchestrationParityReport> {
  const errors: string[] = []
  const mismatches: OrchestrationParityMismatch[] = []

  const link = await resolveSystemPlanFromInternalPlan(internalPlanId)
  const authoritative = await resolveProvidersForInternalPlan(internalPlanId)

  const internalRows: InternalRow[] = []
  const internalRes = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=provider_id,provider_plan_id,provider_price,provider_currency,enabled`,
    { cache: 'no-store' },
  )
  if (internalRes.ok) {
    internalRows.push(...((await internalRes.json()) as InternalRow[]))
  }

  const authByKey = new Map(
    (authoritative?.providers ?? []).map((p) => [
      authoritativePricingKey(p.providerId, p.providerPlanId),
      p,
    ]),
  )
  const internalByKey = new Map(
    internalRows.map((r) => [authoritativePricingKey(r.provider_id, r.provider_plan_id), r]),
  )

  let orphanInternalRows = 0
  for (const internal of internalRows) {
    const key = authoritativePricingKey(internal.provider_id, internal.provider_plan_id)
    if (authByKey.has(key)) continue
    orphanInternalRows++
    errors.push(
      `Orphan internal cache row: ${internal.provider_id}:${internal.provider_plan_id}`,
    )
  }

  let missingInternalCacheRows = 0
  for (const auth of authoritative?.providers ?? []) {
    const key = authoritativePricingKey(auth.providerId, auth.providerPlanId)
    const internal = internalByKey.get(key)
    if (!internal) {
      missingInternalCacheRows++
      continue
    }

    const authPrice = auth.provider_wholesale_amount
    const authCurrency = (auth.provider_wholesale_currency ?? '').toUpperCase()
    const internalPrice = internal.provider_price
    const internalCurrency = (internal.provider_currency ?? '').toUpperCase()

    if (
      authPrice != null &&
      internalPrice != null &&
      Math.abs(authPrice - internalPrice) > 0.02
    ) {
      mismatches.push({
        providerId: auth.providerId,
        providerPlanId: auth.providerPlanId,
        field: 'provider_price',
        planMappingsValue: authPrice,
        internalCacheValue: internalPrice,
      })
    }
    if (authCurrency && internalCurrency && authCurrency !== internalCurrency) {
      mismatches.push({
        providerId: auth.providerId,
        providerPlanId: auth.providerPlanId,
        field: 'provider_currency',
        planMappingsValue: authCurrency,
        internalCacheValue: internalCurrency,
      })
    }
  }

  const ok =
    Boolean(authoritative?.providers.length) &&
    orphanInternalRows === 0 &&
    mismatches.length === 0

  if (!authoritative?.providers.length) {
    errors.push('No authoritative plan_mappings providers for internal plan')
  }

  return {
    internalPlanId,
    systemPlanId: link?.systemPlanId ?? authoritative?.systemPlanId ?? null,
    ok,
    authoritativeProviderCount: authoritative?.providers.length ?? 0,
    internalCacheProviderCount: internalRows.length,
    orphanInternalRows,
    missingInternalCacheRows,
    mismatches,
    errors,
  }
}

/** Load margin/enabled from compatibility cache (not used for discovery). */
export async function loadCompatibilityOverlay(
  internalPlanId: string,
): Promise<Map<string, CompatibilityOverlayRow>> {
  const map = new Map<string, CompatibilityOverlayRow>()
  const res = await supabaseRest(
    `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=provider_id,provider_plan_id,margin,enabled`,
    { cache: 'no-store' },
  )
  if (!res.ok) return map
  const rows = (await res.json()) as Array<{
    provider_id: string
    provider_plan_id: string
    margin?: number | null
    enabled?: boolean | null
  }>
  for (const row of rows) {
    const key = authoritativePricingKey(row.provider_id, row.provider_plan_id)
    map.set(key, {
      providerId: row.provider_id,
      providerPlanId: row.provider_plan_id,
      margin: typeof row.margin === 'number' ? row.margin : 0,
      enabled: row.enabled !== false,
    })
  }
  return map
}

export function applyCompatibilityOverlay(
  auth: AuthoritativeProviderPricingRow,
  overlay: CompatibilityOverlayRow | undefined,
): { margin: number; enabled: boolean } {
  return {
    margin: overlay?.margin ?? 0,
    enabled: overlay?.enabled ?? true,
  }
}
