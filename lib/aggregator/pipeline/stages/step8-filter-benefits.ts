import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadTrustedOperators,
  aggInsertPlanClassificationAudit,
  aggInsertCatalogReviewQueue,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'
import { dbUpsertInternalPlanMapping } from '@/lib/uti/repository'
import { hasExcludedPlanBenefits } from '@/lib/aggregator/telecom-validator'
import { deactivateSystemPlansWithoutMappings } from '@/lib/aggregator/pipeline/deactivate-unmapped-system-plans'
import { isRegistryVerifiedSource } from '@/lib/aggregator/pipeline/registry-fast-path'

export async function runStep8FilterBenefits(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const unmappedDeactivation = await deactivateSystemPlansWithoutMappings().catch((err) => {
    console.warn('[Step8] deactivateSystemPlansWithoutMappings failed:', err)
    return { scanned: 0, deactivated: 0 }
  })
  if (unmappedDeactivation.deactivated > 0) {
    console.log(
      `[Step8] Deactivated ${unmappedDeactivation.deactivated} system plan(s) with NO_PROVIDER_MAPPING`,
    )
  }

  const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
  const catalogEngine = new CatalogIntelligenceEngine(trustedOperators)
  const mappingsRes = await supabaseRest(`plan_mappings?service_provider_id=eq.${providerId}&select=system_plan_id,provider_plan_raw_id`, { cache: 'no-store' })
  const mappings = await mappingsRes.json().catch(() => []) as any[]

  let quarantinedPlans = 0
  let reviewPlans = 0
  let activePlans = 0

  for (const map of mappings) {
    const sysPlanId = map.system_plan_id
    const rawPlanId = map.provider_plan_raw_id

    const rawPlanRes = await supabaseRest(`provider_plans_raw?id=eq.${rawPlanId}&limit=1`, { cache: 'no-store' })
    const rawPlanRows = await rawPlanRes.json().catch(() => []) as any[]
    const rawPlan = rawPlanRows[0]

    if (!rawPlan) continue

    // Check if it has DigitalProduct benefit
    const raw = rawPlan.raw_json || rawPlan
    const excludedBenefit = hasExcludedPlanBenefits(raw)
    const isExcludedBenefit = excludedBenefit.excluded

    const sysOpRes = await supabaseRest(
      `system_plans?id=eq.${sysPlanId}&select=system_operator_id&limit=1`,
      { cache: 'no-store' },
    )
    const sysOpRow = ((await sysOpRes.json().catch(() => [])) as any[])[0]
    let registryVerifiedOperator = false
    if (sysOpRow?.system_operator_id) {
      const opRes = await supabaseRest(
        `system_operators?id=eq.${sysOpRow.system_operator_id}&select=domain_classification_source&limit=1`,
        { cache: 'no-store' },
      )
      const opRow = ((await opRes.json().catch(() => [])) as any[])[0]
      registryVerifiedOperator = isRegistryVerifiedSource(opRow?.domain_classification_source)
    }

    const planIntel = registryVerifiedOperator && !isExcludedBenefit
      ? {
          catalogStatus: 'ACTIVE' as const,
          confidenceLevel: 'HIGH_CONFIDENCE_TELECOM' as const,
          confidenceScore: 0.95,
          matchedKeywords: ['registry_verified_operator'],
          layerScores: {},
          rejectionReason: null,
          shouldQuarantine: false,
        }
      : catalogEngine.classifyRawPlan({
          raw,
          operatorName: raw.operator?.name || raw.operatorName || undefined,
          countryCode: raw.CountryIso3 || raw.countryIso3 || undefined,
        })

    await supabaseRest(`provider_plans_raw?id=eq.${rawPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        catalog_status: isExcludedBenefit ? 'NON_TELECOM' : planIntel.catalogStatus,
        confidence_level: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
        confidence_score: isExcludedBenefit ? 0.1 : planIntel.confidenceScore,
        status: isExcludedBenefit || planIntel.catalogStatus === 'NON_TELECOM' ? 'non_telecom' : planIntel.catalogStatus.toLowerCase(),
      }),
    }).catch(() => {})

    await aggInsertPlanClassificationAudit({
      providerCode: config.code,
      providerPlanRawId: rawPlanId,
      providerPlanId: rawPlan.provider_plan_id,
      classification: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidenceLevel: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidenceScore: isExcludedBenefit ? 0.1 : planIntel.confidenceScore,
      catalogStatus: isExcludedBenefit ? 'NON_TELECOM' : planIntel.catalogStatus,
      matchedKeywords: isExcludedBenefit ? [excludedBenefit.reason ?? 'EXCLUDED_BENEFIT'] : planIntel.matchedKeywords,
      confidenceBreakdown: isExcludedBenefit ? {} : planIntel.layerScores,
      rejectionReason: isExcludedBenefit ? `EXCLUDED_BENEFIT:${excludedBenefit.reason ?? 'UNKNOWN'}` : (planIntel.rejectionReason ?? null),
    }).catch(() => {})

    const systemPatch = {
      catalog_status: isExcludedBenefit ? 'NON_TELECOM' : planIntel.catalogStatus,
      confidence_level: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidence_score: isExcludedBenefit ? 0.1 : planIntel.confidenceScore,
      status: isExcludedBenefit || planIntel.catalogStatus === 'NON_TELECOM' ? 'INACTIVE' : 'ACTIVE',
    }
    await supabaseRest(`system_plans?id=eq.${sysPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify(systemPatch),
    }).catch(() => {})

    const isEnabled = !(isExcludedBenefit || planIntel.catalogStatus === 'NON_TELECOM' || planIntel.catalogStatus === 'QUARANTINED')

    if (isExcludedBenefit || planIntel.catalogStatus === 'NON_TELECOM' || planIntel.catalogStatus === 'QUARANTINED') {
      quarantinedPlans++
      if (isExcludedBenefit || planIntel.shouldQuarantine) {
        await aggInsertCatalogReviewQueue({
          providerCode: config.code,
          providerPlanRawId: rawPlanId,
          providerPlanId: rawPlan.provider_plan_id,
          entityType: 'plan',
          entityName: rawPlan.provider_plan_name || rawPlan.provider_plan_id,
          confidenceLevel: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
          confidenceScore: isExcludedBenefit ? 0.1 : planIntel.confidenceScore,
          classification: isExcludedBenefit ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
          catalogStatus: isExcludedBenefit ? 'NON_TELECOM' : planIntel.catalogStatus,
          rawPayload: rawPlan.raw_json,
          notes: isExcludedBenefit ? `EXCLUDED_BENEFIT:${excludedBenefit.reason ?? 'UNKNOWN'}` : (planIntel.rejectionReason ?? null),
        }).catch(() => {})
      }
    } else if (planIntel.catalogStatus === 'REVIEW') {
      reviewPlans++
    } else {
      activePlans++
    }

    // Sync the final LCR mapping status (enabled/disabled) based on classification outcome
    try {
      const sysPlanRes = await supabaseRest(`system_plans?id=eq.${sysPlanId}&select=internal_plan_id,amount,currency`, { cache: 'no-store' })
      const sysPlanRows = await sysPlanRes.json().catch(() => []) as any[]
      const internalPlanId = sysPlanRows[0]?.internal_plan_id

      if (internalPlanId) {
        await dbUpsertInternalPlanMapping({
          internalPlanId,
          providerId,
          providerPlanId: rawPlan.provider_plan_id,
          providerPrice: rawPlan.amount ?? sysPlanRows[0]?.amount ?? 0,
          providerCurrency: rawPlan.currency ?? sysPlanRows[0]?.currency ?? 'USD',
          providerPriority: config.priority ?? 100,
          margin: 0,
          enabled: isEnabled,
        })
      }
    } catch (err) {
      console.error('Failed to sync internal_plan_provider_mapping in benefit filter stage:', err)
    }
  }

  return {
    success: true,
    message: `Step 8 complete. Soft catalog filtering applied. Active: ${activePlans}, Review: ${reviewPlans}, Quarantined/Non-telecom: ${quarantinedPlans}.`,
    data: {
      quarantined: quarantinedPlans,
      review: reviewPlans,
      active: activePlans,
      unmappedDeactivation,
    },
  }
}
