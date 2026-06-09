import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadTrustedOperators,
  aggInsertPlanClassificationAudit,
  aggInsertCatalogReviewQueue,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'

export async function runStep8FilterBenefits(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
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
    const planIntel = catalogEngine.classifyRawPlan({
      raw,
      operatorName: raw.operator?.name || raw.operatorName || undefined,
      countryCode: raw.CountryIso3 || raw.countryIso3 || undefined,
    })
    const rawBenefits = raw.Benefits || raw.benefits || raw.BenefitsJson || []
    let isDigital = false
    if (Array.isArray(rawBenefits)) {
      isDigital = rawBenefits.some(b => 
        b === 'DigitalProduct' || 
        (typeof b === 'object' && b !== null && (b.type === 'DigitalProduct' || b.Type === 'DigitalProduct'))
      )
    }

    await supabaseRest(`provider_plans_raw?id=eq.${rawPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        catalog_status: isDigital ? 'NON_TELECOM' : planIntel.catalogStatus,
        confidence_level: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
        confidence_score: isDigital ? 0.1 : planIntel.confidenceScore,
        status: isDigital || planIntel.catalogStatus === 'NON_TELECOM' ? 'non_telecom' : planIntel.catalogStatus.toLowerCase(),
      }),
    }).catch(() => {})

    await aggInsertPlanClassificationAudit({
      providerCode: config.code,
      providerPlanRawId: rawPlanId,
      providerPlanId: rawPlan.provider_plan_id,
      classification: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidenceLevel: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidenceScore: isDigital ? 0.1 : planIntel.confidenceScore,
      catalogStatus: isDigital ? 'NON_TELECOM' : planIntel.catalogStatus,
      matchedKeywords: isDigital ? ['DigitalProduct'] : planIntel.matchedKeywords,
      confidenceBreakdown: isDigital ? {} : planIntel.layerScores,
      rejectionReason: isDigital ? 'DIGITAL_PRODUCT_BENEFIT' : (planIntel.rejectionReason ?? null),
    }).catch(() => {})

    const systemPatch = {
      catalog_status: isDigital ? 'NON_TELECOM' : planIntel.catalogStatus,
      confidence_level: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
      confidence_score: isDigital ? 0.1 : planIntel.confidenceScore,
      status: isDigital || planIntel.catalogStatus === 'NON_TELECOM' ? 'INACTIVE' : 'ACTIVE',
    }
    await supabaseRest(`system_plans?id=eq.${sysPlanId}`, {
      method: 'PATCH',
      body: JSON.stringify(systemPatch),
    }).catch(() => {})

    if (isDigital || planIntel.catalogStatus === 'NON_TELECOM' || planIntel.catalogStatus === 'QUARANTINED') {
      quarantinedPlans++
      if (isDigital || planIntel.shouldQuarantine) {
        await aggInsertCatalogReviewQueue({
          providerCode: config.code,
          providerPlanRawId: rawPlanId,
          providerPlanId: rawPlan.provider_plan_id,
          entityType: 'plan',
          entityName: rawPlan.provider_plan_name || rawPlan.provider_plan_id,
          confidenceLevel: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
          confidenceScore: isDigital ? 0.1 : planIntel.confidenceScore,
          classification: isDigital ? 'CONFIRMED_NON_TELECOM' : planIntel.confidenceLevel,
          catalogStatus: isDigital ? 'NON_TELECOM' : planIntel.catalogStatus,
          rawPayload: rawPlan.raw_json,
          notes: isDigital ? 'DIGITAL_PRODUCT_BENEFIT' : (planIntel.rejectionReason ?? null),
        }).catch(() => {})
      }
    } else if (planIntel.catalogStatus === 'REVIEW') {
      reviewPlans++
    } else {
      activePlans++
    }
  }

  return {
    success: true,
    message: `Step 8 complete. Soft catalog filtering applied. Active: ${activePlans}, Review: ${reviewPlans}, Quarantined/Non-telecom: ${quarantinedPlans}. No plans were deleted.`,
    data: {
      quarantined: quarantinedPlans,
      review: reviewPlans,
      active: activePlans,
    },
  }
}
