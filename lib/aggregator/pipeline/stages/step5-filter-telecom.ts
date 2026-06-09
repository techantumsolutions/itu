import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadCatalogIntelligenceRegistries,
  aggInsertOperatorDomainAudit,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine, isMobileTelecomDomain } from '@/lib/aggregator/catalog-intelligence'
import { validateRawOperatorPlans } from '@/lib/aggregator/telecom-validator'

export async function runStep5FilterTelecom(
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

  let activeCount = 0
  let inactiveCount = 0
  let reviewCount = 0
  let mobileCount = 0

  for (const op of aggOps) {
    const plansRes = await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, { cache: 'no-store' })
    const aggPlans = await plansRes.json().catch(() => []) as any[]

    // Filter out digital product plans in telecom check
    const digitalProductPlans: any[] = []
    const telecomPlans = aggPlans.filter((p) => {
      const raw = p.raw_response || {}
      const rawBenefits = raw.Benefits || raw.benefits || raw.BenefitsJson || []
      let isDigital = false
      if (Array.isArray(rawBenefits)) {
        isDigital = rawBenefits.some(b => 
          b === 'DigitalProduct' || 
          (typeof b === 'object' && b !== null && (b.type === 'DigitalProduct' || b.Type === 'DigitalProduct'))
        )
      }
      if (isDigital) {
        digitalProductPlans.push(p)
        return false
      }
      return true
    })

    for (const dpPlan of digitalProductPlans) {
      await supabaseRest(`agg_plans?id=eq.${dpPlan.id}`, {
        method: 'DELETE',
      }).catch(() => {})
    }

    if (telecomPlans.length === 0) {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'DELETE',
      }).catch(() => {})
      inactiveCount++
      continue
    }

    const validatorPlans = telecomPlans.map((p) => ({
      raw: p.raw_response || {},
      benefits: Array.isArray(p.raw_response?.benefits || p.raw_response?.Benefits)
        ? (p.raw_response?.benefits || p.raw_response?.Benefits)
        : []
    })) as any[]

    const operatorName = op.operator_name || op.name
    const domainEval = catalogEngine.evaluateOperatorDomain({
      operatorName,
      countryCode: op.country_iso3,
      rawPlans: validatorPlans.map((p) => p.raw),
    })

    await supabaseRest(`agg_operators?id=eq.${op.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        operator_domain: domainEval.domain,
        operator_domain_confidence: domainEval.confidence,
        domain_classification_source: domainEval.classificationSource,
      }),
    }).catch(() => {})

    await aggInsertOperatorDomainAudit({
      operatorId: String(op.id),
      operatorName,
      providerCode: config.code,
      detectedDomain: domainEval.domain,
      confidence: domainEval.confidence,
      classificationSource: domainEval.classificationSource,
      matchedRules: domainEval.matchedRules,
      matchedKeywords: domainEval.matchedKeywords,
      rejectionReason: domainEval.rejectionReason ?? null,
      domainBreakdown: domainEval.domainBreakdown,
    }).catch(() => {})

    const validation = validateRawOperatorPlans(validatorPlans, {
      operatorName,
      countryCode: op.country_iso3,
      engine: catalogEngine,
    })

    if (isMobileTelecomDomain(domainEval.domain) && validation.passed) {
      activeCount++
      mobileCount++
    } else if (domainEval.isBlockedFromTelecom || !isMobileTelecomDomain(domainEval.domain)) {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })
      await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })
      inactiveCount++
    } else if (validation.promotion?.shouldDeactivate) {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })
      await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      })
      inactiveCount++
    } else {
      reviewCount++
      activeCount++
    }
  }

  return {
    success: true,
    message: `Filter 1 (Domain + Catalog Intelligence) applied. Evaluated ${aggOps.length} staging operators. Mobile/Telecom active: ${mobileCount}, Review/Uncertain: ${reviewCount}, Excluded non-mobile: ${inactiveCount}.`,
    data: {
      evaluated: aggOps.length,
      active: mobileCount,
      review: reviewCount,
      inactive: inactiveCount,
    },
  }
}
