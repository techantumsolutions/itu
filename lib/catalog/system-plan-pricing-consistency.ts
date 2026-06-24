import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  authoritativePricingKey,
  resolveProviderPricingForSystemPlan,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'

function enc(v: string): string {
  return encodeURIComponent(v)
}

export type ProviderPricingConsistencyRow = {
  providerName: string
  providerId: string
  providerPlanId: string | null
  providerPlanRawId: string | null
  existsInPlanMappings: boolean
  existsInInternalPlanProviderMapping: boolean
  existsInProviderPlansRaw: boolean
  provider_wholesale_amount: number | null
  provider_wholesale_currency: string | null
  destination_face_value: number | null
  destination_currency: string | null
  internalMappingPrice: number | null
  internalMappingCurrency: string | null
  sourceFile: string | null
  sourceQuery: string | null
  pricingMismatch: boolean
  orphanInternalMapping: boolean
}

export type SystemPlanPricingConsistencyReport = {
  systemPlanId: string
  internalPlanId: string | null
  systemPlanName: string | null
  authoritativeProviders: AuthoritativeProviderPricingRow[]
  rows: ProviderPricingConsistencyRow[]
  orphanInternalMappings: ProviderPricingConsistencyRow[]
  errors: string[]
}

/** Compare authoritative plan_mappings pricing vs internal_plan_provider_mapping orphans. */
export async function buildSystemPlanPricingConsistencyReport(
  systemPlanId: string,
): Promise<SystemPlanPricingConsistencyReport | null> {
  const authoritative = await resolveProviderPricingForSystemPlan(systemPlanId)
  if (!authoritative) return null

  const errors: string[] = []
  const internalPlanId = authoritative.internalPlanId

  type InternalRow = {
    provider_id: string
    provider_plan_id: string
    provider_price: number | null
    provider_currency: string | null
    enabled?: boolean | null
  }

  const internalRows: InternalRow[] = []
  if (internalPlanId) {
    const res = await supabaseRest(
      `internal_plan_provider_mapping?internal_plan_id=eq.${enc(internalPlanId)}&select=provider_id,provider_plan_id,provider_price,provider_currency,enabled`,
      { cache: 'no-store' },
    )
    if (res.ok) {
      internalRows.push(...((await res.json()) as InternalRow[]))
    }
  }

  const internalByKey = new Map(
    internalRows.map((r) => [authoritativePricingKey(r.provider_id, r.provider_plan_id), r]),
  )

  const rows: ProviderPricingConsistencyRow[] = authoritative.providers.map((auth) => {
    const internal = internalByKey.get(authoritativePricingKey(auth.providerId, auth.providerPlanId))
    const pricingMismatch =
      internal != null &&
      ((internal.provider_price != null &&
        auth.provider_wholesale_amount != null &&
        Math.abs(internal.provider_price - auth.provider_wholesale_amount) > 0.02) ||
        (internal.provider_currency &&
          auth.provider_wholesale_currency &&
          internal.provider_currency.toUpperCase() !== auth.provider_wholesale_currency.toUpperCase()))

    if (pricingMismatch) {
      errors.push(
        `Pricing mismatch ${auth.providerName}: authoritative=${auth.provider_wholesale_amount} ${auth.provider_wholesale_currency} internal_mapping=${internal?.provider_price} ${internal?.provider_currency}`,
      )
    }

    return {
      providerName: auth.providerName,
      providerId: auth.providerId,
      providerPlanId: auth.providerPlanId,
      providerPlanRawId: auth.providerPlanRawId,
      existsInPlanMappings: true,
      existsInInternalPlanProviderMapping: Boolean(internal),
      existsInProviderPlansRaw: Boolean(auth.providerPlanRawId),
      provider_wholesale_amount: auth.provider_wholesale_amount,
      provider_wholesale_currency: auth.provider_wholesale_currency,
      destination_face_value: auth.destination_face_value,
      destination_currency: auth.destination_currency,
      internalMappingPrice: internal?.provider_price ?? null,
      internalMappingCurrency: internal?.provider_currency ?? null,
      sourceFile: auth.sourceFile,
      sourceQuery: auth.sourceQuery,
      pricingMismatch,
      orphanInternalMapping: false,
    }
  })

  const orphanInternalMappings: ProviderPricingConsistencyRow[] = []
  for (const internal of internalRows) {
    const key = authoritativePricingKey(internal.provider_id, internal.provider_plan_id)
    if (authoritative.byKey.has(key)) continue

    const provRes = await supabaseRest(
      `lcr_providers?id=eq.${enc(internal.provider_id)}&select=id,code,name&limit=1`,
      { cache: 'no-store' },
    )
    const prov = provRes.ok
      ? ((await provRes.json()) as Array<{ name?: string; code?: string }>)[0]
      : null

    errors.push(
      `Orphan internal_plan_provider_mapping: provider=${prov?.name ?? internal.provider_id} plan_id=${internal.provider_plan_id} (no plan_mappings row)`,
    )

    orphanInternalMappings.push({
      providerName: prov?.name ?? prov?.code ?? internal.provider_id,
      providerId: internal.provider_id,
      providerPlanId: internal.provider_plan_id,
      providerPlanRawId: null,
      existsInPlanMappings: false,
      existsInInternalPlanProviderMapping: true,
      existsInProviderPlansRaw: false,
      provider_wholesale_amount: null,
      provider_wholesale_currency: null,
      destination_face_value: null,
      destination_currency: null,
      internalMappingPrice: internal.provider_price,
      internalMappingCurrency: internal.provider_currency,
      sourceFile: null,
      sourceQuery: 'internal_plan_provider_mapping (orphan — not authoritative)',
      pricingMismatch: true,
      orphanInternalMapping: true,
    })
  }

  return {
    systemPlanId,
    internalPlanId,
    systemPlanName: authoritative.systemPlanName,
    authoritativeProviders: authoritative.providers,
    rows,
    orphanInternalMappings,
    errors,
  }
}

/** Log when runtime routing references a provider absent from plan_mappings. */
export function logAuthoritativeMappingMissing(input: {
  context: string
  internalPlanId: string
  providerId: string
  providerName?: string | null
  providerPlanId?: string | null
}): void {
  console.error(
    '[Authoritative Pricing]',
    `context=${input.context}`,
    `Provider exists in runtime but missing from plan_mappings:`,
    `${input.providerName ?? input.providerId}`,
    `internal_plan_id=${input.internalPlanId}`,
    `provider_plan_id=${input.providerPlanId ?? 'n/a'}`,
  )
}
