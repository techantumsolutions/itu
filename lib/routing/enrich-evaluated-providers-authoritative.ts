import {
  authoritativePricingKey,
  resolveProviderPricingForInternalPlan,
  resolveProviderPricingForSystemPlan,
  type AuthoritativeProviderPricingRow,
} from '@/lib/catalog/resolve-provider-pricing-for-system-plan'
import { logAuthoritativeMappingMissing } from '@/lib/catalog/system-plan-pricing-consistency'
import type { ProviderPricingDebugMeta } from '@/lib/catalog/provider-pricing-debug'

function pricingDebugFromAuthoritative(
  row: AuthoritativeProviderPricingRow | null | undefined,
  providerName: string,
  providerPlanId: string | null,
): ProviderPricingDebugMeta {
  if (!row) {
    return {
      providerName,
      providerPlanId,
      providerPlanRawId: null,
      provider_wholesale_amount: null,
      provider_wholesale_currency: null,
      destination_face_value: null,
      destination_currency: null,
      sourceTable: null,
      sourceFile: null,
      sourceQuery: null,
      existsInPlanMappings: false,
      orphanInternalMapping: true,
    }
  }
  return {
    providerName: row.providerName,
    providerPlanId: row.providerPlanId,
    providerPlanRawId: row.providerPlanRawId,
    provider_wholesale_amount: row.provider_wholesale_amount,
    provider_wholesale_currency: row.provider_wholesale_currency,
    destination_face_value: row.destination_face_value,
    destination_currency: row.destination_currency,
    sourceTable: row.sourceTable,
    sourceFile: row.sourceFile,
    sourceQuery: row.sourceQuery,
    existsInPlanMappings: true,
    orphanInternalMapping: false,
  }
}

/** Re-resolve evaluated provider costs from authoritative plan_mappings pricing (admin display). */
export async function enrichEvaluatedProvidersWithAuthoritativePricing(
  internalPlanId: string,
  evaluated: Array<Record<string, unknown>>,
  options?: { systemPlanId?: string | null },
): Promise<{
  evaluated: Array<Record<string, unknown>>
  pricingDebug: ProviderPricingDebugMeta[]
  orphanProviders: string[]
}> {
  const systemPlanId = options?.systemPlanId?.trim() || null
  const authoritative = systemPlanId
    ? await resolveProviderPricingForSystemPlan(systemPlanId)
    : await resolveProviderPricingForInternalPlan(internalPlanId)
  const pricingDebug: ProviderPricingDebugMeta[] = []
  const orphanProviders: string[] = []

  const enriched = evaluated.map((entry) => {
    const providerId = entry.providerId != null ? String(entry.providerId) : ''
    const providerPlanId =
      entry.providerPlanId != null
        ? String(entry.providerPlanId)
        : entry.provider_plan_id != null
          ? String(entry.provider_plan_id)
          : null
    const providerName = String(entry.providerName ?? entry.provider ?? providerId)

    const authRow = providerPlanId
      ? authoritative?.byKey.get(authoritativePricingKey(providerId, providerPlanId))
      : authoritative?.byProviderId.get(providerId)

    if (!authRow) {
      const runtimeEligible = entry.eligibility === true || entry.eligible === true
      if (entry.skipped) {
        const debug = pricingDebugFromAuthoritative(null, providerName, providerPlanId)
        pricingDebug.push(debug)
        return {
          ...entry,
          pricingSource: debug,
          eligible: false,
          eligibility: false,
        }
      }
      const runtimeCost =
        typeof entry.provider_wholesale_amount === 'number'
          ? entry.provider_wholesale_amount
          : typeof entry.costPrice === 'number'
            ? entry.costPrice
            : null
      const runtimeCurrency =
        typeof entry.provider_wholesale_currency === 'string'
          ? entry.provider_wholesale_currency
          : typeof entry.currency === 'string'
            ? entry.currency
            : null

      if (providerId && entry.mappingExists !== false && !(runtimeEligible && runtimeCost != null)) {
        logAuthoritativeMappingMissing({
          context: 'routing-logs-evaluated-providers',
          internalPlanId,
          providerId,
          providerName,
          providerPlanId,
        })
        orphanProviders.push(providerName)
      }
      const debug = pricingDebugFromAuthoritative(null, providerName, providerPlanId)
      pricingDebug.push(debug)

      if (runtimeEligible && runtimeCost != null) {
        return {
          ...entry,
          pricingSource: debug,
          costPrice: runtimeCost,
          currency: runtimeCurrency,
          provider_wholesale_amount: runtimeCost,
          provider_wholesale_currency: runtimeCurrency,
        }
      }

      return {
        ...entry,
        pricingSource: debug,
        filterReason:
          entry.filterReason === 'PLAN_MAPPING_MISSING'
            ? entry.filterReason
            : entry.mappingExists === false
              ? entry.filterReason
              : 'AUTHORITATIVE_MAPPING_MISSING',
        eligible: false,
        eligibility: false,
      }
    }

    const debug = pricingDebugFromAuthoritative(authRow, providerName, authRow.providerPlanId)
    pricingDebug.push(debug)

    return {
      ...entry,
      providerPlanId: authRow.providerPlanId,
      costPrice: authRow.provider_wholesale_amount,
      currency: authRow.provider_wholesale_currency,
      provider_wholesale_amount: authRow.provider_wholesale_amount,
      provider_wholesale_currency: authRow.provider_wholesale_currency,
      destination_face_value: authRow.destination_face_value,
      destination_currency: authRow.destination_currency,
      pricingSource: debug,
    }
  })

  return { evaluated: enriched, pricingDebug, orphanProviders }
}
