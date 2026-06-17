import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadCatalogIntelligenceRegistries,
  aggUpsertSystemOperator,
  aggUpsertOperatorMapping,
  aggUpsertSystemPlan,
  aggUpsertPlanMapping,
  aggInsertOperatorDomainAudit,
} from '@/lib/aggregator/repository'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import {
  extractRawPlanFields,
  shouldBlockOperatorAsNonMobile,
} from '@/lib/aggregator/telecom-validator'
import { buildSystemPlanInput } from '@/lib/aggregator/plan-normalizer'
import { createOrGetInternalPlan } from '@/lib/aggregator/sync-service'
import { OperatorTrustEngine } from '@/lib/aggregator/catalog-intelligence/trust-engine'
import { dbUpsertInternalPlanMapping } from '@/lib/uti/repository'
import {
  createRegistryMatcher,
  evaluateRegistryFastPath,
  filterPlansByExcludedBenefits,
  isRegistryVerifiedOperator,
  REGISTRY_VERIFIED_SOURCE,
} from '@/lib/aggregator/pipeline/registry-fast-path'

async function deactivateMappedSystemOperator(providerId: string, operatorName: string) {
  const rawOpRes = await supabaseRest(
    `provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(operatorName)}&limit=1`,
    { cache: 'no-store' },
  )
  const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
  const rawOpId = rawOpRows[0]?.id
  if (!rawOpId) return

  const opMapRes = await supabaseRest(
    `operator_mappings?service_provider_id=eq.${providerId}&provider_operator_raw_id=eq.${rawOpId}&limit=1`,
    { cache: 'no-store' },
  )
  const opMapRows = await opMapRes.json().catch(() => []) as any[]
  if (!opMapRows[0]?.system_operator_id) return

  const sysOpId = opMapRows[0].system_operator_id
  await supabaseRest(`system_operators?id=eq.${sysOpId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'INACTIVE' }),
  }).catch(() => {})
  await supabaseRest(`system_plans?system_operator_id=eq.${sysOpId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'INACTIVE' }),
  }).catch(() => {})
}

async function promoteOperatorPlans(input: {
  providerId: string
  config: any
  op: any
  systemOperatorId: string
  telecomPlans: any[]
  displayOperatorName: string
}): Promise<number> {
  let promotedPlans = 0

  for (const plan of input.telecomPlans) {
    const fields = extractRawPlanFields(plan.raw_response)
    const serviceStr = fields.serviceName || (plan.type === 'DATA' || String(plan.type).toUpperCase().includes('DATA') ? 'Data' : 'Mobile')
    const subserviceStr = fields.subserviceName || undefined

    const normalizedPlanForUpsert = {
      providerId: input.providerId,
      providerCode: input.config.code,
      providerPlanId: String(plan.aggregator_plan_id),
      countryIso3: input.op.country_iso3,
      operatorRef: `system:${input.systemOperatorId}`,
      operatorName: input.displayOperatorName,
      service: serviceStr,
      subservice: subserviceStr,
      name: plan.name,
      description: plan.description || '',
      category: plan.type,
      subcategory: '',
      planType: plan.type,
      benefits: [],
      requiredFields: [],
      retailAmount: plan.retail_amount || 0,
      retailCurrency: plan.currency_unit || 'USD',
      raw: plan.raw_response || {},
    } as any

    const internal = await createOrGetInternalPlan(normalizedPlanForUpsert)
    if (!internal.plan?.id) continue

    const systemPlan = await aggUpsertSystemPlan(
      buildSystemPlanInput({
        plan: normalizedPlanForUpsert,
        systemOperatorId: input.systemOperatorId,
        internalPlanId: internal.plan.id,
      }),
    )

    if (!systemPlan?.id) continue
    promotedPlans++

    const rawPlanRes = await supabaseRest(
      `provider_plans_raw?provider_id=eq.${input.providerId}&provider_plan_id=eq.${plan.aggregator_plan_id}&limit=1`,
      { cache: 'no-store' },
    )
    const rawPlanRows = await rawPlanRes.json().catch(() => []) as any[]
    const rawPlanId = rawPlanRows[0]?.id

    if (rawPlanId) {
      await aggUpsertPlanMapping({
        serviceProviderId: input.providerId,
        providerPlanRawId: rawPlanId,
        providerPlanId: String(plan.aggregator_plan_id),
        systemPlanId: systemPlan.id,
        matchingScore: 100,
        matchingReason: isRegistryVerifiedOperator(input.op)
          ? 'Registry fast path promotion'
          : 'Promoted step staging match',
        isVerified: isRegistryVerifiedOperator(input.op),
      })
    }

    await dbUpsertInternalPlanMapping({
      internalPlanId: internal.plan.id,
      providerId: input.providerId,
      providerPlanId: String(plan.aggregator_plan_id),
      providerPrice: plan.retail_amount ?? 0,
      providerCurrency: plan.currency_unit || 'USD',
      providerPriority: input.config.priority ?? 100,
      margin: 0,
      enabled: true,
    }).catch((err) => {
      console.error('Failed to upsert internal_plan_provider_mapping in promote stage:', err)
    })
  }

  return promotedPlans
}

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
  const registryMatcher = await createRegistryMatcher()

  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  let promotedOps = 0
  let promotedPlans = 0
  let registryPromotedOps = 0
  let skippedNonMobile = 0

  for (const op of aggOps) {
    const operatorName = op.name || op.operator_name
    const countryIso3 = String(op.country_iso3 ?? '').toUpperCase()
    const registryVerified = isRegistryVerifiedOperator(op)

    const plansQuery = registryVerified
      ? `agg_plans?operator_id=eq.${op.id}&status=eq.active`
      : `agg_plans?operator_id=eq.${op.id}&status=eq.active&service_domain=eq.MOBILE`
    const plansRes = await supabaseRest(plansQuery, { cache: 'no-store' })
    const aggPlans = (await plansRes.json().catch(() => [])) as any[]

    if (shouldBlockOperatorAsNonMobile(operatorName, op.operator_domain)) {
      skippedNonMobile++
      await supabaseRest(`agg_operators?id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      }).catch(() => {})
      await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      }).catch(() => {})
      continue
    }

    const { telecomPlans, excludedPlans } = filterPlansByExcludedBenefits(aggPlans)
    for (const dpPlan of excludedPlans) {
      await supabaseRest(`agg_plans?id=eq.${dpPlan.id}`, { method: 'DELETE' }).catch(() => {})
      const mapRes = await supabaseRest(
        `plan_mappings?service_provider_id=eq.${providerId}&provider_plan_id=eq.${dpPlan.aggregator_plan_id}&limit=1`,
        { cache: 'no-store' },
      )
      const mapRows = await mapRes.json().catch(() => []) as any[]
      if (mapRows[0]?.system_plan_id) {
        await supabaseRest(`system_plans?id=eq.${mapRows[0].system_plan_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'INACTIVE' }),
        }).catch(() => {})
      }
    }

    if (telecomPlans.length === 0) {
      await supabaseRest(`agg_operators?id=eq.${op.id}`, { method: 'DELETE' }).catch(() => {})
      await deactivateMappedSystemOperator(providerId, operatorName)
      continue
    }

    let displayOperatorName = operatorName
    let domainSource = op.domain_classification_source || 'catalog_intelligence'
    let domain = op.operator_domain || 'MOBILE'
    let domainConfidence = op.operator_domain_confidence ?? 0

    if (registryVerified) {
      const fastPath = evaluateRegistryFastPath(operatorName, countryIso3, registryMatcher)
      if (fastPath.registryMatch) {
        displayOperatorName = fastPath.registryMatch.row.operatorName
      }
      domain = 'MOBILE'
      domainConfidence = 99
      domainSource = REGISTRY_VERIFIED_SOURCE
    } else {
      const domainEval = catalogEngine.evaluateOperatorDomain({
        operatorName,
        countryCode: countryIso3,
        rawPlans: telecomPlans.map((p) => p.raw_response || {}),
      })

      if (shouldBlockOperatorAsNonMobile(operatorName, domainEval.domain)) {
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
        await supabaseRest(`agg_plans?operator_id=eq.${op.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'inactive' }),
        }).catch(() => {})
        await aggInsertOperatorDomainAudit({
          operatorId: String(op.id),
          operatorName,
          countryIso3,
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

      domain = domainEval.domain
      domainConfidence = domainEval.confidence
      domainSource = domainEval.classificationSource
    }

    const testPlan = {
      providerId,
      providerCode: config.code,
      countryIso3: op.country_iso3,
      operatorName: displayOperatorName,
      operatorRef: `system_promote:${op.id}`,
      service: telecomPlans[0].type || 'Mobile',
      raw: op.raw_response,
    } as any

    const systemOperatorInput = buildSystemOperatorInput(testPlan, displayOperatorName)
    if (!systemOperatorInput) continue

    systemOperatorInput.operatorDomain = domain
    systemOperatorInput.operatorDomainConfidence = domainConfidence
    systemOperatorInput.domainClassificationSource = domainSource
    systemOperatorInput.serviceDomain = 'MOBILE'
    systemOperatorInput.serviceDomainConfidence = domainConfidence
    systemOperatorInput.serviceDomainSource = domainSource
    systemOperatorInput.status = 'ACTIVE'

    const systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
    if (!systemOperator?.id) continue

    promotedOps++
    if (registryVerified) registryPromotedOps++

    const rawOpRes = await supabaseRest(
      `provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(operatorName)}&limit=1`,
      { cache: 'no-store' },
    )
    const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
    const rawOpId = rawOpRows[0]?.id

    if (rawOpId) {
      await aggUpsertOperatorMapping({
        serviceProviderId: providerId,
        providerOperatorRawId: rawOpId,
        systemOperatorId: systemOperator.id,
        mappingConfidence: registryVerified ? 100 : 100,
        mappingType: registryVerified ? 'REGISTRY' : 'AUTO',
        isVerified: registryVerified,
      })
    }

    const planCount = await promoteOperatorPlans({
      providerId,
      config,
      op,
      systemOperatorId: systemOperator.id,
      telecomPlans,
      displayOperatorName,
    })
    promotedPlans += planCount

    if (systemOperator.id) {
      await OperatorTrustEngine.learnFromPromotion(
        systemOperator.id,
        displayOperatorName,
        countryIso3 || '*',
        providerId,
        telecomPlans.length,
        telecomPlans.length,
      ).catch((err) => {
        console.error('[SyncStep] Failed OperatorTrustEngine learning:', err)
      })
    }
  }

  return {
    success: true,
    message: `Promotion complete. Promoted ${promotedOps} operators (${registryPromotedOps} registry fast path) and ${promotedPlans} system plans. Skipped ${skippedNonMobile} non-mobile operators.`,
    data: {
      promotedOps,
      promotedPlans,
      registryPromotedOps,
      skippedNonMobile,
    },
  }
}
