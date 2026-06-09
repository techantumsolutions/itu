import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadCatalogIntelligenceRegistries,
  aggUpsertSystemOperator,
  aggUpsertOperatorMapping,
  aggUpsertSystemPlan,
  aggUpsertPlanMapping,
  aggInsertOperatorDomainAudit,
  aggMergeDuplicateSystemOperators,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine, isMobileTelecomDomain } from '@/lib/aggregator/catalog-intelligence'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { extractRawPlanFields } from '@/lib/aggregator/telecom-validator'
import { buildSystemPlanInput } from '@/lib/aggregator/plan-normalizer'
import { createOrGetInternalPlan } from '@/lib/aggregator/sync-service'
import { OperatorTrustEngine } from '@/lib/aggregator/catalog-intelligence/trust-engine'

export async function runStep7Promote(
  providerId: string,
  config: any,
  syncRunId?: string | null
): Promise<{ success: boolean; message: string; data?: any }> {
  const { trustedOperators, domainRegistry, nonTelecomRegistry } = await aggLoadCatalogIntelligenceRegistries().catch(() => ({
    trustedOperators: [],
    domainRegistry: [],
    nonTelecomRegistry: [],
  }))
  const catalogEngine = new CatalogIntelligenceEngine(trustedOperators, domainRegistry, nonTelecomRegistry)
  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  let promotedOps = 0
  let promotedPlans = 0
  let skippedNonMobile = 0

  for (const op of aggOps) {
    const plansRes = await supabaseRest(`agg_plans?operator_id=eq.${op.id}&status=eq.active&service_domain=eq.MOBILE`, { cache: 'no-store' })
    const aggPlans = (await plansRes.json().catch(() => [])) as any[]

    // Filter out plans having benefits array containing "DigitalProduct"
    const digitalProductPlans: any[] = []
    const telecomPlans = aggPlans.filter((plan) => {
      const raw = plan.raw_response || {}
      const rawBenefits = raw.Benefits || raw.benefits || raw.BenefitsJson || []
      let isDigital = false
      if (Array.isArray(rawBenefits)) {
        isDigital = rawBenefits.some(b => 
          b === 'DigitalProduct' || 
          (typeof b === 'object' && b !== null && (b.type === 'DigitalProduct' || b.Type === 'DigitalProduct'))
        )
      }
      if (isDigital) {
        digitalProductPlans.push(plan)
        return false
      }
      return true
    })

    // Remove digital product plans from agg_plans
    for (const dpPlan of digitalProductPlans) {
      await supabaseRest(`agg_plans?id=eq.${dpPlan.id}`, {
        method: 'DELETE',
      }).catch(() => {})

      const mapRes = await supabaseRest(`plan_mappings?service_provider_id=eq.${providerId}&provider_plan_id=eq.${dpPlan.aggregator_plan_id}&limit=1`, { cache: 'no-store' })
      const mapRows = await mapRes.json().catch(() => []) as any[]
      if (mapRows[0]?.system_plan_id) {
        await supabaseRest(`system_plans?id=eq.${mapRows[0].system_plan_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'INACTIVE' })
        }).catch(() => {})
      }
    }

    if (telecomPlans.length === 0) {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'DELETE',
      }).catch(() => {})

      // If we have an existing mapping to a system operator, set it to INACTIVE as well as its plans
      const rawOpRes = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(op.name)}&limit=1`, { cache: 'no-store' })
      const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
      const rawOpId = rawOpRows[0]?.id
      if (rawOpId) {
        const opMapRes = await supabaseRest(`operator_mappings?service_provider_id=eq.${providerId}&provider_operator_raw_id=eq.${rawOpId}&limit=1`, { cache: 'no-store' })
        const opMapRows = await opMapRes.json().catch(() => []) as any[]
        if (opMapRows[0]?.system_operator_id) {
          const sysOpId = opMapRows[0].system_operator_id
          await supabaseRest(`system_operators?id=eq.${sysOpId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'INACTIVE' })
          }).catch(() => {})

          await supabaseRest(`system_plans?system_operator_id=eq.${sysOpId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'INACTIVE' })
          }).catch(() => {})
        }
      }
      continue
    }

    const domainEval = catalogEngine.evaluateOperatorDomain({
      operatorName: op.name,
      countryCode: op.country_iso3,
      rawPlans: telecomPlans.map((p) => p.raw_response || {}),
    })

    if (!isMobileTelecomDomain(domainEval.domain)) {
      skippedNonMobile++
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'inactive',
          operator_domain: domainEval.domain,
          operator_domain_confidence: domainEval.confidence,
          domain_classification_source: domainEval.classificationSource,
        }),
      }).catch(() => {})
      // Also deactivate the remaining plans
      await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      }).catch(() => {})
      await aggInsertOperatorDomainAudit({
        operatorId: String(op.id),
        operatorName: op.name,
        providerCode: config.code,
        detectedDomain: domainEval.domain,
        confidence: domainEval.confidence,
        classificationSource: domainEval.classificationSource,
        matchedRules: domainEval.matchedRules,
        matchedKeywords: domainEval.matchedKeywords,
        rejectionReason: domainEval.rejectionReason ?? `NON_MOBILE_DOMAIN:${domainEval.domain}`,
        domainBreakdown: domainEval.domainBreakdown,
      }).catch(() => {})
      continue
    }

    // Build fake plan matching standard provider raw operators mapper
    const testPlan = {
      providerId,
      providerCode: config.code,
      countryIso3: op.country_iso3,
      operatorName: op.name,
      operatorRef: `system_promote:${op.id}`,
      service: telecomPlans[0].type || 'Mobile',
      raw: op.raw_response,
    } as any

    // Promoted System Operator
    const systemOperatorInput = buildSystemOperatorInput(testPlan, op.name)
    systemOperatorInput.operatorDomain = domainEval.domain
    systemOperatorInput.operatorDomainConfidence = domainEval.confidence
    systemOperatorInput.domainClassificationSource = domainEval.classificationSource
    systemOperatorInput.serviceDomain = 'MOBILE'
    systemOperatorInput.serviceDomainConfidence = domainEval.confidence
    systemOperatorInput.serviceDomainSource = domainEval.classificationSource
    const systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
    if (!systemOperator?.id) continue

    promotedOps++

    // Storing mappings
    // Resolve providerOperatorRawId
    const rawOpRes = await supabaseRest(`provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(op.name)}&limit=1`, { cache: 'no-store' })
    const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
    const rawOpId = rawOpRows[0]?.id

    if (rawOpId) {
      await aggUpsertOperatorMapping({
        serviceProviderId: providerId,
        providerOperatorRawId: rawOpId,
        systemOperatorId: systemOperator.id,
        mappingConfidence: 100,
        mappingType: 'AUTO',
        isVerified: false,
      })
    }

    for (const plan of telecomPlans) {
      // Promoting plans
      const fields = extractRawPlanFields(plan.raw_response)
      const serviceStr = fields.serviceName || (plan.type === 'DATA' || String(plan.type).toUpperCase().includes('DATA') ? 'Data' : 'Mobile')
      const subserviceStr = fields.subserviceName || undefined

      const normalizedPlanForUpsert = {
        providerId,
        providerCode: config.code,
        providerPlanId: String(plan.aggregator_plan_id),
        countryIso3: op.country_iso3,
        operatorRef: `system:${systemOperator.id}`,
        operatorName: op.name,
        service: serviceStr,
        subservice: subserviceStr,
        name: plan.name,
        description: plan.description || '',
        category: plan.type,
        subcategory: '',
        planType: plan.type,
        benefits: [], // System plans will be enriched/filtered next
        requiredFields: [],
        retailAmount: plan.retail_amount || 0,
        retailCurrency: plan.currency_unit || 'USD',
        raw: plan.raw_response || {}
      } as any

      const internal = await createOrGetInternalPlan(normalizedPlanForUpsert)
      if (!internal.plan?.id) continue

      const systemPlan = await aggUpsertSystemPlan(
        buildSystemPlanInput({
          plan: normalizedPlanForUpsert,
          systemOperatorId: systemOperator.id,
          internalPlanId: internal.plan.id,
        })
      )

      if (systemPlan?.id) {
        promotedPlans++

        // Link mappings
        const rawPlanRes = await supabaseRest(`provider_plans_raw?provider_id=eq.${providerId}&provider_plan_id=eq.${plan.aggregator_plan_id}&limit=1`, { cache: 'no-store' })
        const rawPlanRows = await rawPlanRes.json().catch(() => []) as any[]
        const rawPlanId = rawPlanRows[0]?.id

        if (rawPlanId) {
          await aggUpsertPlanMapping({
            serviceProviderId: providerId,
            providerPlanRawId: rawPlanId,
            systemPlanId: systemPlan.id,
            matchingScore: 100,
            matchingReason: 'Promoted step staging match',
            isVerified: false,
          })
        }
      }
    }

    // Learn from promotion in trust engine
    if (systemOperator?.id) {
      await OperatorTrustEngine.learnFromPromotion(
        systemOperator.id,
        op.name,
        op.country_iso3 || '*',
        providerId,
        telecomPlans.length,
        telecomPlans.length
      ).catch(err => {
        console.error('[SyncStep] Failed OperatorTrustEngine learning:', err)
      })
    }
  }

  // Merge duplicate system operators
  let mergedCount = 0
  try {
    mergedCount = await aggMergeDuplicateSystemOperators('system-sync')
  } catch (mergeErr) {
    console.error('Failed to merge duplicate system operators:', mergeErr)
  }

  return {
    success: true,
    message: `Staging promotion complete. Promoted ${promotedOps} MOBILE operators and ${promotedPlans} system plans. Skipped ${skippedNonMobile} non-mobile domain operators. Merged ${mergedCount} duplicate operators.`,
    data: {
      promotedOps,
      promotedPlans,
      skippedNonMobile,
      mergedCount,
    },
  }
}
