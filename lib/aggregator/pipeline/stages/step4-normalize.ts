import { supabaseRest } from '@/lib/db/supabase-rest'
import { aggInsertOperatorDomainAudit } from '@/lib/aggregator/repository'
import {
  createRegistryMatcher,
  evaluateRegistryFastPath,
  filterPlansByExcludedBenefits,
  REGISTRY_DOMAIN_FIELDS,
  REGISTRY_VERIFIED_SOURCE,
} from '@/lib/aggregator/pipeline/registry-fast-path'
import * as countries from 'i18n-iso-countries'

async function setOperatorAndPlanStatus(
  opId: string,
  status: 'active' | 'inactive',
  operatorPatch: Record<string, unknown> = {},
) {
  await supabaseRest(`agg_operators?id=eq.${opId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...operatorPatch }),
  }).catch(() => {})

  await supabaseRest(`agg_plans?operator_id=eq.${opId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      ...(status === 'active'
        ? {
            service_domain: 'MOBILE',
            service_domain_confidence: 99,
            service_domain_source: REGISTRY_VERIFIED_SOURCE,
          }
        : {}),
    }),
  }).catch(() => {})
}

export async function runStep4Normalize(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const registryMatcher = await createRegistryMatcher()

  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  let activeCount = 0
  let inactiveCount = 0
  let excludedBenefitPlans = 0

  for (const op of aggOps) {
    const operatorName = op.operator_name || op.name
    const countryIso3 = String(op.country_iso3 ?? '').toUpperCase()
    const countryName = countries.getName(countryIso3, 'en') || undefined

    const plansRes = await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, { cache: 'no-store' })
    const aggPlans = await plansRes.json().catch(() => []) as any[]

    const { telecomPlans, excludedPlans } = filterPlansByExcludedBenefits(aggPlans)
    for (const excludedPlan of excludedPlans) {
      await supabaseRest(`agg_plans?id=eq.${excludedPlan.id}`, { method: 'DELETE' }).catch(() => {})
      excludedBenefitPlans++
    }

    if (telecomPlans.length === 0) {
      await setOperatorAndPlanStatus(op.id, 'inactive', { operator_domain: 'NON_MOBILE' })
      await aggInsertOperatorDomainAudit({
        operatorId: String(op.id),
        operatorName,
        countryIso3,
        providerCode: config.code,
        syncRunId,
        detectedDomain: 'UNKNOWN',
        confidence: 0,
        classificationSource: 'plan_filter',
        matchedRules: [],
        matchedKeywords: [],
        rejectionReason: 'NO_PLANS_AFTER_BENEFIT_FILTER',
        registryMatch: false,
        matchMethod: null,
        telecomScore: 0,
        decision: 'INACTIVE',
        domainBreakdown: {},
      }).catch(() => {})
      inactiveCount++
      continue
    }

    const fastPath = evaluateRegistryFastPath(operatorName, countryIso3, registryMatcher, countryName)

    if (fastPath.eligible && fastPath.registryMatch) {
      const registryMatch = fastPath.registryMatch
      await setOperatorAndPlanStatus(op.id, 'active', REGISTRY_DOMAIN_FIELDS)
      await aggInsertOperatorDomainAudit({
        operatorId: String(op.id),
        operatorName,
        countryIso3,
        providerCode: config.code,
        syncRunId,
        detectedDomain: 'MOBILE',
        confidence: 99,
        classificationSource: REGISTRY_VERIFIED_SOURCE,
        matchedRules: [`registry_${registryMatch.matchMethod}`],
        matchedKeywords: [registryMatch.matchedValue, registryMatch.row.operatorName],
        rejectionReason: fastPath.reason,
        registryMatch: true,
        matchMethod: registryMatch.matchMethod,
        telecomScore: 1,
        decision: 'ACTIVE',
        domainBreakdown: {
          registryOperator: registryMatch.row.operatorName,
          registryNormalizedName: registryMatch.row.normalizedName,
        },
      }).catch(() => {})
      activeCount++
      continue
    }

    await setOperatorAndPlanStatus(op.id, 'inactive', {
      operator_domain: 'NON_MOBILE',
      domain_classification_source: 'domain_operator_registry_miss',
    })
    await aggInsertOperatorDomainAudit({
      operatorId: String(op.id),
      operatorName,
      countryIso3,
      providerCode: config.code,
      syncRunId,
      detectedDomain: 'UNKNOWN',
      confidence: 0,
      classificationSource: 'domain_operator_registry_miss',
      matchedRules: [],
      matchedKeywords: [],
      rejectionReason: fastPath.blocked
        ? fastPath.reason
        : 'NOT_IN_DOMAIN_OPERATOR_REGISTRY',
      registryMatch: false,
      matchMethod: null,
      telecomScore: 0,
      decision: 'INACTIVE',
      domainBreakdown: {},
    }).catch(() => {})
    inactiveCount++
  }

  return {
    success: true,
    message: `Step 4 complete. Registry filter: ${activeCount} active, ${inactiveCount} inactive. Removed ${excludedBenefitPlans} excluded-benefit plans.`,
    data: {
      evaluated: aggOps.length,
      active: activeCount,
      inactive: inactiveCount,
      excludedBenefitPlans,
    },
  }
}
