import { getConnector } from '@/lib/providers/registry'
import type { NormalizedPlan, ProviderConfig } from '@/lib/providers/types'
import { fingerprintPlan } from '@/lib/uti/normalize'
import {
  dbCreateInternalPlan,
  dbFindInternalPlanByHash,
  dbUpsertInternalPlanMapping,
} from '@/lib/uti/repository'
import { cacheDelByPrefix } from '@/lib/cache/redis'
import { rowToProviderConfig } from '@/lib/lcr-v2/provider-credentials'
import {
  classifyProviderOperatorRecord,
  formatSkippedOperatorLog,
  isGenuineTelecomOperatorName,
  operatorNameConfidenceScore,
  operatorTypeForKind,
  resolveTelecomOperatorName,
} from '@/lib/aggregator/operator-classifier'
import {
  canUseDynamicClassification,
  classifyTelecomRecordDynamic,
  normalizeOperatorNameDynamic,
  scoreAggregateOperatorCandidate,
} from '@/lib/aggregator/dynamic-classifier'
import {
  aggInsertTransformAudit,
  aggUpsertAggregateOperator,
  aggUpsertAggregateOperatorMapping,
  aggUpsertOperatorAlias,
  aggUpsertSystemOperatorLineage,
} from '@/lib/aggregator/dynamic-repository'
import {
  createSyncDiagnostics,
  logCountryMapping,
  logOperatorDecision,
  printPipelineReport,
  summarizeDiagnostics,
} from '@/lib/aggregator/sync-diagnostics'
import { normalizeCountryIso3 } from '@/lib/lcr/countries'
import { getOrCreateCanonicalCountry } from '@/lib/aggregator/country-normalizer'
import { buildSystemOperatorInput } from '@/lib/aggregator/operator-normalizer'
import { buildSystemPlanInput, scorePlanCandidate, isValidSystemPlan } from '@/lib/aggregator/plan-normalizer'
import { validateOperatorTelecomService, validateRawOperatorPlans, extractRawPlanFields } from '@/lib/aggregator/telecom-validator'
import { CatalogIntelligenceEngine } from '@/lib/aggregator/catalog-intelligence'

import { extractPlanSignatureParts, sha256 } from '@/lib/aggregator/signature'
import type { AggregatorSyncResult } from '@/lib/aggregator/types'
import type { SyncCatalogOptions } from '@/lib/lcr/sync-options'
import { resolveSyncCountries } from '@/lib/lcr/sync-options'
import {
  aggFindSystemPlanCandidates,
  aggGetProvider,
  aggInsertSyncLog,
  aggListProviders,
  aggListRawOperators,
  aggListRawPlans,
  aggPatchProvider,
  aggUpsertDuplicateSuggestion,
  aggUpsertOperatorMapping,
  aggUpsertPlanMapping,
  aggUpsertRawOperator,
  aggUpsertRawPlan,
  aggUpsertSystemOperator,
  aggUpsertSystemPlan,
  aggUpsertFilteredOperator,
  aggCleanupSystemOperatorsWithoutPlans,
  aggStartSyncRun,
  aggUpdateSyncRun,
  aggInsertClassificationAudit,
  aggInsertClassificationReviewQueue,
  aggLoadTrustedOperators,
  aggInsertPlanClassificationAudit,
  aggInsertCatalogReviewQueue,
  aggUpsertCatalogEnrichment,
  aggPatchSystemOperatorSyncHealth,
} from '@/lib/aggregator/repository'
import { classifyOperatorByPlans, classifyOperator } from '@/lib/aggregator/telecom-classifier'
import { classifyPlan } from '@/lib/aggregator/plan-classifier'
import { supabaseRest } from '@/lib/db/supabase-rest'

function safeString(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function rawOperatorFromPlan(plan: NormalizedPlan) {
  const raw: any = plan.raw ?? {}
  const operator = raw?.operator ?? {}
  const country = operator?.country ?? {}
  const providerOperatorId = safeString(operator?.id || plan.operatorRef)
  const providerOperatorName = safeString(operator?.name || plan.operatorName || plan.operatorRef)
  return {
    providerOperatorId,
    providerOperatorName,
    countryCode: safeString(country?.iso_code || plan.countryIso3).toUpperCase() || plan.countryIso3,
    isoCode: safeString(country?.iso_code || plan.countryIso3).toUpperCase() || plan.countryIso3,
    mobileCountryCode: safeString(country?.mobile_country_code || country?.mcc) || null,
    logo: safeString(operator?.logo || operator?.logo_url) || null,
    operatorType: safeString(operator?.type || plan.service) || 'Mobile',
    currency: safeString(raw?.prices?.retail?.unit || plan.retailCurrency) || null,
    rawResponseJson: operator && Object.keys(operator).length ? operator : { operatorRef: plan.operatorRef, operatorName: plan.operatorName },
  }
}

function internalPlanCategory(plan: NormalizedPlan): string {
  const tags = (plan.tags ?? []).map((t) => t.toUpperCase())
  if (tags.includes('DATA')) return 'data'
  if (tags.includes('AIRTIME')) return 'airtime'
  if (tags.includes('VOICE') || tags.includes('SMS')) return 'combo'
  return 'topup'
}

export async function createOrGetInternalPlan(plan: NormalizedPlan) {
  const fp = fingerprintPlan(plan)
  const existing = await dbFindInternalPlanByHash(fp.normalizedHash)
  if (existing?.id) return { plan: existing, created: false }
  const created = await dbCreateInternalPlan({
    countryIso3: plan.countryIso3,
    operatorRef: plan.operatorRef,
    service: plan.service,
    subservice: plan.subservice,
    category: internalPlanCategory(plan),
    utiPlanName: plan.name || fp.canonicalSignature,
    utiDescription: plan.description,
    normalizedHash: fp.normalizedHash,
    canonicalSignature: fp.canonicalSignature,
    confidence: 'exact',
    rawResponse: plan.raw,
  })
  return { plan: created, created: Boolean(created?.id) }
}

export async function syncAggregatorProvider(
  providerId: string,
  options?: SyncCatalogOptions,
): Promise<AggregatorSyncResult> {
  const started = Date.now()
  const providerRow = await aggGetProvider(providerId)
  if (!providerRow) throw new Error('provider_not_found')
  const config: ProviderConfig = rowToProviderConfig(providerRow as any)
  const syncedCountries = resolveSyncCountries(config, options)
  if (!config.isActive) {
    return {
      providerId,
      providerCode: config.code,
      fetchedRaw: 0,
      rawOperators: 0,
      normalized: 0,
      systemOperators: 0,
      systemPlans: 0,
      mappedPlans: 0,
      duplicateSuggestions: 0,
      skippedOperators: 0,
      durationMs: Date.now() - started,
      syncedCountries,
    }
  }

  const syncStartedAt = new Date().toISOString()
  const syncRunId = await aggStartSyncRun(config.code).catch(() => null)
  await aggInsertSyncLog({
    serviceProviderId: providerId,
    syncType: 'provider',
    stage: 'full-sync',
    status: 'RUNNING',
    startedAt: syncStartedAt,
    metadata: { providerCode: config.code, syncedCountries },
  }).catch(() => {})

  try {
    const diag = createSyncDiagnostics(providerId, config.code)
    const dynamicMode = await canUseDynamicClassification().catch(() => false)
    const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
    const catalogEngine = new CatalogIntelligenceEngine(trustedOperators)
    const connector = getConnector(config.adapterKey)
    const raw = await connector.fetchRawPlans(config, { countries: syncedCountries.length ? syncedCountries : undefined })
    diag.stages.ding_api_fetch.recordsReceived = raw.length
    diag.stages.ding_api_fetch.recordsStored = raw.length

    const normalized = await connector.normalizePlans({ config, raw })
    diag.stages.normalization.recordsReceived = raw.length
    diag.stages.normalization.recordsStored = normalized.length
    diag.stages.normalization.recordsFiltered = raw.length - normalized.length

    for (const plan of normalized) {
      const rawCountry = (plan.raw as { CountryIso?: string; CountryIso3?: string }) ?? {}
      const providerCountry = String(rawCountry.CountryIso ?? rawCountry.CountryIso3 ?? plan.countryIso3 ?? '')
      
      const rawOperatorObj = (plan.raw as any)?.operator ?? {}
      const rawCountryObj = rawOperatorObj?.country ?? {}
      const canonicalCountry = await getOrCreateCanonicalCountry({
        countryName: rawCountryObj?.name || (plan.raw as any)?.countryName || (plan.raw as any)?.CountryName,
        iso2: providerCountry.length === 2 ? providerCountry : rawCountryObj?.iso_code || undefined,
        iso3: providerCountry.length === 3 ? providerCountry : rawCountryObj?.iso_code3 || undefined,
      })

      if (canonicalCountry) {
        plan.countryIso3 = canonicalCountry.id
      }

      if (diag.countryMappings.length < 20) {
        logCountryMapping(diag, providerCountry, plan.countryIso3)
      }
    }

    let rawOperators = 0
    let systemOperators = 0
    let systemPlans = 0
    let mappedPlans = 0
    let duplicateSuggestions = 0
    let createdInternalPlans = 0
    let skippedOperators = 0
    let operatorMappings = 0
    const syncWarnings: string[] = []
    const mappedSystemOperatorIds = new Set<string>()

    diag.stages.operator_classification.recordsReceived = normalized.length

    // 1. Filter plans first based on validation rules and classifier outputs
    const validPlans: NormalizedPlan[] = []
    
    for (const plan of normalized) {
      if (!isValidSystemPlan(plan)) {
        const planResult = classifyPlan(plan)
        await aggInsertClassificationAudit({
          providerCode: config.code,
          providerOperatorId: plan.operatorRef,
          providerPlanId: plan.providerPlanId,
          entityType: 'plan',
          entityName: plan.name || plan.providerPlanId,
          decision: 'REJECTED',
          classification: planResult.classification,
          confidence: planResult.confidence,
          reasonCode: 'INVALID_SYSTEM_PLAN',
          details: { reason: 'invalid_system_plan_format', retailAmount: plan.retailAmount, destinationAmount: plan.destinationAmount }
        })
        continue
      }

      const planResult = classifyPlan(plan)
      const planIntel = catalogEngine.classifyNormalizedPlan(plan)
      let planDecision = 'REJECTED'
      if (planIntel.confidenceLevel === 'CONFIRMED_NON_TELECOM' && planIntel.confidenceScore <= 0.15) {
        planDecision = 'REJECTED'
      } else if (planIntel.shouldPromote || planIntel.catalogStatus === 'ACTIVE') {
        planDecision = 'ACCEPTED'
      } else if (planIntel.catalogStatus === 'REVIEW' || planIntel.catalogStatus === 'QUARANTINED' || planResult.classification === 'UNKNOWN') {
        planDecision = 'PENDING_REVIEW'
      } else if (planResult.confidence >= 0.90 && planResult.classification !== 'UNKNOWN') {
        planDecision = 'ACCEPTED'
      } else if (planResult.confidence >= 0.60) {
        planDecision = 'PENDING_REVIEW'
      }

      await aggInsertClassificationAudit({
        providerCode: config.code,
        providerOperatorId: plan.operatorRef,
        providerPlanId: plan.providerPlanId,
        entityType: 'plan',
        entityName: plan.name || plan.providerPlanId,
        decision: planDecision,
        classification: planResult.classification,
        confidence: planResult.confidence,
        reasonCode: planResult.reasonCode,
        details: { retailAmount: plan.retailAmount, destinationAmount: plan.destinationAmount }
      })

      if (planDecision === 'ACCEPTED') {
        validPlans.push(plan)
      } else if (planDecision === 'PENDING_REVIEW') {
        await aggInsertClassificationReviewQueue({
          providerCode: config.code,
          providerOperatorId: plan.operatorRef,
          providerPlanId: plan.providerPlanId,
          entityType: 'plan',
          entityName: plan.name || plan.providerPlanId,
          category: planResult.classification,
          subCategory: plan.subcategory,
          benefits: plan.benefits,
          rawPayload: plan.raw,
          confidence: planResult.confidence,
        })
      }
    }

    // Group ALL raw plans by operator for ratio and dominance analysis (Telecom Service Validation Gate)
    const allPlansByOperatorId = new Map<string, NormalizedPlan[]>()
    for (const plan of normalized) {
      const op = rawOperatorFromPlan(plan)
      if (!op.providerOperatorId) continue
      if (!allPlansByOperatorId.has(op.providerOperatorId)) {
        allPlansByOperatorId.set(op.providerOperatorId, [])
      }
      allPlansByOperatorId.get(op.providerOperatorId)!.push(plan)
    }

    // 2. Group valid plans by operator
    const plansByOperatorId = new Map<string, { op: ReturnType<typeof rawOperatorFromPlan>; plans: NormalizedPlan[] }>()
    for (const plan of validPlans) {
      const op = rawOperatorFromPlan(plan)
      if (!op.providerOperatorId) continue
      if (!plansByOperatorId.has(op.providerOperatorId)) {
        plansByOperatorId.set(op.providerOperatorId, { op, plans: [] })
      }
      plansByOperatorId.get(op.providerOperatorId)!.plans.push(plan)
    }

    // 3. Classify operators and check capabilities
    let capabilities: string[] = []
    try {
      const capRes = await supabaseRest(`provider_catalog_profiles?provider_code=eq.${config.code}&limit=1`, { cache: 'no-store' })
      if (capRes.ok) {
        const cap = await capRes.json() as any[]
        if (cap && cap.length > 0) {
          capabilities = cap[0].supported_categories || []
        }
      }
    } catch (err) {
      console.error('Failed to load provider capabilities:', err)
    }

    const approvedOperators = new Map<string, { op: ReturnType<typeof rawOperatorFromPlan>; plans: NormalizedPlan[]; telecomOperatorName: string }>()

    for (const [operatorId, data] of plansByOperatorId.entries()) {
      const opResult = await classifyOperator(
        config.code,
        operatorId,
        data.op.providerOperatorName,
        data.op.countryCode,
        data.plans,
        capabilities
      )

      let opDecision = 'REJECTED'
      if (opResult.confidence >= 0.90 && opResult.classification === 'TELECOM') {
        opDecision = 'ACCEPTED'
      } else if (opResult.confidence >= 0.60 || opResult.classification === 'UNKNOWN') {
        opDecision = 'PENDING_REVIEW'
      }

      // --- Catalog intelligence operator promotion (soft filtering) ---
      const allOperatorPlans = allPlansByOperatorId.get(operatorId) || []
      const promotionEval = catalogEngine.evaluateOperatorPromotion({
        operatorName: data.op.providerOperatorName,
        countryCode: data.op.countryCode,
        rawPlans: allOperatorPlans.map((p) => p.raw ?? p),
      })

      let finalOpDecision = opDecision
      let finalReasonCode = opResult.reasonCode

      if (promotionEval.shouldPromote) {
        finalOpDecision = 'ACCEPTED'
        finalReasonCode = promotionEval.reasons.join(',') || 'CATALOG_INTELLIGENCE_PROMOTE'
      } else if (promotionEval.shouldDeactivate) {
        finalOpDecision = 'REJECTED'
        finalReasonCode = promotionEval.reasons[0] || 'STRONG_NON_TELECOM'
      } else if (finalOpDecision === 'ACCEPTED' && promotionEval.telecomPlanCount === 0 && !promotionEval.trustedOperator) {
        finalOpDecision = 'PENDING_REVIEW'
        finalReasonCode = 'UNCERTAIN_TELECOM_OPERATOR'
      } else if (finalOpDecision === 'REJECTED' && promotionEval.telecomPlanCount > 0) {
        finalOpDecision = 'PENDING_REVIEW'
        finalReasonCode = 'SOFT_PROMOTE_UNCERTAIN'
      }
      // ----------------------------------------------------------------

      await aggInsertClassificationAudit({
        providerCode: config.code,
        providerOperatorId: operatorId,
        entityType: 'operator',
        entityName: data.op.providerOperatorName,
        decision: finalOpDecision,
        classification: finalOpDecision === 'ACCEPTED' ? opResult.classification : 'UNKNOWN',
        confidence: promotionEval.confidenceScore,
        reasonCode: finalReasonCode || opResult.reasonCode || 'UNKNOWN',
        details: {
          countryCode: data.op.countryCode,
          telecomPlanCount: promotionEval.telecomPlanCount,
          totalPlanCount: promotionEval.totalPlanCount,
          telecomRatio: promotionEval.telecomRatio,
          trustedOperator: promotionEval.trustedOperator,
          promotionReasons: promotionEval.reasons,
          confidenceLevel: promotionEval.confidenceLevel,
        }
      })

      if (finalOpDecision === 'ACCEPTED') {
        // Resolve canonical name
        let telecomOperatorName = data.op.providerOperatorName
        try {
          const normName = data.op.providerOperatorName.trim().toUpperCase()
          const catRes = await supabaseRest(`telecom_reference_catalog?operator_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
          if (catRes.ok) {
            const cat = await catRes.json()
            if (cat && cat.length > 0) {
              telecomOperatorName = cat[0].operator_name
            }
          }
        } catch (err) {
          console.error('Failed to resolve operator name from reference catalog:', err)
        }

        approvedOperators.set(operatorId, {
          op: data.op,
          plans: data.plans,
          telecomOperatorName
        })
      } else {
        skippedOperators += 1
        diag.stages.operator_classification.recordsRejected += 1
        const warning = `Skipped operator "${data.op.providerOperatorName}" (${data.op.countryCode}) - Classification: ${opResult.classification}, Decision: ${finalOpDecision}, Reason: ${finalReasonCode}`
        syncWarnings.push(warning)

        // Store details in agg_filtered_operators only for strong non-telecom rejections
        if (finalOpDecision === 'REJECTED' && promotionEval.shouldDeactivate) {
          try {
            const rawOperator = await aggUpsertRawOperator({
              serviceProviderId: providerId,
              providerOperatorId: operatorId,
              providerOperatorName: data.op.providerOperatorName,
              countryCode: data.op.countryCode,
              isoCode: data.op.isoCode,
              mobileCountryCode: data.op.mobileCountryCode,
              logo: data.op.logo,
              operatorType: 'DIGITAL_PRODUCT',
              currency: data.op.currency,
              rawResponseJson: data.op.rawResponseJson,
              checksumHash: sha256(JSON.stringify(data.op.rawResponseJson)),
              status: 'inactive',
            })
            if (rawOperator?.id) {
              await aggUpsertFilteredOperator({
                providerId,
                rawOperatorId: rawOperator.id,
                rawOperatorName: data.op.providerOperatorName,
                filterReason: finalReasonCode,
                classificationScore: promotionEval.confidenceScore,
              })
            }
          } catch (err) {
            console.error('Failed to write to agg_filtered_operators:', err)
          }
        }

        if (finalOpDecision === 'PENDING_REVIEW') {
          await aggInsertClassificationReviewQueue({
            providerCode: config.code,
            providerOperatorId: operatorId,
            entityType: 'operator',
            entityName: data.op.providerOperatorName,
            category: opResult.classification,
            rawPayload: data.op.rawResponseJson,
            confidence: opResult.confidence,
          })
        }
      }
    }

    // 4. Promote operators and plans to system_operators and system_plans
    for (const [operatorId, approvedData] of approvedOperators.entries()) {
      const { op, plans, telecomOperatorName } = approvedData

      const rawOperator = await aggUpsertRawOperator({
        serviceProviderId: providerId,
        providerOperatorId: operatorId,
        providerOperatorName: op.providerOperatorName,
        countryCode: op.countryCode,
        isoCode: op.isoCode,
        mobileCountryCode: op.mobileCountryCode,
        logo: op.logo,
        operatorType: 'TELECOM',
        currency: op.currency,
        rawResponseJson: op.rawResponseJson,
        checksumHash: sha256(JSON.stringify(op.rawResponseJson)),
      })
      if (!rawOperator?.id) continue
      rawOperators += 1
      diag.uniqueRawOperatorIds.add(operatorId)
      diag.stages.raw_operator_store.recordsStored = diag.uniqueRawOperatorIds.size

      let systemOperatorId: string | null = null
      
      // Look up operator alias first
      try {
        const normName = op.providerOperatorName.trim().toUpperCase()
        const aliasRes = await supabaseRest(`operator_aliases?alias_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
        if (aliasRes.ok) {
          const alias = await aliasRes.json()
          if (alias && alias.length > 0 && alias[0].system_operator_id) {
            systemOperatorId = alias[0].system_operator_id
          }
        }
      } catch (err) {
        console.error('Failed to look up operator alias:', err)
      }

      if (!systemOperatorId) {
        const systemOperatorInput = buildSystemOperatorInput(plans[0], telecomOperatorName)
        const systemOperator = await aggUpsertSystemOperator(systemOperatorInput)
        if (systemOperator?.id) {
          systemOperatorId = systemOperator.id
          systemOperators += 1
          diag.stages.system_operator_create.recordsStored = systemOperators
        }
      } else {
        systemOperators += 1
        diag.stages.system_operator_create.recordsStored = systemOperators
      }

      if (!systemOperatorId) continue

      const mapping = await aggUpsertOperatorMapping({
        serviceProviderId: providerId,
        providerOperatorRawId: rawOperator.id,
        systemOperatorId,
        mappingConfidence: telecomOperatorName === op.providerOperatorName ? 92 : 78,
        mappingType: 'AUTO',
        isVerified: false,
      })

      // Update provider_operator_id on the mapping row
      if (mapping?.id) {
        await supabaseRest(`operator_mappings?id=eq.${mapping.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ provider_operator_id: operatorId }),
        }).catch(() => {})

        operatorMappings += 1
        mappedSystemOperatorIds.add(systemOperatorId)
        diag.stages.operator_mapping.recordsMapped = mappedSystemOperatorIds.size
      }

      const operatorPromotion = catalogEngine.evaluateOperatorPromotion({
        operatorName: telecomOperatorName,
        countryCode: op.countryCode,
        rawPlans: plans.map((p) => p.raw ?? p),
      })
      await aggPatchSystemOperatorSyncHealth(systemOperatorId, {
        lastValidSyncAt: new Date().toISOString(),
        failedSyncCount: 0,
        confidenceLevel: operatorPromotion.confidenceLevel,
        isTrustedTelecom: operatorPromotion.trustedOperator,
        status: 'ACTIVE',
      }).catch(() => {})

      for (const plan of plans) {
        const planForInternal: NormalizedPlan = {
          ...plan,
          operatorRef: `system:${systemOperatorId}`,
          operatorName: telecomOperatorName,
        }

        const internal = await createOrGetInternalPlan(planForInternal)
        if (!internal.plan?.id) continue
        if (internal.created) createdInternalPlans += 1

        const parts = extractPlanSignatureParts(plan)
        const planIntel = catalogEngine.classifyNormalizedPlan(plan, telecomOperatorName, op.countryCode)
        const rawPlan = await aggUpsertRawPlan({
          providerId,
          providerPlanId: plan.providerPlanId,
          providerOperatorRawId: rawOperator.id,
          providerPlanName: plan.name ?? null,
          providerPlanCode: plan.providerPlanId,
          amount: plan.retailAmount ?? plan.destinationAmount ?? null,
          currency: plan.retailCurrency ?? null,
          validity: plan.validityDays ? `${plan.validityDays}D` : null,
          talktime: parts.talktime || null,
          dataVolume: parts.data || null,
          sms: parts.sms || null,
          description: plan.description ?? null,
          planType: plan.planType ?? null,
          benefitsJson: plan.benefits,
          rawJson: plan.raw,
          checksumHash: sha256(JSON.stringify(plan.raw)),
          status: planIntel.catalogStatus === 'ACTIVE' ? 'active' : planIntel.catalogStatus.toLowerCase(),
          rawQualityScore: planIntel.rawQuality.rawQualityScore,
          hasDescription: planIntel.rawQuality.hasDescription,
          hasBenefits: planIntel.rawQuality.hasBenefits,
          hasCategory: planIntel.rawQuality.hasCategory,
          hasAmount: planIntel.rawQuality.hasAmount,
          hasValidity: planIntel.rawQuality.hasValidity,
          hasCurrency: planIntel.rawQuality.hasCurrency,
          rawCompletenessPercent: planIntel.rawQuality.rawCompletenessPercent,
          catalogStatus: planIntel.catalogStatus,
          confidenceLevel: planIntel.confidenceLevel,
          confidenceScore: planIntel.confidenceScore,
        })
        if (!rawPlan?.id) continue

        await aggUpsertCatalogEnrichment({
          providerPlanRawId: rawPlan.id,
          normalizedTitle: planIntel.enrichment.normalizedTitle,
          normalizedDescription: planIntel.enrichment.normalizedDescription,
          inferredServiceType: planIntel.enrichment.inferredServiceType ?? null,
          inferredSubservice: planIntel.enrichment.inferredSubservice ?? null,
          inferredValidity: planIntel.enrichment.inferredValidity ?? null,
          inferredDataMb: planIntel.enrichment.inferredDataMb ?? null,
          inferredTalktime: planIntel.enrichment.inferredTalktime ?? null,
          inferredSms: planIntel.enrichment.inferredSms ?? null,
          confidenceScore: planIntel.enrichment.confidenceScore,
          enrichmentSource: planIntel.enrichment.enrichmentSource,
        }).catch(() => {})

        await aggInsertPlanClassificationAudit({
          providerCode: config.code,
          providerPlanRawId: rawPlan.id,
          providerOperatorId: operatorId,
          providerPlanId: plan.providerPlanId,
          classification: planIntel.confidenceLevel,
          confidenceLevel: planIntel.confidenceLevel,
          confidenceScore: planIntel.confidenceScore,
          catalogStatus: planIntel.catalogStatus,
          matchedKeywords: planIntel.matchedKeywords,
          confidenceBreakdown: planIntel.layerScores,
          rejectionReason: planIntel.rejectionReason ?? null,
          syncRunId,
        }).catch(() => {})

        if (planIntel.shouldQuarantine) {
          await aggInsertCatalogReviewQueue({
            providerCode: config.code,
            providerOperatorId: operatorId,
            providerPlanId: plan.providerPlanId,
            providerPlanRawId: rawPlan.id,
            entityType: 'plan',
            entityName: plan.name || plan.providerPlanId,
            confidenceLevel: planIntel.confidenceLevel,
            confidenceScore: planIntel.confidenceScore,
            classification: planIntel.confidenceLevel,
            catalogStatus: planIntel.catalogStatus,
            rawPayload: plan.raw,
            notes: planIntel.rejectionReason ?? null,
          }).catch(() => {})
        }

        if (planIntel.catalogStatus === 'NON_TELECOM' && planIntel.confidenceLevel === 'CONFIRMED_NON_TELECOM') {
          continue
        }

        const candidates = await aggFindSystemPlanCandidates({
          systemOperatorId,
          amount: plan.retailAmount ?? plan.destinationAmount ?? null,
          currency: plan.retailCurrency ?? null,
        })
        const duplicateCandidates = candidates
          .map((candidate) => scorePlanCandidate(plan, candidate))
          .filter(Boolean) as Array<ReturnType<typeof scorePlanCandidate> & { systemPlanId: string }>

        const systemPlan = await aggUpsertSystemPlan(
          buildSystemPlanInput({
            plan,
            systemOperatorId,
            internalPlanId: internal.plan.id,
          }),
        )
        if (systemPlan?.id) {
          await supabaseRest(`system_plans?id=eq.${systemPlan.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              catalog_status: planIntel.catalogStatus,
              confidence_level: planIntel.confidenceLevel,
              confidence_score: planIntel.confidenceScore,
              status: planIntel.catalogStatus === 'NON_TELECOM' ? 'INACTIVE' : 'ACTIVE',
            }),
          }).catch(() => {})
          systemPlans += 1

          const planMap = await aggUpsertPlanMapping({
            serviceProviderId: providerId,
            providerPlanRawId: rawPlan.id,
            systemPlanId: systemPlan.id,
            matchingScore: 95,
            matchingReason: 'Automatic normalized signature match',
            isVerified: false,
          })

          if (planMap?.id) {
            // Update provider_plan_id on the mapping row
            await supabaseRest(`plan_mappings?id=eq.${planMap.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ provider_plan_id: plan.providerPlanId }),
            }).catch(() => {})

            mappedPlans += 1
          }

          for (const candidate of duplicateCandidates) {
            if (!candidate || candidate.systemPlanId === systemPlan.id) continue
            await aggUpsertDuplicateSuggestion({
              serviceProviderId: providerId,
              providerPlanRawId: rawPlan.id,
              suggestedSystemPlanId: candidate.systemPlanId,
              matchScore: candidate.score,
              matchReason: candidate.reason,
              benefitsComparison: candidate.comparison,
            })
            duplicateSuggestions += 1
          }
        }

        await dbUpsertInternalPlanMapping({
          internalPlanId: internal.plan.id,
          providerId,
          providerPlanId: plan.providerPlanId,
          providerPrice: plan.retailAmount,
          providerCurrency: plan.retailCurrency,
          providerPriority: config.priority,
          margin: 0,
          enabled: true,
        })
      }
    }

    diag.stages.plan_mapping.recordsMapped = mappedPlans
    printPipelineReport(diag)

    // Cleanup operators without plans
    try {
      await aggCleanupSystemOperatorsWithoutPlans()
    } catch (cleanupErr) {
      console.error('Failed to cleanup operators without plans:', cleanupErr)
    }

    const durationMs = Date.now() - started
    const result: AggregatorSyncResult = {
      providerId,
      providerCode: config.code,
      fetchedRaw: raw.length,
      rawOperators,
      normalized: normalized.length,
      systemOperators,
      systemPlans,
      mappedPlans,
      duplicateSuggestions,
      skippedOperators,
      operatorMappings,
      durationMs,
      syncedCountries,
      warnings: syncWarnings.length ? syncWarnings.slice(0, 100) : undefined,
      diagnostics: summarizeDiagnostics(diag),
    }

    if (syncRunId) {
      await aggUpdateSyncRun(syncRunId, {
        status: 'success',
        finished_at: new Date().toISOString(),
        operators_fetched: rawOperators,
        operators_accepted: systemOperators,
        operators_rejected: skippedOperators,
        plans_fetched: normalized.length,
        plans_accepted: systemPlans,
        plans_rejected: normalized.length - systemPlans,
      }).catch(() => {})
    }

    await Promise.all([
      aggPatchProvider(providerId, {
        last_sync_at: new Date().toISOString(),
        last_success_sync_at: new Date().toISOString(),
        status: 'online',
      }).catch(() => {}),
      aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: 'full-sync',
        status: 'SUCCESS',
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        fetchedCount: raw.length,
        normalizedCount: normalized.length,
        createdCount: createdInternalPlans,
        mappedCount: mappedPlans,
        duplicateCount: duplicateSuggestions,
        metadata: result,
      }).catch(() => {}),
      cacheDelByPrefix('catalog:').catch(() => 0),
      cacheDelByPrefix('aggregator:').catch(() => 0),
    ])

    return result
  } catch (error) {
    const durationMs = Date.now() - started
    if (syncRunId) {
      await aggUpdateSyncRun(syncRunId, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'sync_failed',
      }).catch(() => {})
    }
    await Promise.all([
      aggPatchProvider(providerId, {
        last_sync_at: new Date().toISOString(),
        status: 'degraded',
      }).catch(() => {}),
      aggInsertSyncLog({
        serviceProviderId: providerId,
        syncType: 'provider',
        stage: 'full-sync',
        status: 'FAILED',
        startedAt: syncStartedAt,
        finishedAt: new Date().toISOString(),
        durationMs,
        errorMessage: error instanceof Error ? error.message : 'sync_failed',
      }).catch(() => {}),
    ])
    throw error
  }
}

export function rawPlanToNormalized(raw: any, systemOperatorId: string, telecomOperatorName: string, providerId: string): NormalizedPlan {
  const fields = extractRawPlanFields(raw.raw_json || raw.row_json || raw.raw || raw)
  return {
    providerId,
    providerCode: 'LOCAL_SYNC',
    providerPlanId: String(raw.provider_plan_id || raw.providerPlanId || ''),
    countryIso3: String(raw.country_code || raw.iso_code || 'UNK'),
    operatorRef: `system:${systemOperatorId}`,
    operatorName: telecomOperatorName,
    service: fields.serviceName || (fields.type === 'DATA' || String(fields.type).toUpperCase().includes('DATA') ? 'Data' : 'Mobile'),
    subservice: fields.subserviceName || undefined,
    name: fields.productName || fields.description || 'Plan',
    description: fields.description || '',
    category: fields.type || fields.serviceName || 'Mobile',
    subcategory: fields.subserviceName || '',
    planType: fields.type || 'Plan',
    benefits: fields.benefits.map((b: any) => ({
      type: String(b.type || b.benefitType || '').toUpperCase(),
      amountBase: Number(b.amountBase || b.amount || 0),
      unit: String(b.unit || '').toUpperCase()
    })),
    requiredFields: [],
    retailAmount: Number(raw.amount || raw.retailAmount || 0),
    retailCurrency: String(raw.currency || raw.retailCurrency || 'USD'),
    validityDays: parseInt(String(raw.validity || '').replace(/\D/g, '')) || undefined,
    raw: raw.raw_json || raw.row_json || raw.raw || raw
  }
}

export async function runLocalOperatorSync(providerId?: string) {
  console.log(`[Local Sync] Starting local operator sync...`)
  const trustedOperators = await aggLoadTrustedOperators().catch(() => [])
  const catalogEngine = new CatalogIntelligenceEngine(trustedOperators)
  const providers = await aggListProviders()
  const activeProviders = providerId && providerId !== 'ALL'
    ? providers.filter(p => p.id === providerId)
    : providers.filter(p => p.is_active)

  for (const provider of activeProviders) {
    const rawOps = await aggListRawOperators({ providerId: provider.id, limit: 10000 })
    console.log(`[Local Sync] Found ${rawOps.length} raw operators for provider ${provider.name}`)

    for (const rawOp of rawOps) {
      try {
        const rawPlans = await aggListRawPlans({ operatorRawId: rawOp.id, limit: 1000 })
        const validation = validateRawOperatorPlans(rawPlans, {
          operatorName: rawOp.provider_operator_name,
          countryCode: rawOp.country_code || rawOp.iso_code,
          engine: catalogEngine,
        })

        if (!validation.passed && validation.promotion?.shouldDeactivate) {
          const mappingRes = await supabaseRest(`operator_mappings?provider_operator_raw_id=eq.${rawOp.id}&select=system_operator_id`, { cache: 'no-store' })
          if (mappingRes.ok) {
            const mappings = await mappingRes.json()
            if (mappings && mappings.length > 0) {
              const sysOpId = mappings[0].system_operator_id
              const failedSyncCount = Number((await supabaseRest(`system_operators?id=eq.${sysOpId}&select=failed_sync_count&limit=1`, { cache: 'no-store' }).then(r => r.json()).catch(() => [{}]))[0]?.failed_sync_count ?? 0) + 1
              await aggPatchSystemOperatorSyncHealth(sysOpId, {
                failedSyncCount,
                status: failedSyncCount >= 3 ? 'INACTIVE' : undefined,
              })
            }
          }
          continue
        }

        // Resolve Name
        let telecomOperatorName = rawOp.provider_operator_name
        const normName = rawOp.provider_operator_name.trim().toUpperCase()
        const catRes = await supabaseRest(`telecom_reference_catalog?operator_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
        if (catRes.ok) {
          const cat = await catRes.json()
          if (cat && cat.length > 0) {
            telecomOperatorName = cat[0].operator_name
          }
        }

        // Resolve System Operator ID
        let systemOperatorId: string | null = null
        const aliasRes = await supabaseRest(`operator_aliases?alias_name=eq.${encodeURIComponent(normName)}&limit=1`, { cache: 'no-store' })
        if (aliasRes.ok) {
          const alias = await aliasRes.json()
          if (alias && alias.length > 0 && alias[0].system_operator_id) {
            systemOperatorId = alias[0].system_operator_id
          }
        }

        if (!systemOperatorId) {
          const country = rawOp.country_code || rawOp.iso_code || 'UNK'
          const dummyPlan = { countryIso3: country, operatorName: telecomOperatorName } as any
          const input = buildSystemOperatorInput(dummyPlan, telecomOperatorName)
          if (input) {
            const sysOp = await aggUpsertSystemOperator(input)
            if (sysOp?.id) {
              systemOperatorId = sysOp.id
            }
          }
        }

        if (systemOperatorId) {
          // Mapping
          await aggUpsertOperatorMapping({
            serviceProviderId: provider.id,
            providerOperatorRawId: rawOp.id,
            systemOperatorId,
            mappingConfidence: 100,
            mappingType: 'AUTO',
            isVerified: false
          })

          // Slowly update plans in background
          for (const rawPlan of rawPlans) {
            const planForInternal = rawPlanToNormalized(rawPlan, systemOperatorId, telecomOperatorName, provider.id)
            const internal = await createOrGetInternalPlan(planForInternal)
            if (internal.plan?.id) {
              const systemPlan = await aggUpsertSystemPlan(
                buildSystemPlanInput({
                  plan: planForInternal,
                  systemOperatorId,
                  internalPlanId: internal.plan.id
                })
              )
              if (systemPlan?.id) {
                await aggUpsertPlanMapping({
                  serviceProviderId: provider.id,
                  providerPlanRawId: rawPlan.id,
                  systemPlanId: systemPlan.id,
                  matchingScore: 100,
                  matchingReason: 'Local operator sync',
                  isVerified: false
                })
              }
            }
            // Sleep 5ms between plans to proceed slowly
            await new Promise(r => setTimeout(r, 5))
          }
        }
      } catch (opErr) {
        console.error(`[Local Sync] Failed to sync operator ${rawOp.provider_operator_name}:`, opErr)
      }
    }
  }
  console.log(`[Local Sync] Local operator sync completed.`)
}
