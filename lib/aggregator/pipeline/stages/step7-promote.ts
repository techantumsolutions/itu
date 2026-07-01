import { supabaseRest } from '@/lib/db/supabase-rest'
import {
  aggLoadCatalogIntelligenceRegistries,
  aggUpsertSystemOperator,
  aggUpsertOperatorMapping,
  aggUpsertSystemPlan,
  aggRepairOrUpsertPlanMapping,
  aggRepairStalePlanMappingsForAllActiveProviders,
  aggInsertOperatorDomainAudit,
} from '@/lib/aggregator/repository'
import {
  buildProviderRawPlanIndex,
  calculateStep7SyncHealth,
  reconcileAllActiveSystemPlanMappings,
  type ProviderRawPlanSnapshot,
} from '@/lib/aggregator/plan-mapping-reconciliation'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { resolveSystemOperatorIdForSync } from '@/lib/aggregator/resolve-system-operator-id'
import {
  extractRawPlanFields,
  shouldBlockOperatorAsNonMobile,
} from '@/lib/aggregator/telecom-validator'
import { buildSystemPlanInput } from '@/lib/aggregator/plan-normalizer'
import { resolveWholesalePricing } from '@/lib/catalog/provider-wholesale-pricing'
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
import {
  buildRawPlanLookupByAggId,
  type RawPlanAggLookup,
} from '@/lib/aggregator/agg-id-hash'
import {
  logCrossCountrySkip,
  planCountryMatchesOperator,
  resolvePlanCountryCode,
  toCanonicalPlanCountryCode,
} from '@/lib/aggregator/plan-country-resolver'
import {
  logStep7Promotion,
  validateSystemOperatorPromotionInput,
} from '@/lib/aggregator/pipeline/step7-promotion-log'

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

function resolveRawPlanForAggPlan(
  plan: { aggregator_plan_id: number },
  rawPlanByAggId: Map<number, RawPlanAggLookup>,
): RawPlanAggLookup | undefined {
  return rawPlanByAggId.get(Number(plan.aggregator_plan_id))
}

async function promoteOperatorPlans(input: {
  providerId: string
  config: any
  op: any
  systemOperatorId: string
  telecomPlans: any[]
  displayOperatorName: string
  rawPlanByAggId: Map<number, RawPlanAggLookup>
  mappingStats: {
    repaired: number
    created: number
    synced: number
    skipped: number
  }
  rawIndex: Map<string, ProviderRawPlanSnapshot>
  providerActive: boolean
}): Promise<{ promoted: number; skippedCrossCountry: number }> {
  let promotedPlans = 0
  let skippedCrossCountryPlans = 0
  const operatorCountry = toCanonicalPlanCountryCode(input.op.country_iso3)

  for (const plan of input.telecomPlans) {
    const planCountry =
      plan.country_code && String(plan.country_code).trim()
        ? toCanonicalPlanCountryCode(plan.country_code)
        : resolvePlanCountryCode({
            planName: plan.name,
            planDescription: plan.description,
            rawPlan: plan.raw_response,
            operatorCountryIso3: operatorCountry,
          })

    if (!planCountryMatchesOperator(planCountry, operatorCountry)) {
      skippedCrossCountryPlans++
      logCrossCountrySkip('Step7', {
        planId: plan.id,
        planName: plan.name,
        planCountry,
        operatorName: input.displayOperatorName,
        operatorCountry,
        action: 'promotion',
      })
      continue
    }

    const rawPlanEntry = resolveRawPlanForAggPlan(plan, input.rawPlanByAggId)
    const providerPlanId = rawPlanEntry?.provider_plan_id ?? String(plan.aggregator_plan_id)

    const wholesale = rawPlanEntry
      ? resolveWholesalePricing({
          rawJson: rawPlanEntry.raw_json,
          amount: rawPlanEntry.amount,
          currency: rawPlanEntry.currency,
          destinationAmount: rawPlanEntry.destination_amount,
          destinationCurrency: rawPlanEntry.destination_currency,
          retailAmount: plan.retail_amount,
          retailCurrency: plan.currency_unit,
        })
      : resolveWholesalePricing({
          rawJson: plan.raw_response,
          retailAmount: plan.retail_amount,
          retailCurrency: plan.currency_unit,
        })

    const mappedWholesaleAmount = wholesale.wholesaleAmount ?? plan.retail_amount ?? 0
    const mappedWholesaleCurrency = wholesale.wholesaleCurrency ?? plan.currency_unit ?? 'USD'

    const fields = extractRawPlanFields(plan.raw_response)
    const serviceStr = fields.serviceName || (plan.type === 'DATA' || String(plan.type).toUpperCase().includes('DATA') ? 'Data' : 'Mobile')
    const subserviceStr = fields.subserviceName || undefined

    const normalizedPlanForUpsert = {
      providerId: input.providerId,
      providerCode: input.config.code,
      providerPlanId,
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
      retailAmount: mappedWholesaleAmount,
      retailCurrency: mappedWholesaleCurrency,
      wholesaleAmount: wholesale.wholesaleAmount ?? undefined,
      wholesaleCurrency: wholesale.wholesaleCurrency ?? undefined,
      destinationAmount: wholesale.destinationAmount ?? undefined,
      destinationUnit: wholesale.destinationCurrency ?? undefined,
      raw: plan.raw_response || {},
    } as any

    const internal = await createOrGetInternalPlan(normalizedPlanForUpsert)
    if (!internal.plan?.id) continue

    const systemPlan = await aggUpsertSystemPlan(
      buildSystemPlanInput({
        plan: normalizedPlanForUpsert,
        systemOperatorId: input.systemOperatorId,
        internalPlanId: internal.plan.id,
      }, planCountry),
    )

    if (!systemPlan?.id) continue
    promotedPlans++

    const rawPlanId = rawPlanEntry?.id ?? null
    if (providerPlanId) {
      const mappingResult = await aggRepairOrUpsertPlanMapping({
        serviceProviderId: input.providerId,
        systemPlanId: systemPlan.id,
        providerPlanId,
        providerPlanRawId: rawPlanId,
        matchingScore: 100,
        matchingReason: isRegistryVerifiedOperator(input.op)
          ? 'Registry fast path promotion'
          : 'Promoted step staging match',
        isVerified: isRegistryVerifiedOperator(input.op),
        countryCode: planCountry,
        providerPriority: input.config.priority ?? 100,
        providerActive: input.providerActive,
        rawIndex: input.rawIndex,
        providerName: input.config.name ?? null,
        providerCode: input.config.code ?? null,
      }).catch((err) => {
        logStep7Promotion({
          entity: 'plan_mapping',
          operation: 'SKIP',
          providerId: input.providerId,
          providerName: input.config.name,
          providerCode: input.config.code,
          providerPlanId,
          systemPlanId: systemPlan.id,
          countryCode: planCountry,
          reason: 'plan_mapping_repair_failed',
          error: err instanceof Error ? err.message : String(err),
        })
        return null
      })

      if (mappingResult?.action === 'repaired') input.mappingStats.repaired++
      else if (mappingResult?.action === 'created') input.mappingStats.created++
      else if (mappingResult?.action === 'synced') input.mappingStats.synced++
      else if (mappingResult?.action === 'skipped') input.mappingStats.skipped++
    } else if (!rawPlanId) {
      console.warn(
        `[Step7] No provider_plans_raw row for aggregator_plan_id=${plan.aggregator_plan_id} (provider=${input.config.code})`,
      )
    }

    await dbUpsertInternalPlanMapping({
      internalPlanId: internal.plan.id,
      providerId: input.providerId,
      providerPlanId,
      providerPrice: mappedWholesaleAmount,
      providerCurrency: mappedWholesaleCurrency,
      providerPriority: input.config.priority ?? 100,
      margin: 0,
      enabled: input.providerActive,
    }).catch((err) => {
      console.error('Failed to upsert internal_plan_provider_mapping in promote stage:', err)
    })
  }

  return { promoted: promotedPlans, skippedCrossCountry: skippedCrossCountryPlans }
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

  const rawPlanByAggId = await buildRawPlanLookupByAggId(providerId, async (offset, limit) => {
    const res = await supabaseRest(
      `provider_plans_raw?provider_id=eq.${providerId}&select=id,provider_plan_id,amount,currency,destination_amount,destination_currency,raw_json&order=fetched_at.desc&limit=${limit}&offset=${offset}`,
      { cache: 'no-store' },
    )
    return (await res.json().catch(() => [])) as RawPlanAggLookup[]
  })
  const rawIndex = await buildProviderRawPlanIndex(providerId)
  const providerActive = config.is_active !== false

  const opsRes = await supabaseRest(`agg_operators?provider=eq.${config.code}&status=eq.active`, { cache: 'no-store' })
  const aggOps = await opsRes.json().catch(() => []) as any[]

  let promotedOps = 0
  let promotedPlans = 0
  let skippedCrossCountryPlans = 0
  let registryPromotedOps = 0
  let skippedNonMobile = 0
  let skippedInvalidOperators = 0
  const mappingStats = { repaired: 0, created: 0, synced: 0, skipped: 0 }
  const providerLabel = config.name || config.code || providerId

  for (const op of aggOps) {
    try {
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
      const excludedProviderPlanId =
        resolveRawPlanForAggPlan(dpPlan, rawPlanByAggId)?.provider_plan_id ??
        String(dpPlan.aggregator_plan_id)
      const mapRes = await supabaseRest(
        `plan_mappings?service_provider_id=eq.${providerId}&provider_plan_id=eq.${encodeURIComponent(excludedProviderPlanId)}&limit=1`,
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
    if (!systemOperatorInput) {
      skippedInvalidOperators++
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        providerId,
        providerName: providerLabel,
        providerCode: config.code,
        providerOperatorName: operatorName,
        country: countryIso3,
        reason: 'build_system_operator_input_failed',
      })
      continue
    }

    const operatorValidation = validateSystemOperatorPromotionInput(systemOperatorInput)
    if (!operatorValidation.ok) {
      skippedInvalidOperators++
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        providerId,
        providerName: providerLabel,
        providerCode: config.code,
        providerOperatorName: operatorName,
        country: countryIso3,
        systemOperatorName: systemOperatorInput.systemOperatorName,
        reason: operatorValidation.reason,
      })
      continue
    }

    systemOperatorInput.operatorDomain = domain
    systemOperatorInput.operatorDomainConfidence = domainConfidence
    systemOperatorInput.domainClassificationSource = domainSource
    systemOperatorInput.serviceDomain = 'MOBILE'
    systemOperatorInput.serviceDomainConfidence = domainConfidence
    systemOperatorInput.serviceDomainSource = domainSource
    systemOperatorInput.status = 'ACTIVE'

    const rawOpRes = await supabaseRest(
      `provider_operator_raw?service_provider_id=eq.${providerId}&provider_operator_name=eq.${encodeURIComponent(operatorName)}&limit=1`,
      { cache: 'no-store' },
    )
    const rawOpRows = await rawOpRes.json().catch(() => []) as any[]
    const rawOpId = rawOpRows[0]?.id
    const providerOperatorId = rawOpRows[0]?.provider_operator_id

    let systemOperatorId: string | null = await resolveSystemOperatorIdForSync({
      serviceProviderId: providerId,
      providerOperatorId: providerOperatorId ? String(providerOperatorId) : String(op.aggregator_operator_id ?? ''),
      providerOperatorRawId: rawOpId,
      providerOperatorName: operatorName,
      countryIso3,
      telecomOperatorName: displayOperatorName,
    })

    let systemOperator: { id?: string } | null = null
    try {
      if (!systemOperatorId) {
        systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
        systemOperatorId = systemOperator?.id ?? null
      } else {
        systemOperator = { id: systemOperatorId }
        await aggUpsertSystemOperator(systemOperatorInput)
      }
    } catch (operatorErr) {
      skippedInvalidOperators++
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        providerId,
        providerName: providerLabel,
        providerCode: config.code,
        providerOperatorId: providerOperatorId ? String(providerOperatorId) : null,
        providerOperatorName: operatorName,
        country: countryIso3,
        systemOperatorId,
        systemOperatorName: systemOperatorInput.systemOperatorName,
        reason: 'operator_upsert_failed',
        error: operatorErr instanceof Error ? operatorErr.message : String(operatorErr),
      })
      continue
    }

    if (!systemOperatorId) {
      skippedInvalidOperators++
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        providerId,
        providerName: providerLabel,
        providerCode: config.code,
        providerOperatorName: operatorName,
        country: countryIso3,
        systemOperatorName: systemOperatorInput.systemOperatorName,
        reason: 'operator_upsert_returned_no_id',
      })
      continue
    }

    promotedOps++
    if (registryVerified) registryPromotedOps++

    if (rawOpId) {
      await aggUpsertOperatorMapping({
        serviceProviderId: providerId,
        providerOperatorRawId: rawOpId,
        systemOperatorId: systemOperatorId,
        mappingConfidence: registryVerified ? 100 : 100,
        mappingType: registryVerified ? 'REGISTRY' : 'AUTO',
        isVerified: registryVerified,
      })
    }

    const planResult = await promoteOperatorPlans({
      providerId,
      config,
      op,
      systemOperatorId: systemOperatorId,
      telecomPlans,
      displayOperatorName,
      rawPlanByAggId,
      mappingStats,
      rawIndex,
      providerActive,
    })
    promotedPlans += planResult.promoted
    skippedCrossCountryPlans += planResult.skippedCrossCountry

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
    } catch (operatorLoopErr) {
      skippedInvalidOperators++
      logStep7Promotion({
        entity: 'operator',
        operation: 'SKIP',
        providerId,
        providerName: providerLabel,
        providerCode: config.code,
        providerOperatorName: op?.name || op?.operator_name,
        country: String(op?.country_iso3 ?? '').toUpperCase() || null,
        reason: 'operator_promotion_loop_failed',
        error: operatorLoopErr instanceof Error ? operatorLoopErr.message : String(operatorLoopErr),
      })
    }
  }

  const activePlanReconciliation = await reconcileAllActiveSystemPlanMappings()
  const allProviderReconciliation = await aggRepairStalePlanMappingsForAllActiveProviders()
  const syncHealth = await calculateStep7SyncHealth()

  console.log(
    [
      '[Step7 Mapping Validation]',
      `Provider=${providerLabel}`,
      `Promoted plans=${promotedPlans}`,
      `Promotion repaired=${mappingStats.repaired}`,
      `Promotion created=${mappingStats.created}`,
      `Promotion pricing synced=${mappingStats.synced}`,
      `Promotion skipped=${mappingStats.skipped}`,
      `Skipped invalid operators=${skippedInvalidOperators}`,
      `Active-plan reconciliation raw fixed=${activePlanReconciliation.staleRawIdsFixed}`,
      `Active-plan pricing synced=${activePlanReconciliation.pricingSynced}`,
      `All-provider raw fixed=${allProviderReconciliation.totals.staleRawIdsFixed}`,
      `All-provider pricing synced=${allProviderReconciliation.totals.pricingSynced}`,
      `Missing mappings=${allProviderReconciliation.totals.missingMappings}`,
      `[Step7 Sync Health]`,
      `total_system_plans=${syncHealth.totalSystemPlans}`,
      `active_system_plans=${syncHealth.activeSystemPlans}`,
      `mapped_system_plans=${syncHealth.mappedSystemPlans}`,
      `healthy_system_plans=${syncHealth.healthySystemPlans}`,
      `health_ratio=${(syncHealth.healthRatio * 100).toFixed(1)}%`,
      `status=${syncHealth.status}`,
    ].join('\n'),
  )

  if (syncHealth.status === 'WARNING') {
    console.warn(
      `[Step7 Sync Health] WARNING: healthy_system_plans (${syncHealth.healthySystemPlans}) is below 95% of active_system_plans (${syncHealth.activeSystemPlans})`,
    )
  }

  if (allProviderReconciliation.totals.missingMappings > 0) {
    console.warn(
      `[Step7 Mapping Validation] ${allProviderReconciliation.totals.missingMappings} mapping(s) could not be linked to a current provider_plans_raw row`,
    )
  }

  return {
    success: true,
    message: `Promotion complete. Promoted ${promotedOps} operators (${registryPromotedOps} registry fast path) and ${promotedPlans} system plans. Skipped ${skippedNonMobile} non-mobile operators, ${skippedInvalidOperators} invalid/failed operators, and ${skippedCrossCountryPlans} cross-country plans.${syncHealth.status === 'WARNING' ? ' Sync health WARNING (<95% mapped plans have live raw links).' : ''}`,
    data: {
      promotedOps,
      promotedPlans,
      registryPromotedOps,
      skippedNonMobile,
      skippedInvalidOperators,
      skippedCrossCountryPlans,
      mappingValidation: {
        existingMappingsRepaired: mappingStats.repaired,
        newMappingsCreated: mappingStats.created,
        promotionPricingSynced: mappingStats.synced,
        promotionMappingsSkipped: mappingStats.skipped,
        activePlanReconciliation,
        allProviderReconciliation: allProviderReconciliation.totals,
        staleRawIdsFixed: allProviderReconciliation.totals.staleRawIdsFixed,
        missingMappings: allProviderReconciliation.totals.missingMappings,
      },
      syncHealth,
    },
  }
}
